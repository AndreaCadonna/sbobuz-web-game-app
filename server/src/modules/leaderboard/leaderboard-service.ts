/**
 * Leaderboard Service — orchestrates rating updates and leaderboard queries.
 *
 * Coordinates between the rating calculation (pure math) and the repository
 * (database persistence) when a game completes.
 *
 * @see server/src/modules/leaderboard/rating-service.ts
 * @see server/src/modules/leaderboard/repository.ts
 */

import { createModuleLogger } from '../../shared/logger.js';

import type { GameResultInput, LeaderboardEntry } from './leaderboard.types.js';
import { calculateMultiplayerRatings } from './rating-service.js';
import {
  getRatings,
  applyRatingUpdate,
  recordMatchResult,
  getTopPlayers,
  getPlayerRank,
  getNearbyRanks,
  getMatchHistory,
} from './repository.js';

const logger = createModuleLogger('leaderboard');

// ---------------------------------------------------------------------------
// Game Result Processing
// ---------------------------------------------------------------------------

/**
 * Process a completed game result.
 *
 * Fetches current ratings for all players, calculates ELO changes,
 * and persists the updates to the database.
 *
 * @param input - The game result data.
 */
export async function processGameResult(input: GameResultInput): Promise<void> {
  const { gameId, winnerId, playerIds, playedAt, durationSeconds } = input;

  // Filter out AI players (they don't have ratings)
  const humanPlayerIds = playerIds.filter(id => !id.startsWith('ai_'));

  if (humanPlayerIds.length < 2) {
    logger.info({ gameId }, 'Skipping rating update: fewer than 2 human players');
    return;
  }

  // Check if the winner is a human (AI wins don't affect ratings)
  if (winnerId.startsWith('ai_')) {
    logger.info({ gameId, winnerId }, 'Skipping rating update: AI winner');
    return;
  }

  // Fetch current ratings
  const playerRatings = await getRatings(humanPlayerIds);
  const ratingMap = new Map(
    [...playerRatings.entries()].map(([id, r]) => [id, { rating: r.rating, gamesPlayed: r.gamesPlayed }]),
  );

  // Calculate new ratings
  const updates = calculateMultiplayerRatings(winnerId, ratingMap);

  // Apply updates
  for (const update of updates) {
    const isWin = update.userId === winnerId;
    const opponents = humanPlayerIds.filter(id => id !== update.userId);
    const placement = isWin ? 1 : 2; // Simplified: winner = 1, losers = 2

    await applyRatingUpdate(update, isWin, playedAt);
    await recordMatchResult(
      gameId,
      update,
      isWin,
      placement,
      opponents,
      durationSeconds,
      playedAt,
    );
  }

  logger.info(
    {
      gameId,
      winnerId,
      playerCount: humanPlayerIds.length,
      ratingChanges: updates.map(u => ({ userId: u.userId, change: u.ratingChange })),
    },
    'Game result processed, ratings updated',
  );
}

// ---------------------------------------------------------------------------
// Leaderboard Queries
// ---------------------------------------------------------------------------

/**
 * Get the top players on the leaderboard.
 */
export async function getLeaderboard(
  limit: number = 50,
  offset: number = 0,
): Promise<LeaderboardEntry[]> {
  return getTopPlayers(limit, offset);
}

/**
 * Get a specific player's rank and stats.
 */
export async function getPlayerLeaderboardEntry(
  userId: string,
): Promise<LeaderboardEntry | null> {
  return getPlayerRank(userId);
}

/**
 * Get players near a specific player's rank.
 */
export async function getNearbyLeaderboard(
  userId: string,
  range: number = 5,
): Promise<LeaderboardEntry[]> {
  return getNearbyRanks(userId, range);
}

/**
 * Get a player's recent match history.
 */
export async function getPlayerMatchHistory(
  userId: string,
  limit: number = 20,
): Promise<Array<{
  gameId: string;
  result: 'win' | 'loss';
  ratingChange: number;
  ratingAfter: number;
  playedAt: string;
}>> {
  return getMatchHistory(userId, limit);
}
