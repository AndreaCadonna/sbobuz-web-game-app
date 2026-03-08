/**
 * Tests for AI Worker (direct function testing, not via worker threads).
 */

import { describe, it, expect } from 'vitest';

import type { GameState } from '@shared/game-state.js';
import type { GameAction } from '@shared/game-action.js';

import { createGame } from '../game-engine/index.js';
import { enumerateLegalMoves } from '../game-engine/legal-moves.js';
import { handleRequest, strategies, loadStrategies } from './worker.js';
import type { WorkerRequest } from './ai.types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestState(seed = 42): GameState {
  return createGame({
    gameId: 'test-game',
    playerIds: ['ai_1', 'ai_2'],
    seed,
    config: {
      turnTimerSeconds: 60,
      disconnectGraceSeconds: 30,
      maxPlayers: 5,
      minPlayers: 2,
    },
  });
}

function createRequest(overrides: Partial<WorkerRequest> = {}): WorkerRequest {
  const state = createTestState();
  const playerId = state.turnOrder[state.currentPlayerIndex]!;
  const moveSet = enumerateLegalMoves(state, playerId);

  return {
    requestId: 'test-req-1',
    strategyId: 'random',
    gameState: state,
    playerId,
    legalMoves: moveSet.all,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Worker strategies loading', () => {
  it('loads random and heuristic strategies on startup', () => {
    expect(strategies.has('random')).toBe(true);
    expect(strategies.has('heuristic')).toBe(true);
  });

  it('does not have MCTS strategy (deferred)', () => {
    expect(strategies.has('mcts')).toBe(false);
  });

  it('can reload strategies', () => {
    loadStrategies();
    expect(strategies.size).toBe(2);
  });
});

describe('handleRequest', () => {
  it('returns successful response for random strategy', () => {
    const request = createRequest({ strategyId: 'random' });
    const response = handleRequest(request);

    expect(response.requestId).toBe(request.requestId);
    expect(response.success).toBe(true);
    expect(response.evaluation).toBeDefined();
    expect(response.evaluation!.action).toBeDefined();
    expect(response.evaluation!.score).toBe(50);
  });

  it('returns successful response for heuristic strategy', () => {
    const request = createRequest({ strategyId: 'heuristic' });
    const response = handleRequest(request);

    expect(response.requestId).toBe(request.requestId);
    expect(response.success).toBe(true);
    expect(response.evaluation).toBeDefined();
    expect(response.evaluation!.action).toBeDefined();
  });

  it('returns error for unknown strategy', () => {
    const request = createRequest({ strategyId: 'mcts' as WorkerRequest['strategyId'] });
    const response = handleRequest(request);

    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown strategy');
  });

  it('returns error when no legal moves', () => {
    const request = createRequest({ legalMoves: [] });
    const response = handleRequest(request);

    expect(response.success).toBe(false);
    expect(response.error).toContain('No legal moves');
  });

  it('correlates response to request via requestId', () => {
    const request = createRequest({ requestId: 'unique-123' });
    const response = handleRequest(request);
    expect(response.requestId).toBe('unique-123');
  });

  it('evaluation includes evaluation time', () => {
    const request = createRequest();
    const response = handleRequest(request);

    expect(response.evaluation!.evaluationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('evaluation includes moves considered', () => {
    const request = createRequest();
    const response = handleRequest(request);

    expect(response.evaluation!.movesConsidered).toBeGreaterThan(0);
  });

  it('chosen action is among the legal moves', () => {
    const request = createRequest();
    const response = handleRequest(request);

    expect(request.legalMoves).toContainEqual(response.evaluation!.action);
  });

  it('handles multiple requests independently', () => {
    const req1 = createRequest({ requestId: 'req-1', strategyId: 'random' });
    const req2 = createRequest({ requestId: 'req-2', strategyId: 'heuristic' });

    const res1 = handleRequest(req1);
    const res2 = handleRequest(req2);

    expect(res1.requestId).toBe('req-1');
    expect(res2.requestId).toBe('req-2');
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
  });
});
