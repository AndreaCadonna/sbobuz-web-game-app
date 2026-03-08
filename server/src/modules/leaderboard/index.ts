/**
 * Leaderboard Module — barrel export.
 *
 * @see server/src/modules/leaderboard/
 */

export { createLeaderboardRouter } from './routes.js';
export {
  processGameResult,
  getLeaderboard,
  getPlayerLeaderboardEntry,
  getNearbyLeaderboard,
  getPlayerMatchHistory,
} from './leaderboard-service.js';
export type {
  PlayerRating,
  LeaderboardEntry,
  RatingUpdate,
  GameResultInput,
} from './leaderboard.types.js';
export {
  expectedScore,
  calculateNewRating,
  calculateMultiplayerRatings,
  getKFactor,
  INITIAL_RATING,
  MIN_RATING,
} from './rating-service.js';
