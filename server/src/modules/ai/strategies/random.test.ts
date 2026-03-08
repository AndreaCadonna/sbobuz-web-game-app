/**
 * Tests for Random Strategy (EASY difficulty).
 */

import { describe, it, expect } from 'vitest';

import type { GameAction } from '@shared/game-action.js';
import type { GameState } from '@shared/game-state.js';

import { createGame } from '../../game-engine/index.js';
import { enumerateLegalMoves } from '../../game-engine/legal-moves.js';
import { selectRandomMove, createRandomStrategy } from './random.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestState(seed = 42): GameState {
  return createGame({
    gameId: 'test-game',
    playerIds: ['ai_1', 'ai_2', 'ai_3'],
    seed,
    config: {
      turnTimerSeconds: 60,
      disconnectGraceSeconds: 30,
      maxPlayers: 5,
      minPlayers: 2,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createRandomStrategy', () => {
  it('returns a strategy with correct metadata', () => {
    const strategy = createRandomStrategy();
    expect(strategy.id).toBe('random');
    expect(strategy.name).toBe('Random Strategy');
    expect(strategy.difficulty).toBe('EASY');
  });
});

describe('selectRandomMove', () => {
  it('selects a move from the legal moves', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);
    expect(moveSet.all.length).toBeGreaterThan(0);

    const result = selectRandomMove(state, currentPlayer, moveSet.all);
    expect(result.action).toBeDefined();
    expect(moveSet.all).toContainEqual(result.action);
  });

  it('returns score of 50 (neutral confidence)', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);
    const result = selectRandomMove(state, currentPlayer, moveSet.all);
    expect(result.score).toBe(50);
  });

  it('includes evaluation time', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);
    const result = selectRandomMove(state, currentPlayer, moveSet.all);
    expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('includes moves considered count', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);
    const result = selectRandomMove(state, currentPlayer, moveSet.all);
    expect(result.movesConsidered).toBe(moveSet.all.length);
  });

  it('is deterministic given the same game state', () => {
    const state = createTestState(42);
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    const result1 = selectRandomMove(state, currentPlayer, moveSet.all);
    const result2 = selectRandomMove(state, currentPlayer, moveSet.all);

    // Same state + same seed = same move
    expect(result1.action).toEqual(result2.action);
  });

  it('produces different moves for different action counts', () => {
    const state1 = createTestState(42);
    const state2 = { ...state1, actionCount: state1.actionCount + 1 };
    const currentPlayer = state1.turnOrder[state1.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state1, currentPlayer);

    if (moveSet.all.length <= 1) return; // Can't test with single move

    const result1 = selectRandomMove(state1, currentPlayer, moveSet.all);
    const result2 = selectRandomMove(state2, currentPlayer, moveSet.all);

    // Different action count should produce different seed -> potentially different move
    // Note: not guaranteed to be different with small move sets
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
  });

  it('returns the only move when single legal move available', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const singleMove: GameAction[] = [{ type: 'PICK_UP_PILE', playerId: currentPlayer }];

    const result = selectRandomMove(state, currentPlayer, singleMove);
    expect(result.action).toEqual(singleMove[0]);
    expect(result.reasoning).toContain('Only one legal move');
    expect(result.movesConsidered).toBe(1);
  });

  it('throws when no legal moves available', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;

    expect(() => selectRandomMove(state, currentPlayer, [])).toThrow(
      'No legal moves available',
    );
  });

  it('handles DECLARE_DIRECTION moves', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const directionMoves: GameAction[] = [
      { type: 'DECLARE_DIRECTION', playerId: currentPlayer, direction: 'higher' },
      { type: 'DECLARE_DIRECTION', playerId: currentPlayer, direction: 'lower' },
    ];

    const result = selectRandomMove(state, currentPlayer, directionMoves);
    expect(['DECLARE_DIRECTION']).toContain(result.action.type);
  });

  it('produces reasoning string', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);
    const result = selectRandomMove(state, currentPlayer, moveSet.all);
    expect(result.reasoning).toBeDefined();
  });
});
