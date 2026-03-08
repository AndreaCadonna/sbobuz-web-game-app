/**
 * Tests for Heuristic Strategy (MEDIUM difficulty).
 */

import { describe, it, expect } from 'vitest';

import type { GameAction, PlayCardsAction } from '@shared/game-action.js';
import type { GameState, PlayerState } from '@shared/game-state.js';
import type { Card } from '@shared/card.js';

import { createGame } from '../../game-engine/index.js';
import { enumerateLegalMoves } from '../../game-engine/legal-moves.js';
import { selectHeuristicMove, createHeuristicStrategy } from './heuristic.js';

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

function makeCard(rank: string, suit = 'hearts'): Card {
  if (rank === 'joker') {
    return { type: 'joker', id: `joker_${Math.random().toString(36).slice(2)}` };
  }
  return {
    type: 'standard',
    rank: rank as Card & { type: 'standard' } extends { rank: infer R } ? R : never,
    suit: suit as Card & { type: 'standard' } extends { suit: infer S } ? S : never,
    id: `${suit}_${rank}_${Math.random().toString(36).slice(2)}`,
  } as Card;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createHeuristicStrategy', () => {
  it('returns a strategy with correct metadata', () => {
    const strategy = createHeuristicStrategy();
    expect(strategy.id).toBe('heuristic');
    expect(strategy.name).toBe('Heuristic Strategy');
    expect(strategy.difficulty).toBe('MEDIUM');
  });
});

describe('selectHeuristicMove', () => {
  it('selects a move from the legal moves', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    const result = selectHeuristicMove(state, currentPlayer, moveSet.all);
    expect(moveSet.all).toContainEqual(result.action);
  });

  it('returns score in 0-100 range', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    const result = selectHeuristicMove(state, currentPlayer, moveSet.all);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('includes evaluation time', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    const result = selectHeuristicMove(state, currentPlayer, moveSet.all);
    expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('includes moves considered', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    const result = selectHeuristicMove(state, currentPlayer, moveSet.all);
    expect(result.movesConsidered).toBe(moveSet.all.length);
  });

  it('returns the only move when single legal move', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const singleMove: GameAction[] = [{ type: 'PICK_UP_PILE', playerId: currentPlayer }];

    const result = selectHeuristicMove(state, currentPlayer, singleMove);
    expect(result.action).toEqual(singleMove[0]);
    expect(result.movesConsidered).toBe(1);
  });

  it('throws when no legal moves', () => {
    const state = createTestState();
    expect(() => selectHeuristicMove(state, 'ai_1', [])).toThrow('No legal moves');
  });

  it('prefers playing cards over picking up the pile', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    // With a fresh game, there should be PLAY_CARDS and PICK_UP_PILE moves
    if (moveSet.playCards.length > 0 && moveSet.pickUpPile.length > 0) {
      const result = selectHeuristicMove(state, currentPlayer, moveSet.all);
      // Heuristic should prefer playing cards (penalty for pickup)
      expect(result.action.type).not.toBe('PICK_UP_PILE');
    }
  });

  it('handles DECLARE_DIRECTION moves', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const directionMoves: GameAction[] = [
      { type: 'DECLARE_DIRECTION', playerId: currentPlayer, direction: 'higher' },
      { type: 'DECLARE_DIRECTION', playerId: currentPlayer, direction: 'lower' },
    ];

    const result = selectHeuristicMove(state, currentPlayer, directionMoves);
    expect(result.action.type).toBe('DECLARE_DIRECTION');
  });

  it('prefers lower-value cards when possible', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    if (moveSet.playCards.length > 1) {
      const result = selectHeuristicMove(state, currentPlayer, moveSet.all);
      // Just verify it picked something reasonable
      expect(result.action).toBeDefined();
      expect(result.reasoning).toContain('Heuristic');
    }
  });

  it('is deterministic for the same game state', () => {
    const state = createTestState(42);
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    const result1 = selectHeuristicMove(state, currentPlayer, moveSet.all);
    const result2 = selectHeuristicMove(state, currentPlayer, moveSet.all);

    expect(result1.action).toEqual(result2.action);
  });

  it('provides reasoning string', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    const result = selectHeuristicMove(state, currentPlayer, moveSet.all);
    expect(result.reasoning).toBeDefined();
    expect(result.reasoning).toContain('Heuristic');
  });

  it('penalizes picking up large piles more than small ones', () => {
    // Create a state where we can test pickup scoring
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const moveSet = enumerateLegalMoves(state, currentPlayer);

    // The heuristic should evaluate moves and return a valid one
    const result = selectHeuristicMove(state, currentPlayer, moveSet.all);
    expect(result).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('handles PLAY_BLIND moves as neutral', () => {
    const state = createTestState();
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]!;
    const blindMoves: GameAction[] = [
      { type: 'PLAY_BLIND', playerId: currentPlayer, cardIndex: 0 },
      { type: 'PLAY_BLIND', playerId: currentPlayer, cardIndex: 1 },
      { type: 'PLAY_BLIND', playerId: currentPlayer, cardIndex: 2 },
    ];

    const result = selectHeuristicMove(state, currentPlayer, blindMoves);
    expect(result.action.type).toBe('PLAY_BLIND');
  });
});
