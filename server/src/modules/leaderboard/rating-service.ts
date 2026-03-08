/**
 * ELO Rating Service — calculates and applies rating changes.
 *
 * Uses the standard ELO formula with a K-factor that decreases as players
 * gain more experience. The initial rating is 1200.
 *
 * Formula:
 *   Expected score: E = 1 / (1 + 10^((Rb - Ra) / 400))
 *   New rating: Ra' = Ra + K * (S - E)
 *   where S = 1 (win), 0 (loss)
 *
 * K-factor tiers:
 *   - Games 0-29:  K = 40 (provisional, rapid adjustment)
 *   - Games 30-99: K = 20 (standard)
 *   - Games 100+:  K = 10 (established, stable rating)
 *
 * @see server/src/infra/database/migrations/007_create_ratings.sql
 */

import type { RatingUpdate, GameResultInput } from './leaderboard.types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default starting ELO rating. */
export const INITIAL_RATING = 1200;

/** Minimum possible rating (floor). */
export const MIN_RATING = 100;

/** K-factor tiers based on games played. */
const K_FACTOR_TIERS = [
  { maxGames: 29, kFactor: 40 },
  { maxGames: 99, kFactor: 20 },
  { maxGames: Infinity, kFactor: 10 },
] as const;

// ---------------------------------------------------------------------------
// Pure ELO Calculation Functions
// ---------------------------------------------------------------------------

/**
 * Get the K-factor for a player based on their game count.
 *
 * @param gamesPlayed - Number of rated games the player has completed.
 * @returns The K-factor to use for rating calculations.
 */
export function getKFactor(gamesPlayed: number): number {
  for (const tier of K_FACTOR_TIERS) {
    if (gamesPlayed <= tier.maxGames) {
      return tier.kFactor;
    }
  }
  return 10; // Fallback
}

/**
 * Calculate the expected score for player A against player B.
 *
 * @param ratingA - Player A's current rating.
 * @param ratingB - Player B's current rating.
 * @returns Expected score (probability of winning) for player A (0-1).
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate the new rating after a game.
 *
 * @param currentRating - The player's current rating.
 * @param expectedScore - The expected score (from expectedScore()).
 * @param actualScore - The actual score: 1 for win, 0 for loss.
 * @param kFactor - The K-factor to use.
 * @returns The new rating (floored at MIN_RATING).
 */
export function calculateNewRating(
  currentRating: number,
  expected: number,
  actualScore: number,
  kFactor: number,
): number {
  const newRating = Math.round(currentRating + kFactor * (actualScore - expected));
  return Math.max(newRating, MIN_RATING);
}

/**
 * Calculate rating updates for all players in a multiplayer game.
 *
 * In a multiplayer game (2-5 players), the winner gains rating against
 * each opponent's expected score, and each loser loses rating against
 * the winner's expected score.
 *
 * @param winnerId - The winning player's ID.
 * @param playerRatings - Map of playerId -> { rating, gamesPlayed }.
 * @returns Array of rating updates for all players.
 */
export function calculateMultiplayerRatings(
  winnerId: string,
  playerRatings: ReadonlyMap<string, { rating: number; gamesPlayed: number }>,
): RatingUpdate[] {
  const updates: RatingUpdate[] = [];
  const winnerData = playerRatings.get(winnerId);

  if (!winnerData) {
    return updates;
  }

  const winnerK = getKFactor(winnerData.gamesPlayed);
  const opponentIds = [...playerRatings.keys()].filter(id => id !== winnerId);

  // Winner: gains against each opponent's expected score
  let winnerRatingChange = 0;
  for (const opponentId of opponentIds) {
    const opponent = playerRatings.get(opponentId)!;
    const expected = expectedScore(winnerData.rating, opponent.rating);
    winnerRatingChange += winnerK * (1 - expected);
  }

  // Average the change over the number of opponents for fair scaling
  winnerRatingChange = Math.round(winnerRatingChange / opponentIds.length);
  const winnerNewRating = Math.max(winnerData.rating + winnerRatingChange, MIN_RATING);

  updates.push({
    userId: winnerId,
    ratingBefore: winnerData.rating,
    ratingAfter: winnerNewRating,
    ratingChange: winnerNewRating - winnerData.rating,
  });

  // Losers: each loses against the winner's expected score
  for (const opponentId of opponentIds) {
    const opponent = playerRatings.get(opponentId)!;
    const opponentK = getKFactor(opponent.gamesPlayed);
    const expected = expectedScore(opponent.rating, winnerData.rating);
    const lossChange = Math.round(opponentK * (0 - expected));
    const newRating = Math.max(opponent.rating + lossChange, MIN_RATING);

    updates.push({
      userId: opponentId,
      ratingBefore: opponent.rating,
      ratingAfter: newRating,
      ratingChange: newRating - opponent.rating,
    });
  }

  return updates;
}
