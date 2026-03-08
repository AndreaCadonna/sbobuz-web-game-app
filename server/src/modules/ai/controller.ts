/**
 * AI Controller — orchestrates AI decision-making.
 *
 * Handles turn notifications, computes moves via the worker pool (or
 * directly for testing), applies response delays, submits actions
 * to the game engine, and handles retries on rejection.
 *
 * The controller does NOT use worker threads by default for simplicity
 * and testability. It can dispatch to the worker pool when configured,
 * but the strategies are also callable directly on the main thread
 * since they are fast enough (<100ms for heuristic).
 *
 * @see docs/specs/ai-opponent-module.md Section 5 (AI Turn Flow)
 */

import type { GameAction } from '@shared/game-action.js';
import type { GameState } from '@shared/game-state.js';

import { createModuleLogger } from '../../shared/logger.js';
import { enumerateLegalMoves, processAction } from '../game-engine/index.js';

import type {
  AIDifficulty,
  MoveEvaluation,
  ResponseDelayConfig,
  AIConfig,
} from './ai.types.js';
import {
  DEFAULT_AI_CONFIG,
  DIFFICULTY_DELAYS,
  FOLLOW_UP_DELAY,
  isAIPlayer,
} from './ai.types.js';
import {
  getAIPlayerInstance,
  getAIPlayersForGame,
  assignAIPlayerToGame,
  unassignAIPlayerFromGame,
  mapLobbyDifficulty,
  createAIPlayerInstance,
} from './ai-player.js';
import { selectRandomMove } from './strategies/random.js';
import { selectHeuristicMove } from './strategies/heuristic.js';

const logger = createModuleLogger('ai');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

let config: AIConfig = DEFAULT_AI_CONFIG;

/**
 * Set the AI controller configuration.
 */
export function configureAI(newConfig: Partial<AIConfig>): void {
  config = { ...DEFAULT_AI_CONFIG, ...newConfig };
}

// ---------------------------------------------------------------------------
// Callbacks — injected by integration layer
// ---------------------------------------------------------------------------

/**
 * Callback type for submitting an action to the game session.
 */
export type ActionSubmitCallback = (
  gameId: string,
  action: GameAction,
) => { accepted: true; newState: GameState } | { accepted: false; reason: string };

/**
 * Callback type for getting the current game state.
 */
export type GetGameStateCallback = (gameId: string) => GameState | undefined;

let submitAction: ActionSubmitCallback | null = null;
let getGameState: GetGameStateCallback | null = null;

/**
 * Register callbacks for game engine interaction.
 */
export function registerCallbacks(
  submit: ActionSubmitCallback,
  getState: GetGameStateCallback,
): void {
  submitAction = submit;
  getGameState = getState;
}

// ---------------------------------------------------------------------------
// Strategy Dispatch (direct, no worker threads)
// ---------------------------------------------------------------------------

function computeMoveDirectly(
  strategyId: string,
  gameState: GameState,
  playerId: string,
  legalMoves: ReadonlyArray<GameAction>,
): MoveEvaluation {
  switch (strategyId) {
    case 'heuristic':
      return selectHeuristicMove(gameState, playerId, legalMoves);
    case 'random':
    default:
      return selectRandomMove(gameState, playerId, legalMoves);
  }
}

// ---------------------------------------------------------------------------
// Response Delay
// ---------------------------------------------------------------------------

function computeResponseDelay(
  delay: ResponseDelayConfig,
  evaluationTimeMs: number,
): number {
  // Simple linear interpolation between min and max
  const baseDelay = delay.minMs + Math.random() * (delay.maxMs - delay.minMs);

  // If strategy computation already took significant time, reduce delay
  if (evaluationTimeMs > delay.minMs) {
    return Math.max(200, baseDelay - evaluationTimeMs);
  }

  return baseDelay;
}

