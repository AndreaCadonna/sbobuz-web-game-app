/**
 * Leaderboard Repository — PostgreSQL persistence for player ratings.
 *
 * Uses typed queries (no ORM) against the `ratings` and `match_results` tables.
 *
 * @see server/src/infra/database/migrations/007_create_ratings.sql
 * @see server/src/infra/database/migrations/008_create_match_results.sql
 */

import { getPool } from '../../infra/database/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import type {
  PlayerRating,
  LeaderboardEntry,
  RatingUpdate,
} from './leaderboard.types.js';
import { INITIAL_RATING } from './rating-service.js';

const logger = createModuleLogger('leaderboard');

// ---------------------------------------------------------------------------
// Rating Queries
// ---------------------------------------------------------------------------

/**
 * Get a player's rating record, creating one if it doesn't exist.
 *
 * @param userId - The player's user ID.
 * @returns The player's rating record.
 */
export async function getOrCreateRating(userId: string): Promise<PlayerRating> {
  const pool = getPool();

  // Try to get existing rating
  const result = await pool.query<{
    user_id: string;
    rating: number;
    peak_rating: number;
    games_played: number;
    games_won: number;
    games_lost: number;
    win_streak: number;
    best_win_streak: number;
    last_game_at: string | null;
  }>(
    'SELECT user_id, rating, peak_rating, games_played, games_won, games_lost, win_streak, best_win_streak, last_game_at FROM ratings WHERE user_id = $1',
    [userId],
  );

  if (result.rows.length > 0) {
    const row = result.rows[0]!;
    return {
      userId: row.user_id,
      rating: row.rating,
      peakRating: row.peak_rating,
      gamesPlayed: row.games_played,
      gamesWon: row.games_won,
      gamesLost: row.games_lost,
      winStreak: row.win_streak,
      bestWinStreak: row.best_win_streak,
      lastGameAt: row.last_game_at,
    };
  }

  // Create new rating record
  await pool.query(
    `INSERT INTO ratings (user_id, rating, peak_rating) VALUES ($1, $2, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, INITIAL_RATING],
  );

  return {
    userId,
    rating: INITIAL_RATING,
    peakRating: INITIAL_RATING,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    winStreak: 0,
    bestWinStreak: 0,
    lastGameAt: null,
  };
}

/**
 * Get rating records for multiple players.
 *
 * @param userIds - The player IDs.
 * @returns Map of userId -> PlayerRating.
 */
export async function getRatings(
  userIds: ReadonlyArray<string>,
): Promise<Map<string, PlayerRating>> {
  const ratings = new Map<string, PlayerRating>();

  for (const userId of userIds) {
    const rating = await getOrCreateRating(userId);
    ratings.set(userId, rating);
  }

  return ratings;
}

/**
 * Apply a rating update to the database.
 *
 * @param update - The rating update to apply.
 * @param isWin - Whether this player won the game.
 * @param playedAt - When the game was played.
 */
export async function applyRatingUpdate(
  update: RatingUpdate,
  isWin: boolean,
  playedAt: string,
): Promise<void> {
  const pool = getPool();

  const newWinStreak = isWin ? 'win_streak + 1' : '0';
  const bestWinStreakExpr = isWin
    ? 'GREATEST(best_win_streak, win_streak + 1)'
    : 'best_win_streak';

  await pool.query(
    `UPDATE ratings SET
       rating = $2,
       peak_rating = GREATEST(peak_rating, $2),
       games_played = games_played + 1,
       games_won = games_won + $3,
       games_lost = games_lost + $4,
       win_streak = ${newWinStreak},
       best_win_streak = ${bestWinStreakExpr},
       last_game_at = $5,
       updated_at = NOW()
     WHERE user_id = $1`,
    [
      update.userId,
      update.ratingAfter,
      isWin ? 1 : 0,
      isWin ? 0 : 1,
      playedAt,
    ],
  );
}

/**
 * Record a match result for a player.
 *
 * @param gameId - The game ID.
 * @param update - The rating update.
 * @param isWin - Whether the player won.
 * @param placement - The player's placement (1 = winner).
 * @param opponents - IDs of opponents.
 * @param durationSeconds - Game duration.
 * @param playedAt - When the game was played.
 */
export async function recordMatchResult(
  gameId: string,
  update: RatingUpdate,
  isWin: boolean,
  placement: number,
  opponents: ReadonlyArray<string>,
  durationSeconds: number,
  playedAt: string,
): Promise<void> {
  const pool = getPool();

  await pool.query(
    `INSERT INTO match_results
       (game_id, user_id, result, rating_before, rating_after, rating_change, placement, opponents, game_duration_seconds, played_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      gameId,
      update.userId,
      isWin ? 'win' : 'loss',
      update.ratingBefore,
      update.ratingAfter,
      update.ratingChange,
      placement,
      opponents,
      durationSeconds,
      playedAt,
    ],
  );
}

// ---------------------------------------------------------------------------
// Leaderboard Queries
// ---------------------------------------------------------------------------

