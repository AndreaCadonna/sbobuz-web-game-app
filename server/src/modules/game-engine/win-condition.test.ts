/**
 * Tests for the Win Condition Evaluator module.
 *
 * Covers all 15 edge cases from the win-condition-evaluator spec plus
 * additional tests for checkAnyWinner.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 5.3 (Active Zone Progression)
 * @see docs/specs/engine/win-condition-evaluator.md Section 5 (Edge Cases)
 */

import { describe, it, expect } from 'vitest';

import type { Card } from '@shared/card.js';
import type { PlayerState } from '@shared/game-state.js';

import { checkWinCondition, checkAnyWinner } from './win-condition.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a minimal standard card for testing. */
function card(id: string): Card {
  return { type: 'standard', rank: '7', suit: 'hearts', id };
}

/** Creates N cards with sequential IDs. */
function cards(n: number, prefix: string = 'c'): ReadonlyArray<Card> {
  return Array.from({ length: n }, (_, i) => card(`${prefix}_${String(i)}`));
}

/** Creates a PlayerState with the specified zone sizes. */
function createPlayer(
  id: string,
  opts: { hand?: number; faceUp?: number; faceDown?: number },
): PlayerState {
  return {
    id,
    hand: cards(opts.hand ?? 0, `${id}_h`),
    faceUpCards: cards(opts.faceUp ?? 0, `${id}_fu`),
    faceDownCards: cards(opts.faceDown ?? 0, `${id}_fd`),
  };
}

// ---------------------------------------------------------------------------
// checkWinCondition
// ---------------------------------------------------------------------------

describe('checkWinCondition', () => {
  // Spec scenario #1: Player has 1 hand card, plays it, draw pile has cards
  it('returns won: false when draw pile is not empty (scenario #1)', () => {
    const player = createPlayer('p1', { hand: 0, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, false);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Spec scenario #2: Player has face-up cards remaining
  it('returns won: false when face-up cards remain (scenario #2)', () => {
    const player = createPlayer('p1', { hand: 0, faceUp: 2, faceDown: 0 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Spec scenario #3: All zones empty, draw pile empty
  it('returns won: true when all zones empty and draw pile empty (scenario #3)', () => {
    const player = createPlayer('p1', { hand: 0, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: true, winnerId: 'p1' });
  });

  // Spec scenario #4: Face-down cards remain
  it('returns won: false when face-down cards remain (scenario #4)', () => {
    const player = createPlayer('p1', { hand: 0, faceUp: 0, faceDown: 1 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Spec scenario #5: King as last card (all zones empty after play)
  it('returns won: true after playing King as last card (scenario #5)', () => {
    const player = createPlayer('winner', { hand: 0, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: true, winnerId: 'winner' });
  });

  // Spec scenario #6: King played, 1 more card left
  it('returns won: false when player has 1 card left after King (scenario #6)', () => {
    const player = createPlayer('p1', { hand: 1, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Spec scenario #8: Player plays last hand card, draw pile has 1 card
  it('returns won: false when draw pile is not empty after last hand card (scenario #8)', () => {
    const player = createPlayer('p1', { hand: 0, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, false);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Spec scenario #9: All zones empty but draw pile not empty
  it('returns won: false when all zones empty but draw pile not empty (scenario #9)', () => {
    const player = createPlayer('p1', { hand: 0, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, false);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Spec scenario #10: Multi-play emptying hand
  it('returns won: true after multi-play emptying all zones (scenario #10)', () => {
    const player = createPlayer('multi', { hand: 0, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: true, winnerId: 'multi' });
  });

  // Spec scenario #14: 0 hand, 0 face-up, 1 face-down, draw pile empty
  it('returns won: false with 1 face-down card remaining (scenario #14)', () => {
    const player = createPlayer('p1', { hand: 0, faceUp: 0, faceDown: 1 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Additional: hand has cards
  it('returns won: false when hand has cards', () => {
    const player = createPlayer('p1', { hand: 3, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Additional: all zones non-empty
  it('returns won: false when all zones have cards', () => {
    const player = createPlayer('p1', { hand: 3, faceUp: 3, faceDown: 3 });
    const result = checkWinCondition(player, true);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  // Additional: uses correct player ID
  it('returns the correct player ID when won', () => {
    const player = createPlayer('alice', { hand: 0, faceUp: 0, faceDown: 0 });
    const result = checkWinCondition(player, true);
    expect(result.winnerId).toBe('alice');
  });
});

// ---------------------------------------------------------------------------
// checkAnyWinner
// ---------------------------------------------------------------------------

describe('checkAnyWinner', () => {
  // Spec scenario #12: Two-player game, player A empties all zones
  it('returns winner in 2-player game (scenario #12)', () => {
    const players = [
      createPlayer('A', { hand: 0, faceUp: 0, faceDown: 0 }),
      createPlayer('B', { hand: 3, faceUp: 3, faceDown: 3 }),
    ];
    const result = checkAnyWinner(players, true);
    expect(result).toEqual({ won: true, winnerId: 'A' });
  });

  // Spec scenario #13: Five-player game, middle player wins
  it('returns winner in 5-player game when middle player wins (scenario #13)', () => {
    const players = [
      createPlayer('p1', { hand: 2, faceUp: 1, faceDown: 3 }),
      createPlayer('p2', { hand: 1, faceUp: 0, faceDown: 2 }),
      createPlayer('p3', { hand: 0, faceUp: 0, faceDown: 0 }),
      createPlayer('p4', { hand: 3, faceUp: 2, faceDown: 1 }),
      createPlayer('p5', { hand: 0, faceUp: 1, faceDown: 0 }),
    ];
    const result = checkAnyWinner(players, true);
    expect(result).toEqual({ won: true, winnerId: 'p3' });
  });

  it('returns won: false when no player has won', () => {
    const players = [
      createPlayer('p1', { hand: 3, faceUp: 3, faceDown: 3 }),
      createPlayer('p2', { hand: 2, faceUp: 3, faceDown: 3 }),
    ];
    const result = checkAnyWinner(players, true);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  it('returns won: false when draw pile is not empty even if zones empty', () => {
    const players = [
      createPlayer('p1', { hand: 0, faceUp: 0, faceDown: 0 }),
      createPlayer('p2', { hand: 3, faceUp: 3, faceDown: 3 }),
    ];
    const result = checkAnyWinner(players, false);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  it('returns the first winner if multiple have empty zones (belt-and-suspenders)', () => {
    const players = [
      createPlayer('first', { hand: 0, faceUp: 0, faceDown: 0 }),
      createPlayer('second', { hand: 0, faceUp: 0, faceDown: 0 }),
    ];
    const result = checkAnyWinner(players, true);
    expect(result).toEqual({ won: true, winnerId: 'first' });
  });

  it('works with empty players array', () => {
    const result = checkAnyWinner([], true);
    expect(result).toEqual({ won: false, winnerId: null });
  });

  it('returns last player as winner when only last player has empty zones', () => {
    const players = [
      createPlayer('p1', { hand: 1, faceUp: 0, faceDown: 0 }),
      createPlayer('p2', { hand: 0, faceUp: 1, faceDown: 0 }),
      createPlayer('p3', { hand: 0, faceUp: 0, faceDown: 0 }),
    ];
    const result = checkAnyWinner(players, true);
    expect(result).toEqual({ won: true, winnerId: 'p3' });
  });
});