/**
 * Wait for the specified delay. Returns a promise that resolves after the delay.
 * Uses `setTimeout.unref()` to avoid keeping the process alive.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (timer.unref) timer.unref();
  });
}

// ---------------------------------------------------------------------------
// Turn Handling
// ---------------------------------------------------------------------------

/**
 * Handle a turn notification for an AI player.
 *
 * This is the main entry point called when the game engine detects
 * that the current player is AI-controlled.
 *
 * @param gameId - The game ID.
 * @param playerId - The AI player's ID.
 * @param gameState - The current game state.
 * @param isFollowUp - Whether this is a follow-up play (reduced delay).
 */
export async function handleAITurn(
  gameId: string,
  playerId: string,
  gameState: GameState,
  isFollowUp = false,
): Promise<void> {
  if (!isAIPlayer(playerId)) {
    return;
  }

  const aiPlayer = getAIPlayerInstance(playerId);
  if (!aiPlayer) {
    logger.warn({ gameId, playerId }, 'AI turn notification for unregistered player');
    return;
  }

  // Get legal moves
  const moveSet = enumerateLegalMoves(gameState, playerId);
  const legalMoves = moveSet.all;

  if (legalMoves.length === 0) {
    logger.warn({ gameId, playerId }, 'No legal moves for AI player');
    return;
  }

  // Compute move
  let evaluation: MoveEvaluation;
  try {
    evaluation = computeMoveDirectly(
      aiPlayer.strategyId,
      gameState,
      playerId,
      legalMoves,
    );
  } catch (err) {
    logger.error({ err, gameId, playerId }, 'AI strategy computation failed, falling back to random');
    evaluation = selectRandomMove(gameState, playerId, legalMoves);
  }

  if (config.enableDebugLogging) {
    logger.debug(
      {
        gameId,
        playerId,
        strategyId: aiPlayer.strategyId,
        actionType: evaluation.action.type,
        score: evaluation.score,
        reasoning: evaluation.reasoning,
        evaluationTimeMs: evaluation.evaluationTimeMs,
        movesConsidered: evaluation.movesConsidered,
      },
      'AI move computed',
    );
  }

  // Apply response delay
  const delayConfig = isFollowUp ? FOLLOW_UP_DELAY : DIFFICULTY_DELAYS[aiPlayer.difficulty];
  const responseDelayMs = computeResponseDelay(delayConfig, evaluation.evaluationTimeMs);

  await delay(responseDelayMs);

  // Check if game is still active before submitting
  if (getGameState) {
    const currentState = getGameState(gameId);
    if (!currentState || currentState.phase === 'finished' || currentState.phase === 'cancelled') {
      logger.debug({ gameId, playerId }, 'Game ended before AI could submit action');
      return;
    }
  }

  // Submit action with retry logic
  await submitAIAction(gameId, playerId, evaluation, gameState);
}

async function submitAIAction(
  gameId: string,
  playerId: string,
  evaluation: MoveEvaluation,
  gameState: GameState,
): Promise<void> {
  if (!submitAction) {
    logger.error({ gameId, playerId }, 'No action submit callback registered');
    return;
  }

  let retries = 0;
  let action = evaluation.action;

  while (retries <= config.maxRetries) {
    const result = submitAction(gameId, action);

    if (result.accepted) {
      const totalTimeMs = evaluation.evaluationTimeMs;
      logger.info(
        {
          gameId,
          playerId,
          strategyId: getAIPlayerInstance(playerId)?.strategyId,
          difficulty: getAIPlayerInstance(playerId)?.difficulty,
          actionType: action.type,
          score: evaluation.score,
          computeTimeMs: evaluation.evaluationTimeMs,
          totalTimeMs,
          movesConsidered: evaluation.movesConsidered,
        },
        'ai_move_submitted',
      );

      // Check if it's still our turn after the action (follow-up plays)
      const newState = result.newState;
      const currentPlayerId = newState.turnOrder[newState.currentPlayerIndex];
      if (
        currentPlayerId === playerId &&
        newState.phase !== 'finished' &&
        newState.phase !== 'cancelled'
      ) {
        // Follow-up play (King clear, Sbobuz, etc.) -- handle with reduced delay
        void handleAITurn(gameId, playerId, newState, true);
      }

      return;
    }

    // Action rejected
    retries++;
    logger.warn(
      {
        gameId,
        playerId,
        actionType: action.type,
        reason: result.reason,
        retry: retries,
      },
      'AI action rejected',
    );

    if (retries > config.maxRetries) {
      logger.error(
        { gameId, playerId, maxRetries: config.maxRetries },
        'AI exhausted all retries, giving up (turn timer will handle forfeit)',
      );
      return;
    }

    // Retry with a random legal move
    const moveSet = enumerateLegalMoves(gameState, playerId);
    if (moveSet.all.length === 0) {
      logger.error({ gameId, playerId }, 'No legal moves available for retry');
      return;
    }

    const fallback = selectRandomMove(gameState, playerId, moveSet.all);
    action = fallback.action;
  }
}

