/**
 * AI Opponent Module types.
 *
 * Types for AI player identity, strategy interface, worker communication,
 * and configuration.
 *
 * @see docs/specs/ai-opponent-module.md Section 2 (Data Model)
 */

import type { GameAction } from '@shared/game-action.js';
import type { GameState } from '@shared/game-state.js';

// ---------------------------------------------------------------------------
// Difficulty & Strategy Identifiers
// ---------------------------------------------------------------------------

/** AI difficulty levels. */
export type AIDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

/** Strategy implementation identifiers. */
export type AIStrategyId = 'random' | 'heuristic' | 'mcts';

/** Maps difficulty to strategy. HARD is deferred. */
export const DIFFICULTY_TO_STRATEGY: Record<AIDifficulty, AIStrategyId> = {
  EASY: 'random',
  MEDIUM: 'heuristic',
  HARD: 'mcts', // deferred
};

// ---------------------------------------------------------------------------
// Response Delay
// ---------------------------------------------------------------------------

export interface ResponseDelayConfig {
  readonly minMs: number;
  readonly maxMs: number;
}

/**
 * Response delay ranges per difficulty.
 * Applied AFTER move computation to simulate human thinking time.
 */
export const DIFFICULTY_DELAYS: Record<AIDifficulty, ResponseDelayConfig> = {
  EASY: { minMs: 1000, maxMs: 2000 },
  MEDIUM: { minMs: 1500, maxMs: 3000 },
  HARD: { minMs: 2000, maxMs: 4000 },
};

/** Reduced delay for follow-up plays (King clear, Sbobuz). */
export const FOLLOW_UP_DELAY: ResponseDelayConfig = { minMs: 500, maxMs: 1000 };

// ---------------------------------------------------------------------------
// AI Player Identity
// ---------------------------------------------------------------------------

/**
 * Represents an AI-controlled player in the system.
 */
export interface AIPlayer {
  readonly playerId: string;
  readonly displayName: string;
  readonly strategyId: AIStrategyId;
  readonly difficulty: AIDifficulty;
  readonly responseDelay: ResponseDelayConfig;
  gameId: string | null;
}

/** AI display name pool. */
export const AI_DISPLAY_NAMES = [
  'Bot Alice',
  'Bot Bob',
  'Bot Charlie',
  'Bot Diana',
  'Bot Echo',
];

// ---------------------------------------------------------------------------
// Strategy Interface
// ---------------------------------------------------------------------------

/**
 * The result of a strategy evaluation.
 */
export interface MoveEvaluation {
  readonly action: GameAction;
  readonly score: number;
  readonly reasoning?: string | undefined;
  readonly evaluationTimeMs: number;
  readonly movesConsidered: number;
}

/**
 * The core strategy contract. Every AI difficulty level implements this.
 */
export interface AIStrategy {
  readonly id: AIStrategyId;
  readonly name: string;
  readonly difficulty: AIDifficulty;

  evaluateMove(
    gameState: GameState,
    playerId: string,
    legalMoves: ReadonlyArray<GameAction>,
  ): MoveEvaluation;
}

// ---------------------------------------------------------------------------
// Worker Communication
// ---------------------------------------------------------------------------

/**
 * Message sent from main thread to worker thread.
 */
export interface WorkerRequest {
  readonly requestId: string;
  readonly strategyId: AIStrategyId;
  readonly gameState: GameState;
  readonly playerId: string;
  readonly legalMoves: ReadonlyArray<GameAction>;
}

/**
 * Message sent from worker thread back to main thread.
 */
export interface WorkerResponse {
  readonly requestId: string;
  readonly success: boolean;
  readonly evaluation?: MoveEvaluation | undefined;
  readonly error?: string | undefined;
}

// ---------------------------------------------------------------------------
// Worker Pool Stats
// ---------------------------------------------------------------------------

export interface WorkerPoolStats {
  readonly totalWorkers: number;
  readonly busyWorkers: number;
  readonly idleWorkers: number;
  readonly queuedRequests: number;
  readonly totalRequestsProcessed: number;
  readonly totalTimeouts: number;
  readonly totalErrors: number;
  readonly avgComputeTimeMs: number;
}

// ---------------------------------------------------------------------------
// AI Configuration
// ---------------------------------------------------------------------------

export interface AIConfig {
  readonly minResponseDelayMs: number;
  readonly maxResponseDelayMs: number;
  readonly workerPoolSize: number;
  readonly moveTimeoutMs: number;
  readonly maxRetries: number;
  readonly defaultDifficulty: AIDifficulty;
  readonly enableDebugLogging: boolean;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  minResponseDelayMs: 500,
  maxResponseDelayMs: 3000,
  workerPoolSize: 4,
  moveTimeoutMs: 5000,
  maxRetries: 2,
  defaultDifficulty: 'MEDIUM',
  enableDebugLogging: false,
};

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

/**
 * Check if a player ID belongs to an AI player.
 */
export function isAIPlayer(playerId: string): boolean {
  return playerId.startsWith('ai_');
}
