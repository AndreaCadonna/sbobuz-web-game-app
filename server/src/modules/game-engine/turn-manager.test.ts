/**
 * Tests for the Turn Manager module.
 *
 * Covers all 14 scenarios from the turn-manager spec plus
 * validation error cases.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 13 (Turn Advancement)
 * @see docs/specs/engine/turn-manager.md Section 6 (Edge Cases)
 */

import { describe, it, expect } from 'vitest';

import { advanceTurn } from './turn-manager.js';

// ---------------------------------------------------------------------------
// advanceTurn -- forward direction
// ---------------------------------------------------------------------------

describe('advanceTurn', () => {
  describe('forward direction (direction = 1)', () => {
    // Spec scenario #1: Normal forward, mid-sequence
    it('advances from mid-sequence (scenario #1)', () => {
      expect(advanceTurn(1, 1, 4)).toBe(2);
    });

    // Spec scenario #2: Normal forward, wrap around
    it('wraps around from last index (scenario #2)', () => {
      expect(advanceTurn(3, 1, 4)).toBe(0);
    });

    // Spec scenario #5: Two players, forward
    it('advances with 2 players (scenario #5)', () => {
      expect(advanceTurn(0, 1, 2)).toBe(1);
    });

    // Spec scenario #6: Two players, forward wrap
    it('wraps around with 2 players (scenario #6)', () => {
      expect(advanceTurn(1, 1, 2)).toBe(0);
    });

    // Spec scenario #9: Five players, forward from last
    it('wraps around with 5 players from last index (scenario #9)', () => {
      expect(advanceTurn(4, 1, 5)).toBe(0);
    });

    // Spec scenario #11: Three players, forward all positions -- full cycle
    it('completes a full forward cycle with 3 players (scenario #11)', () => {
      expect(advanceTurn(0, 1, 3)).toBe(1);
      expect(advanceTurn(1, 1, 3)).toBe(2);
      expect(advanceTurn(2, 1, 3)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // advanceTurn -- reverse direction
  // ---------------------------------------------------------------------------

  describe('reverse direction (direction = -1)', () => {
    // Spec scenario #3: Reverse, mid-sequence
    it('reverses from mid-sequence (scenario #3)', () => {
      expect(advanceTurn(2, -1, 4)).toBe(1);
    });

    // Spec scenario #4: Reverse, wrap around
    it('wraps backward from index 0 (scenario #4)', () => {
      expect(advanceTurn(0, -1, 4)).toBe(3);
    });

    // Spec scenario #7: Two players, reverse
    it('reverses with 2 players (scenario #7)', () => {
      expect(advanceTurn(0, -1, 2)).toBe(1);
    });

    // Spec scenario #8: Two players, reverse wrap
    it('wraps backward with 2 players (scenario #8)', () => {
      expect(advanceTurn(1, -1, 2)).toBe(0);
    });

    // Spec scenario #10: Five players, reverse from first
    it('wraps backward with 5 players from index 0 (scenario #10)', () => {
      expect(advanceTurn(0, -1, 5)).toBe(4);
    });

    // Spec scenario #12: Three players, reverse all positions -- full reverse cycle
    it('completes a full reverse cycle with 3 players (scenario #12)', () => {
      expect(advanceTurn(2, -1, 3)).toBe(1);
      expect(advanceTurn(1, -1, 3)).toBe(0);
      expect(advanceTurn(0, -1, 3)).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Direction change scenarios
  // ---------------------------------------------------------------------------

  describe('direction change scenarios', () => {
    // Spec scenario #13: Direction changed mid-game
    it('uses new direction after mid-game change (scenario #13)', () => {
      // Forward to index 2, then direction flips to -1
      expect(advanceTurn(2, -1, 4)).toBe(1);
    });

    // Spec scenario #14: Double reversal returns to original
    it('double reversal produces same result as original direction (scenario #14)', () => {
      // Starting from index 1 with 4 players
      // Forward: 1 -> 2
      const forwardResult = advanceTurn(1, 1, 4);
      // Reverse once: direction = -1
      // Reverse again: direction = 1 (back to original)
      let dir: 1 | -1 = 1;
      dir = (dir * -1) as 1 | -1; // first reversal
      dir = (dir * -1) as 1 | -1; // second reversal
      const doubleReversedResult = advanceTurn(1, dir, 4);
      expect(doubleReversedResult).toBe(forwardResult);
    });
  });

  // ---------------------------------------------------------------------------
  // Two-player symmetry
  // ---------------------------------------------------------------------------

  describe('two-player symmetry', () => {
    it('forward and reverse produce the same result with 2 players', () => {
      // With 2 players, advancing forward or backward always goes to the other player
      expect(advanceTurn(0, 1, 2)).toBe(1);
      expect(advanceTurn(0, -1, 2)).toBe(1);
      expect(advanceTurn(1, 1, 2)).toBe(0);
      expect(advanceTurn(1, -1, 2)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // All player counts (2-5)
  // ---------------------------------------------------------------------------

  describe('all player counts', () => {
    it.each([2, 3, 4, 5])('full forward cycle returns to start with %d players', (count) => {
      let index = 0;
      for (let i = 0; i < count; i++) {
        index = advanceTurn(index, 1, count);
      }
      expect(index).toBe(0);
    });

    it.each([2, 3, 4, 5])('full reverse cycle returns to start with %d players', (count) => {
      let index = 0;
      for (let i = 0; i < count; i++) {
        index = advanceTurn(index, -1, count);
      }
      expect(index).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation errors
  // ---------------------------------------------------------------------------

  describe('validation errors', () => {
    it('throws for playerCount < 2', () => {
      expect(() => advanceTurn(0, 1, 1)).toThrow('INVALID_PLAYER_COUNT: need at least 2 players');
    });

    it('throws for playerCount > 5', () => {
      expect(() => advanceTurn(0, 1, 6)).toThrow('INVALID_PLAYER_COUNT: maximum 5 players');
    });

    it('throws for playerCount of 0', () => {
      expect(() => advanceTurn(0, 1, 0)).toThrow('INVALID_PLAYER_COUNT');
    });

    it('throws for negative currentIndex', () => {
      expect(() => advanceTurn(-1, 1, 3)).toThrow('INDEX_OUT_OF_BOUNDS');
    });

    it('throws for currentIndex >= playerCount', () => {
      expect(() => advanceTurn(4, 1, 4)).toThrow('INDEX_OUT_OF_BOUNDS');
    });

    it('throws for currentIndex equal to playerCount', () => {
      expect(() => advanceTurn(3, 1, 3)).toThrow('INDEX_OUT_OF_BOUNDS');
    });

    // The direction type is 1 | -1, but we test the runtime guard
    it('throws for invalid direction (runtime check)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime guard
      expect(() => advanceTurn(0, 0 as any, 3)).toThrow('INVALID_DIRECTION');
    });
  });
});