// ---------------------------------------------------------------------------
// Game Lifecycle
// ---------------------------------------------------------------------------

/**
 * Notify AI module that a game has started.
 * Registers AI players from the lobby room's player list.
 *
 * @param gameId - The game ID.
 * @param playerIds - All player IDs in the game.
 * @param aiPlayerDifficulties - Map of AI player IDs to their difficulty levels.
 * @param initialState - The initial game state.
 */
export function onGameStarted(
  gameId: string,
  playerIds: ReadonlyArray<string>,
  aiPlayerDifficulties: Map<string, AIDifficulty>,
  initialState: GameState,
): void {
  for (const playerId of playerIds) {
    if (!isAIPlayer(playerId)) continue;

    // Register AI player if not already registered
    let aiPlayer = getAIPlayerInstance(playerId);
    if (!aiPlayer) {
      const difficulty = aiPlayerDifficulties.get(playerId) ?? config.defaultDifficulty;
      aiPlayer = createAIPlayerInstance(difficulty, playerId);
    }

    assignAIPlayerToGame(playerId, gameId);
  }

  // Check if it's an AI player's turn first
  const currentPlayerId = initialState.turnOrder[initialState.currentPlayerIndex];
  if (currentPlayerId && isAIPlayer(currentPlayerId)) {
    void handleAITurn(gameId, currentPlayerId, initialState);
  }
}

/**
 * Notify AI module that a game has ended.
 * Cleans up AI player game assignments.
 */
export function onGameEnded(gameId: string): void {
  const aiPlayers = getAIPlayersForGame(gameId);
  for (const player of aiPlayers) {
    unassignAIPlayerFromGame(player.playerId);
  }

  logger.info({ gameId, aiPlayerCount: aiPlayers.length }, 'AI players deregistered from game');
}

/**
 * Notify AI module that a turn has changed.
 * If the new current player is AI, triggers move computation.
 */
export function onTurnChange(
  gameId: string,
  playerId: string,
  gameState: GameState,
): void {
  if (!isAIPlayer(playerId)) return;

  const isFollowUp = gameState.phase === 'awaiting_post_clear_play';
  void handleAITurn(gameId, playerId, gameState, isFollowUp);
}

// ---------------------------------------------------------------------------
// Testing Utilities
// ---------------------------------------------------------------------------

/**
 * Reset the controller state (for testing only).
 */
export function resetController(): void {
  config = DEFAULT_AI_CONFIG;
  submitAction = null;
  getGameState = null;
}

/**
 * Run AI turn synchronously (for testing -- no delay).
 * Returns the evaluation result without submitting.
 */
export function computeAIMove(
  gameState: GameState,
  playerId: string,
  difficulty: AIDifficulty = 'MEDIUM',
): MoveEvaluation {
  const strategyId = difficulty === 'EASY' ? 'random' : 'heuristic';
  const moveSet = enumerateLegalMoves(gameState, playerId);
  return computeMoveDirectly(strategyId, gameState, playerId, moveSet.all);
}