/**
 * Get the top N players on the leaderboard.
 *
 * @param limit - Maximum number of entries to return.
 * @param offset - Number of entries to skip.
 * @returns Array of leaderboard entries with rank.
 */
export async function getTopPlayers(
  limit: number = 50,
  offset: number = 0,
): Promise<LeaderboardEntry[]> {
  const pool = getPool();

  const result = await pool.query<{
    user_id: string;
    username: string;
    rating: number;
    games_played: number;
    games_won: number;
    rank: string;
  }>(
    `SELECT
       r.user_id,
       u.username,
       r.rating,
       r.games_played,
       r.games_won,
       ROW_NUMBER() OVER (ORDER BY r.rating DESC) as rank
     FROM ratings r
     JOIN users u ON u.id = r.user_id
     WHERE r.games_played > 0
     ORDER BY r.rating DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return result.rows.map((row) => ({
    rank: parseInt(row.rank, 10),
    userId: row.user_id,
    username: row.username,
    rating: row.rating,
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    winRate: row.games_played > 0
      ? Math.round((row.games_won / row.games_played) * 100) / 100
      : 0,
  }));
}

/**
 * Get a player's rank on the leaderboard.
 *
 * @param userId - The player's user ID.
 * @returns The player's leaderboard entry with rank, or null if not found.
 */
export async function getPlayerRank(userId: string): Promise<LeaderboardEntry | null> {
  const pool = getPool();

  const result = await pool.query<{
    user_id: string;
    username: string;
    rating: number;
    games_played: number;
    games_won: number;
    rank: string;
  }>(
    `SELECT sub.user_id, sub.username, sub.rating, sub.games_played, sub.games_won, sub.rank
     FROM (
       SELECT
         r.user_id,
         u.username,
         r.rating,
         r.games_played,
         r.games_won,
         ROW_NUMBER() OVER (ORDER BY r.rating DESC) as rank
       FROM ratings r
       JOIN users u ON u.id = r.user_id
       WHERE r.games_played > 0
     ) sub
     WHERE sub.user_id = $1`,
    [userId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  return {
    rank: parseInt(row.rank, 10),
    userId: row.user_id,
    username: row.username,
    rating: row.rating,
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    winRate: row.games_played > 0
      ? Math.round((row.games_won / row.games_played) * 100) / 100
      : 0,
  };
}

/**
 * Get players near a specific player's rank (for context).
 *
 * @param userId - The target player's user ID.
 * @param range - Number of players above and below to include.
 * @returns Array of leaderboard entries around the player.
 */
export async function getNearbyRanks(
  userId: string,
  range: number = 5,
): Promise<LeaderboardEntry[]> {
  const pool = getPool();

  // First get the player's rating
  const ratingResult = await pool.query<{ rating: number }>(
    'SELECT rating FROM ratings WHERE user_id = $1',
    [userId],
  );

  if (ratingResult.rows.length === 0) return [];

  const playerRating = ratingResult.rows[0]!.rating;

  // Get players around that rating
  const result = await pool.query<{
    user_id: string;
    username: string;
    rating: number;
    games_played: number;
    games_won: number;
    rank: string;
  }>(
    `SELECT sub.user_id, sub.username, sub.rating, sub.games_played, sub.games_won, sub.rank
     FROM (
       SELECT
         r.user_id,
         u.username,
         r.rating,
         r.games_played,
         r.games_won,
         ROW_NUMBER() OVER (ORDER BY r.rating DESC) as rank
       FROM ratings r
       JOIN users u ON u.id = r.user_id
       WHERE r.games_played > 0
     ) sub
     WHERE sub.rating BETWEEN $1 AND $2
     ORDER BY sub.rating DESC
     LIMIT $3`,
    [playerRating - range * 50, playerRating + range * 50, range * 2 + 1],
  );

  return result.rows.map((row) => ({
    rank: parseInt(row.rank, 10),
    userId: row.user_id,
    username: row.username,
    rating: row.rating,
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    winRate: row.games_played > 0
      ? Math.round((row.games_won / row.games_played) * 100) / 100
      : 0,
  }));
}

/**
 * Get a player's match history.
 *
 * @param userId - The player's user ID.
 * @param limit - Maximum number of results to return.
 * @returns Array of match results.
 */
export async function getMatchHistory(
  userId: string,
  limit: number = 20,
): Promise<Array<{
  gameId: string;
  result: 'win' | 'loss';
  ratingChange: number;
  ratingAfter: number;
  playedAt: string;
}>> {
  const pool = getPool();

  const result = await pool.query<{
    game_id: string;
    result: 'win' | 'loss';
    rating_change: number;
    rating_after: number;
    played_at: string;
  }>(
    `SELECT game_id, result, rating_change, rating_after, played_at
     FROM match_results
     WHERE user_id = $1
     ORDER BY played_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  return result.rows.map((row) => ({
    gameId: row.game_id,
    result: row.result,
    ratingChange: row.rating_change,
    ratingAfter: row.rating_after,
    playedAt: row.played_at,
  }));
}
