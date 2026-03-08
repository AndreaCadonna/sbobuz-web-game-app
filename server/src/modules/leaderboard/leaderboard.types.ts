/**
 * Leaderboard module types.
 *
 * @see docs/specs/data-layer.md Section 4.5 (ratings table)
 * @see server/src/infra/database/migrations/007_create_ratings.sql
 */

/**
 * A player's rating record from the database.
 */
export interface PlayerRating {
  readonly userId: string;
  readonly rating: number;
  readonly peakRating: number;
  readonly gamesPlayed: number;
  readonly gamesWon: number;
  readonly gamesLost: number;
  readonly winStreak: number;
  readonly bestWinStreak: number;
  readonly lastGameAt: string | null;
}

/**
 * A leaderboard entry with rank information.
 */
export interface LeaderboardEntry {
  readonly rank: number;
  readonly userId: string;
  readonly username: string;
  readonly rating: number;
  readonly gamesPlayed: number;
  readonly gamesWon: number;
  readonly winRate: number;
}

/**
 * Result of an ELO rating update for a single player.
 */
export interface RatingUpdate {
  readonly userId: string;
  readonly ratingBefore: number;
  readonly ratingAfter: number;
  readonly ratingChange: number;
}

/**
 * Input for processing game results.
 */
export interface GameResultInput {
  readonly gameId: string;
  readonly winnerId: string;
  readonly playerIds: ReadonlyArray<string>;
  readonly playedAt: string;
  readonly durationSeconds: number;
}
