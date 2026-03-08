/**
 * Game Engine Module — Public Interface
 *
 * Barrel export composing all game engine components into a clean public API.
 * External modules (Realtime, AI, Session Manager) interact with the engine
 * exclusively through this interface.
 *
 * The four primary operations are:
 * 1. `createGame()` — Create a new game from player list + seed.
 * 2. `processAction()` — Validate and apply an action atomically.
 * 3. `enumerateLegalMoves()` — Get all legal actions for a player.
 * 4. `sanitizeStateForPlayer()` — Create a client-safe state view.
 *
 * All functions are pure, synchronous, and deterministic.
 *
 * @see SBOBUZ_ENGINE_SPEC.md
 * @see docs/specs/engine/README.md
 */

import type { GameAction } from '@shared/game-action.js';
import type { GameState } from '@shared/game-state.js';

import { reduce } from './reducer.js';
import type { ReducerResult, GameEvent } from './reducer.js';
import { validateAction } from './validator.js';
import type { ValidationError } from './validator.js';

// ---------------------------------------------------------------------------
// Types owned by this module
// ---------------------------------------------------------------------------

/**
 * Result of processing a game action. Either the action was accepted (producing
 * a new state and events) or rejected (with a validation error).
 */
export type ProcessActionResult =
  | {
      readonly accepted: true;
      readonly newState: GameState;
      readonly events: ReadonlyArray<GameEvent>;
    }
  | {
      readonly accepted: false;
      readonly error: ValidationError;
    };

// ---------------------------------------------------------------------------
// processAction — validate then reduce
// ---------------------------------------------------------------------------

/**
 * Validates and applies a game action atomically.
 *
 * This is the primary entry point for all game state transitions. It:
 * 1. Validates the action against the current state.
 * 2. If invalid, returns the validation error without modifying state.
 * 3. If valid, applies the action via the reducer.
 * 4. Returns the new state and the events that occurred.
 *
 * The input state is never modified. A new state is always returned.
 *
 * @param state - The current game state (immutable).
 * @param action - The action to validate and apply.
 * @returns A ProcessActionResult — either accepted with new state or rejected with error.
 *
 * @example
 * ```typescript
 * const result = processAction(gameState, {
 *   type: 'PLAY_CARDS',
 *   playerId: 'alice',
 *   cardIds: ['hearts_7'],
 * });
 *
 * if (result.accepted) {
 *   // result.newState is the updated game state
 *   // result.events describes what happened
 * } else {
 *   // result.error.code tells why the action was rejected
 * }
 * ```
 */
export function processAction(
  state: GameState,
  action: GameAction,
): ProcessActionResult {
  // Step 1: Validate
  const validation = validateAction(state, action);

  if (!validation.valid) {
    return {
      accepted: false,
      error: validation.reason,
    };
  }

  // Step 2: Reduce
  const result: ReducerResult = reduce(state, action);

  return {
    accepted: true,
    newState: result.newState,
    events: result.events,
  };
}

// ---------------------------------------------------------------------------
// Re-exports — Public API surface
// ---------------------------------------------------------------------------

// State factory
export { createInitialState as createGame } from './state-factory.js';
export type { CreateGameInput } from './state-factory.js';

// Legal move enumerator
export { enumerateLegalMoves } from './legal-moves.js';
export type { LegalMoveSet } from './legal-moves.js';

// State sanitizer
export { sanitizeStateForPlayer } from './sanitizer.js';
export type { SanitizedGameState, SanitizedPlayerState } from './sanitizer.js';

// Validator (for direct access if needed)
export { validateAction } from './validator.js';
export type { ValidationResult, ValidationError, ValidationErrorCode } from './validator.js';

// Reducer (for direct access / event replay)
export { reduce } from './reducer.js';
export type { ReducerResult, GameEvent } from './reducer.js';

// Active zone resolver
export { getActiveZone, getActiveZoneCards } from './active-zone.js';

// Win condition evaluator
export { checkWinCondition, checkAnyWinner } from './win-condition.js';
export type { WinCheckResult } from './win-condition.js';

// Sbobuz detector
export { checkSbobuz } from './sbobuz-detector.js';

// Turn manager
export { advanceTurn } from './turn-manager.js';

// Rank comparator
export { isCardLegal, compareRanks, rankToOrdinal, RANK_ORDER } from './rank-comparator.js';
export type { ComparisonContext, ComparisonResult } from './rank-comparator.js';
