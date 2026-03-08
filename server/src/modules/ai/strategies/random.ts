/**
 * Random Strategy (EASY difficulty).
 *
 * Picks a legal move uniformly at random using the seeded RNG.
 * No game knowledge -- all moves are equally likely.
 *
 * The RNG seed is derived from gameState.rngSeed + gameState.actionCount
 * to produce a unique but reproducible seed for each move decision.
 *
 * @see docs/specs/ai-opponent-module.md Section 3.1 (Random Strategy)
 */

import type { GameAction } from '@shared/game-action.js';
import type { GameState } from '@shared/game-state.js';

import { createRng, nextInt } from '../../game-engine/rng.js';
import type { AIStrategy, MoveEvaluation } from '../ai.types.js';

/**
 * Select a random legal move using seeded RNG.
 *
 * @param gameState - The current game state (for seed derivation).
 * @param playerId - The AI player's ID (unused for random strategy).
 * @param legalMoves - All legal moves to choose from.
 * @returns The chosen move with neutral confidence score (50).
 */
export function selectRandomMove(
  gameState: GameState,
  _playerId: string,
  legalMoves: ReadonlyArray<GameAction>,
): MoveEvaluation {
  const startTime = performance.now();

  if (legalMoves.length === 0) {
    throw new Error('No legal moves available for random strategy');
  }

  // Single move -- no need for RNG
  if (legalMoves.length === 1) {
    return {
      action: legalMoves[0]!,
      score: 50,
      reasoning: 'Only one legal move available',
      evaluationTimeMs: performance.now() - startTime,
      movesConsidered: 1,
    };
  }

  // Derive seed from game state for reproducibility
  const seed = gameState.rngSeed + gameState.actionCount;
  const rng = createRng(seed);
  const { value: index } = nextInt(rng, 0, legalMoves.length - 1);

  const chosen = legalMoves[index]!;

  return {
    action: chosen,
    score: 50,
    reasoning: `Randomly selected move ${index + 1} of ${legalMoves.length}`,
    evaluationTimeMs: performance.now() - startTime,
    movesConsidered: legalMoves.length,
  };
}

/**
 * Create the Random strategy instance.
 */
export function createRandomStrategy(): AIStrategy {
  return {
    id: 'random',
    name: 'Random Strategy',
    difficulty: 'EASY',
    evaluateMove: selectRandomMove,
  };
}
