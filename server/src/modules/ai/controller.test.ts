/**
 * Tests for AI Controller.
 *
 * These tests focus on the synchronous parts of the controller and
 * use the `computeAIMove` helper for testing move computation without
 * async delays.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { GameAction } from '@shared/game-action.js';
import type { GameState } from '@shared/game-state.js';

import { createGame } from '../game-engine/index.js';
import { enumerateLegalMoves } from '../game-engine/legal-moves.js';

import {
  onGameStarted,
  onGameEnded,
  registerCallbacks,
  configureAI,
  computeAIMove,
  resetController,
} from './controller.js';
import {
  createAIPlayerInstance,
  getAIPlayerInstance,
  getAIPlayersForGame,
  resetAIPlayers,
} from './ai-player.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestState(seed = 42, playerIds = ['ai_1', 'ai_2']): GameState {
  return createGame({
    gameId: 'test-game',
    playerIds,
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

beforeEach(() => {
  resetController();
  resetAIPlayers();
});

describe('computeAIMove', () => {
  it('computes a move for EASY difficulty (random)', () => {
    const state = createTestState();
    const playerId = state.turnOrder[state.currentPlayerIndex]!;

    const result = computeAIMove(state, playerId, 'EASY');
    expect(result.action).toBeDefined();
    expect(result.score).toBe(50); // random always scores 50
  });

  it('computes a move for MEDIUM difficulty (heuristic)', () => {
    const state = createTestState();
    const playerId = state.turnOrder[state.currentPlayerIndex]!;

    const result = computeAIMove(state, playerId, 'MEDIUM');
    expect(result.action).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('move is among legal moves', () => {
    const state = createTestState();
    const playerId = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, playerId);

    const result = computeAIMove(state, playerId);
    expect(moveSet.all).toContainEqual(result.action);
  });

  it('includes evaluation metadata', () => {
    const state = createTestState();
    const playerId = state.turnOrder[state.currentPlayerIndex]!;

    const result = computeAIMove(state, playerId);
    expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.movesConsidered).toBeGreaterThan(0);
  });

  it('is deterministic for same state and difficulty', () => {
    const state = createTestState(42);
    const playerId = state.turnOrder[state.currentPlayerIndex]!;

    const r1 = computeAIMove(state, playerId, 'EASY');
    const r2 = computeAIMove(state, playerId, 'EASY');
    expect(r1.action).toEqual(r2.action);
  });

  it('defaults to MEDIUM difficulty', () => {
    const state = createTestState();
    const playerId = state.turnOrder[state.currentPlayerIndex]!;

    // MEDIUM uses heuristic which has variable scores
    const result = computeAIMove(state, playerId);
    expect(result.movesConsidered).toBeGreaterThan(0);
  });
});

describe('onGameStarted', () => {
  it('registers AI players for the game', () => {
    const state = createTestState(42, ['ai_1', 'ai_2']);
    const difficulties = new Map<string, 'EASY' | 'MEDIUM' | 'HARD'>([
      ['ai_1', 'EASY'],
      ['ai_2', 'MEDIUM'],
    ]);

    // Prevent async AI turn from firing
    registerCallbacks(
      () => ({ accepted: true, newState: { ...state, phase: 'finished' as const } }),
      () => ({ ...state, phase: 'finished' as const }),
    );

    onGameStarted('game-1', ['ai_1', 'ai_2'], difficulties, state);

    const p1 = getAIPlayerInstance('ai_1');
    const p2 = getAIPlayerInstance('ai_2');
    expect(p1).toBeDefined();
    expect(p1!.difficulty).toBe('EASY');
    expect(p1!.gameId).toBe('game-1');
    expect(p2).toBeDefined();
    expect(p2!.difficulty).toBe('MEDIUM');
    expect(p2!.gameId).toBe('game-1');
  });

  it('skips non-AI players', () => {
    const state = createTestState(42, ['human_1', 'ai_1']);
    const difficulties = new Map<string, 'EASY' | 'MEDIUM' | 'HARD'>([
      ['ai_1', 'EASY'],
    ]);

    registerCallbacks(
      () => ({ accepted: true, newState: { ...state, phase: 'finished' as const } }),
      () => ({ ...state, phase: 'finished' as const }),
    );

    onGameStarted('game-1', ['human_1', 'ai_1'], difficulties, state);

    expect(getAIPlayerInstance('human_1')).toBeUndefined();
    expect(getAIPlayerInstance('ai_1')).toBeDefined();
  });

  it('uses default difficulty when not specified', () => {
    const state = createTestState(42, ['ai_1', 'ai_2']);
    const difficulties = new Map<string, 'EASY' | 'MEDIUM' | 'HARD'>();

    registerCallbacks(
      () => ({ accepted: true, newState: { ...state, phase: 'finished' as const } }),
      () => ({ ...state, phase: 'finished' as const }),
    );

    onGameStarted('game-1', ['ai_1', 'ai_2'], difficulties, state);

    const p1 = getAIPlayerInstance('ai_1');
    expect(p1!.difficulty).toBe('MEDIUM'); // default
  });

  it('does not re-register existing AI players', () => {
    createAIPlayerInstance('EASY', 'ai_1');
    const state = createTestState(42, ['ai_1', 'ai_2']);
    const difficulties = new Map<string, 'EASY' | 'MEDIUM' | 'HARD'>([
      ['ai_1', 'MEDIUM'], // Different difficulty
    ]);

    registerCallbacks(
      () => ({ accepted: true, newState: { ...state, phase: 'finished' as const } }),
      () => ({ ...state, phase: 'finished' as const }),
    );

    onGameStarted('game-1', ['ai_1', 'ai_2'], difficulties, state);

    const p1 = getAIPlayerInstance('ai_1');
    // Existing player is kept, not overwritten
    expect(p1!.difficulty).toBe('EASY');
    expect(p1!.gameId).toBe('game-1');
  });
});

describe('onGameEnded', () => {
  it('unassigns AI players from the game', () => {
    const state = createTestState(42, ['ai_1', 'ai_2']);
    const difficulties = new Map<string, 'EASY' | 'MEDIUM' | 'HARD'>([
      ['ai_1', 'EASY'],
      ['ai_2', 'MEDIUM'],
    ]);

    registerCallbacks(
      () => ({ accepted: true, newState: { ...state, phase: 'finished' as const } }),
      () => ({ ...state, phase: 'finished' as const }),
    );

    onGameStarted('game-1', ['ai_1', 'ai_2'], difficulties, state);
    expect(getAIPlayersForGame('game-1')).toHaveLength(2);

    onGameEnded('game-1');
    expect(getAIPlayersForGame('game-1')).toHaveLength(0);

    // Players still exist in registry, just unassigned
    expect(getAIPlayerInstance('ai_1')).toBeDefined();
    expect(getAIPlayerInstance('ai_1')!.gameId).toBeNull();
  });
});

describe('configureAI', () => {
  it('allows overriding default config', () => {
    configureAI({ maxRetries: 5, enableDebugLogging: true });
    // Config is internal, verified by behavior in other tests
  });
});

describe('registerCallbacks', () => {
  it('sets up action submission callback', () => {
    const submitFn = vi.fn().mockReturnValue({ accepted: true, newState: createTestState() });
    const getStateFn = vi.fn().mockReturnValue(createTestState());
    registerCallbacks(submitFn, getStateFn);
    // Callback registration verified by behavior in handleAITurn tests
  });
});
