/**
 * AI Opponent Module — barrel export.
 *
 * Exposes the public API for AI player management, turn handling,
 * and game lifecycle integration.
 *
 * @see docs/specs/ai-opponent-module.md
 */

// Types
export type {
  AIPlayer,
  AIDifficulty,
  AIStrategyId,
  AIStrategy,
  MoveEvaluation,
  AIConfig,
  WorkerPoolStats,
  WorkerRequest,
  WorkerResponse,
  ResponseDelayConfig,
} from './ai.types.js';

export {
  DEFAULT_AI_CONFIG,
  DIFFICULTY_DELAYS,
  FOLLOW_UP_DELAY,
  DIFFICULTY_TO_STRATEGY,
  AI_DISPLAY_NAMES,
  isAIPlayer,
} from './ai.types.js';

// AI Player management
export {
  createAIPlayerInstance,
  getAIPlayerInstance,
  removeAIPlayerInstance,
  getAllAIPlayers,
  getAIPlayersForGame,
  assignAIPlayerToGame,
  unassignAIPlayerFromGame,
  mapLobbyDifficulty,
  resetAIPlayers,
} from './ai-player.js';

// Controller
export {
  handleAITurn,
  onGameStarted,
  onGameEnded,
  onTurnChange,
  registerCallbacks,
  configureAI,
  computeAIMove,
  resetController,
} from './controller.js';

// Worker pool
export {
  initializePool,
  shutdownPool,
  computeMove,
  getPoolStats,
  isPoolInitialized,
  resetPool,
} from './worker-pool.js';

// Strategies (for direct use/testing)
export { createRandomStrategy, selectRandomMove } from './strategies/random.js';
export { createHeuristicStrategy, selectHeuristicMove } from './strategies/heuristic.js';
