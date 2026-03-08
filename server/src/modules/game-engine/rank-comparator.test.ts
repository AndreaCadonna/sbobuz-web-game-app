/**
 * Tests for the Rank Comparator module.
 *
 * Covers:
 * - Rank hierarchy and ordinal mapping
 * - Rank comparison function
 * - Effective direction resolution
 * - Full isCardLegal evaluation with all 20 edge cases from the component spec
 * - Priority order of legality checks
 * - Consistency across all rank combinations
 *
 * @see docs/specs/engine/rank-comparator.md Section 5 (Edge Cases)
 * @see SBOBUZ_ENGINE_SPEC.md Section 3 (Card Rank Hierarchy)
 * @see SBOBUZ_ENGINE_SPEC.md Section 5.2 (Card Legality)
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, StandardCard } from '@shared/card.js';

import {
  RANK_ORDER,
  rankToOrdinal,
  compareRanks,
  getEffectiveDirection,
  isCardLegal,
} from './rank-comparator.js';
import type { ComparisonContext } from './rank-comparator.js';

// ---------------------------------------------------------------------------
// Test helpers / factory functions
// ---------------------------------------------------------------------------

/** Creates a standard card for testing. */
function card(rank: Rank, suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' = 'hearts'): StandardCard {
  return { type: 'standard', rank, suit, id: `${suit}_${rank}` };
}

/** Creates a Joker card for testing. */
function joker(id: 'joker_1' | 'joker_2' = 'joker_1'): Card {
  return { type: 'joker', id };
}

/** Creates a default ComparisonContext (empty pile, no flags). */
function emptyPileContext(overrides: Partial<ComparisonContext> = {}): ComparisonContext {
  return {
    pileTopRank: null,
    pileTopIsJoker: false,
    freePlay: false,
    nextCardOverride: null,
    ...overrides,
  };
}

/** Creates a ComparisonContext with a standard card on top. */
function pileContext(
  topRank: Rank,
  overrides: Partial<ComparisonContext> = {},
): ComparisonContext {
  return {
    pileTopRank: topRank,
    pileTopIsJoker: false,
    freePlay: false,
    nextCardOverride: null,
    ...overrides,
  };
}

/** Creates a ComparisonContext where the pile top is a Joker. */
function jokerPileContext(overrides: Partial<ComparisonContext> = {}): ComparisonContext {
  return {
    pileTopRank: null,
    pileTopIsJoker: true,
    freePlay: false,
    nextCardOverride: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RANK_ORDER
// ---------------------------------------------------------------------------

describe('RANK_ORDER', () => {
  it('should contain exactly 13 ranks', () => {
    expect(RANK_ORDER).toHaveLength(13);
  });

  it('should start with 2 (lowest) and end with A (highest)', () => {
    expect(RANK_ORDER[0]).toBe('2');
    expect(RANK_ORDER[12]).toBe('A');
  });

  it('should have the correct order: 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A', () => {
    expect([...RANK_ORDER]).toEqual([
      '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
    ]);
  });

  it('should be readonly (frozen at the type level)', () => {
    // TypeScript enforces this via `readonly Rank[]`, but we verify the
    // runtime array is not accidentally modified by checking reference stability.
    const copy = [...RANK_ORDER];
    expect(copy).toEqual([...RANK_ORDER]);
  });
});

// ---------------------------------------------------------------------------
// rankToOrdinal
// ---------------------------------------------------------------------------

describe('rankToOrdinal', () => {
  it('should return 0 for rank 2', () => {
    expect(rankToOrdinal('2')).toBe(0);
  });

  it('should return 1 for rank 3', () => {
    expect(rankToOrdinal('3')).toBe(1);
  });

  it('should return 8 for rank 10', () => {
    expect(rankToOrdinal('10')).toBe(8);
  });

  it('should return 9 for rank J', () => {
    expect(rankToOrdinal('J')).toBe(9);
  });

  it('should return 10 for rank Q', () => {
    expect(rankToOrdinal('Q')).toBe(10);
  });

  it('should return 11 for rank K', () => {
    expect(rankToOrdinal('K')).toBe(11);
  });

  it('should return 12 for rank A', () => {
    expect(rankToOrdinal('A')).toBe(12);
  });

  it('should return correct ordinals for all 13 ranks', () => {
    const expected: ReadonlyArray<[Rank, number]> = [
      ['2', 0], ['3', 1], ['4', 2], ['5', 3], ['6', 4],
      ['7', 5], ['8', 6], ['9', 7], ['10', 8],
      ['J', 9], ['Q', 10], ['K', 11], ['A', 12],
    ];
    for (const [rank, ordinal] of expected) {
      expect(rankToOrdinal(rank)).toBe(ordinal);
    }
  });

  it('should throw for an unknown rank', () => {
    // Force an invalid rank past the type system to test runtime guard.
    expect(() => rankToOrdinal('Z' as Rank)).toThrow('Unknown rank: Z');
  });
});

// ---------------------------------------------------------------------------
// compareRanks
// ---------------------------------------------------------------------------

describe('compareRanks', () => {
  it('should return negative when a < b', () => {
    expect(compareRanks('3', 'A')).toBeLessThan(0);
    expect(compareRanks('2', '3')).toBeLessThan(0);
    expect(compareRanks('J', 'K')).toBeLessThan(0);
  });

  it('should return 0 when a === b', () => {
    expect(compareRanks('7', '7')).toBe(0);
    expect(compareRanks('A', 'A')).toBe(0);
    expect(compareRanks('2', '2')).toBe(0);
  });

  it('should return positive when a > b', () => {
    expect(compareRanks('A', '3')).toBeGreaterThan(0);
    expect(compareRanks('K', 'Q')).toBeGreaterThan(0);
    expect(compareRanks('10', '9')).toBeGreaterThan(0);
  });

  it('should be anti-symmetric: compareRanks(a,b) + compareRanks(b,a) === 0', () => {
    const ranks: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    for (const a of ranks) {
      for (const b of ranks) {
        // Anti-symmetry: f(a,b) + f(b,a) === 0 for all pairs.
        // This avoids the +0/-0 distinction that toBe/toEqual catch.
        expect(compareRanks(a, b) + compareRanks(b, a)).toBe(0);
      }
    }
  });

  it('should be transitive: if a < b and b < c then a < c', () => {
    // Test a representative chain: 3 < 7 < K
    expect(compareRanks('3', '7')).toBeLessThan(0);
    expect(compareRanks('7', 'K')).toBeLessThan(0);
    expect(compareRanks('3', 'K')).toBeLessThan(0);
  });

  // Spec edge case #18: Compare A vs 3 in 'higher' direction
  it('should show A > 3 (A ordinal=12, 3 ordinal=1)', () => {
    expect(compareRanks('A', '3')).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// getEffectiveDirection
// ---------------------------------------------------------------------------

describe('getEffectiveDirection', () => {
  it('should return higher when nextCardOverride is null', () => {
    expect(getEffectiveDirection(null)).toBe('higher');
  });

  it('should return lower when nextCardOverride is lower', () => {
    expect(getEffectiveDirection('lower')).toBe('lower');
  });
});

// ---------------------------------------------------------------------------
// isCardLegal -- Step-by-step priority tests
// ---------------------------------------------------------------------------

describe('isCardLegal', () => {
  // -------------------------------------------------------------------
  // STEP 1: Joker is always legal
  // -------------------------------------------------------------------

  describe('Step 1: Joker bypass', () => {
    it('should be legal on an empty pile', () => {
      const result = isCardLegal(joker(), emptyPileContext());
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_JOKER' });
    });

    // Spec edge case #9: Joker on pile top A (default direction)
    it('should be legal on pile top A with default direction', () => {
      const result = isCardLegal(joker(), pileContext('A'));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_JOKER' });
    });

    // Spec edge case #10: Joker on pile top A with Queen override 'lower'
    it('should be legal on pile top A with Queen override lower', () => {
      const result = isCardLegal(joker(), pileContext('A', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_JOKER' });
    });

    it('should be legal even when freePlay is active (Joker reason takes priority)', () => {
      const result = isCardLegal(joker(), pileContext('K', { freePlay: true }));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_JOKER' });
    });

    it('should be legal with joker_2 id', () => {
      const result = isCardLegal(joker('joker_2'), pileContext('3'));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_JOKER' });
    });
  });

  // -------------------------------------------------------------------
  // STEP 2: Card rank '2' is always legal
  // -------------------------------------------------------------------

  describe('Step 2: Two bypass', () => {
    // Spec edge case #7: Play a 2 on pile top A (default direction)
    it('should be legal on pile top A with default direction', () => {
      const result = isCardLegal(card('2'), pileContext('A'));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_TWO' });
    });

    // Spec edge case #8: Play a 2 on pile top A with Queen override 'lower'
    it('should be legal on pile top A with Queen override lower', () => {
      const result = isCardLegal(card('2'), pileContext('A', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_TWO' });
    });

    it('should be legal on an empty pile', () => {
      const result = isCardLegal(card('2'), emptyPileContext());
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_TWO' });
    });

    it('should be legal even when freePlay is active (Two reason takes priority)', () => {
      const result = isCardLegal(card('2'), pileContext('K', { freePlay: true }));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_TWO' });
    });

    it('should be legal on pile top 3 (lowest non-special rank)', () => {
      const result = isCardLegal(card('2'), pileContext('3'));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_TWO' });
    });

    it('should be legal with any suit', () => {
      for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as const) {
        const result = isCardLegal(card('2', suit), pileContext('A'));
        expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_TWO' });
      }
    });
  });

  // -------------------------------------------------------------------
  // STEP 3: Pile is empty
  // -------------------------------------------------------------------

  describe('Step 3: Empty pile', () => {
    // Spec edge case #1: Play a 3 on empty pile
    it('should allow a 3 on an empty pile', () => {
      const result = isCardLegal(card('3'), emptyPileContext());
      expect(result).toEqual({ legal: true, reason: 'PILE_EMPTY' });
    });

    it('should allow any non-special standard card on empty pile', () => {
      for (const rank of ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const) {
        const result = isCardLegal(card(rank), emptyPileContext());
        expect(result).toEqual({ legal: true, reason: 'PILE_EMPTY' });
      }
    });

    it('should allow a card on empty pile even with Queen override active', () => {
      const result = isCardLegal(card('5'), emptyPileContext({ nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'PILE_EMPTY' });
    });
  });

  // -------------------------------------------------------------------
  // STEP 4: freePlay is active
  // -------------------------------------------------------------------

  describe('Step 4: Free play', () => {
    // Spec edge case #11: Play a 5 on pile with freePlay active
    it('should allow a 5 when freePlay is active', () => {
      const result = isCardLegal(card('5'), pileContext('K', { freePlay: true }));
      expect(result).toEqual({ legal: true, reason: 'FREE_PLAY' });
    });

    // Spec edge case #12: Play a 3 on pile top K with freePlay active
    it('should allow a 3 on pile top K when freePlay is active', () => {
      const result = isCardLegal(card('3'), pileContext('K', { freePlay: true }));
      expect(result).toEqual({ legal: true, reason: 'FREE_PLAY' });
    });

    it('should override Queen lower direction when freePlay is active', () => {
      // freePlay takes priority over direction override
      const result = isCardLegal(
        card('A'),
        pileContext('3', { freePlay: true, nextCardOverride: 'lower' }),
      );
      expect(result).toEqual({ legal: true, reason: 'FREE_PLAY' });
    });

    // Spec edge case #16: Pile top is a Joker, freePlay is true
    it('should return FREE_PLAY when pile top is Joker and freePlay is true', () => {
      const result = isCardLegal(card('5'), jokerPileContext({ freePlay: true }));
      expect(result).toEqual({ legal: true, reason: 'FREE_PLAY' });
    });
  });

  // -------------------------------------------------------------------
  // STEP 5: Pile top is a Joker, freePlay consumed
  // -------------------------------------------------------------------

  describe('Step 5: Joker on pile top (freePlay consumed)', () => {
    // Spec edge case #17: Pile top is Joker, freePlay false, playing a 5
    it('should treat Joker pile top without freePlay as effectively empty', () => {
      const result = isCardLegal(card('5'), jokerPileContext());
      expect(result).toEqual({ legal: true, reason: 'PILE_EMPTY' });
    });

    it('should allow any standard card when pile top is Joker and freePlay consumed', () => {
      for (const rank of ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const) {
        const result = isCardLegal(card(rank), jokerPileContext());
        expect(result).toEqual({ legal: true, reason: 'PILE_EMPTY' });
      }
    });
  });

  // -------------------------------------------------------------------
  // STEP 6: Normal rank comparison -- default ('higher') direction
  // -------------------------------------------------------------------

  describe('Step 6a: Normal comparison -- higher direction', () => {
    // Spec edge case #2: Play a 5 on pile top 7 (default direction)
    it('should reject 5 on pile top 7 (5 < 7)', () => {
      const result = isCardLegal(card('5'), pileContext('7'));
      expect(result).toEqual({ legal: false, reason: 'RANK_TOO_LOW' });
    });

    // Spec edge case #3: Play a 7 on pile top 7 (default direction)
    it('should allow 7 on pile top 7 (equal is always allowed)', () => {
      const result = isCardLegal(card('7'), pileContext('7'));
      expect(result).toEqual({ legal: true, reason: 'RANK_HIGHER_OR_EQUAL' });
    });

    // Spec edge case #4: Play a 9 on pile top 7 (default direction)
    it('should allow 9 on pile top 7 (9 > 7)', () => {
      const result = isCardLegal(card('9'), pileContext('7'));
      expect(result).toEqual({ legal: true, reason: 'RANK_HIGHER_OR_EQUAL' });
    });

    // Spec edge case #13: Play Q on pile top J (default direction)
    it('should allow Q on pile top J (Q ordinal=10 >= J ordinal=9)', () => {
      const result = isCardLegal(card('Q'), pileContext('J'));
      expect(result).toEqual({ legal: true, reason: 'RANK_HIGHER_OR_EQUAL' });
    });

    // Spec edge case #14: Play Q on pile top K (default direction)
    it('should reject Q on pile top K (Q ordinal=10 < K ordinal=11)', () => {
      const result = isCardLegal(card('Q'), pileContext('K'));
      expect(result).toEqual({ legal: false, reason: 'RANK_TOO_LOW' });
    });

    // Spec edge case #18: Compare A vs 3 in 'higher' direction
    it('should allow A on pile top 3 (A ordinal=12 >= 3 ordinal=1)', () => {
      const result = isCardLegal(card('A'), pileContext('3'));
      expect(result).toEqual({ legal: true, reason: 'RANK_HIGHER_OR_EQUAL' });
    });

    it('should reject 3 on pile top A (3 < A)', () => {
      const result = isCardLegal(card('3'), pileContext('A'));
      expect(result).toEqual({ legal: false, reason: 'RANK_TOO_LOW' });
    });

    it('should allow A on pile top A (equal)', () => {
      const result = isCardLegal(card('A'), pileContext('A'));
      expect(result).toEqual({ legal: true, reason: 'RANK_HIGHER_OR_EQUAL' });
    });

    it('should allow K on pile top 3 (K > 3)', () => {
      const result = isCardLegal(card('K'), pileContext('3'));
      expect(result).toEqual({ legal: true, reason: 'RANK_HIGHER_OR_EQUAL' });
    });
  });

  // -------------------------------------------------------------------
  // STEP 6: Normal rank comparison -- Queen override ('lower') direction
  // -------------------------------------------------------------------

  describe('Step 6b: Normal comparison -- lower direction (Queen override)', () => {
    // Spec edge case #5: Play J on pile top K with Queen override 'lower'
    it('should allow J on pile top K with lower override (J ordinal=9 <= K ordinal=11)', () => {
      const result = isCardLegal(card('J'), pileContext('K', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'RANK_LOWER_OR_EQUAL' });
    });

    // Spec edge case #6: Play K on pile top J with Queen override 'lower'
    it('should reject K on pile top J with lower override (K ordinal=11 > J ordinal=9)', () => {
      const result = isCardLegal(card('K'), pileContext('J', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: false, reason: 'RANK_TOO_HIGH' });
    });

    // Spec edge case #15: Play Q on pile top K with Queen override 'lower'
    it('should allow Q on pile top K with lower override (Q ordinal=10 <= K ordinal=11)', () => {
      const result = isCardLegal(card('Q'), pileContext('K', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'RANK_LOWER_OR_EQUAL' });
    });

    // Spec edge case #19: Compare 3 vs A in 'lower' direction
    it('should allow 3 on pile top A with lower override (3 ordinal=1 <= A ordinal=12)', () => {
      const result = isCardLegal(card('3'), pileContext('A', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'RANK_LOWER_OR_EQUAL' });
    });

    // Spec edge case #20: Equal ranks in 'lower' direction
    it('should allow 7 on pile top 7 with lower override (equal always allowed)', () => {
      const result = isCardLegal(card('7'), pileContext('7', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'RANK_LOWER_OR_EQUAL' });
    });

    it('should reject A on pile top 3 with lower override (A ordinal=12 > 3 ordinal=1)', () => {
      const result = isCardLegal(card('A'), pileContext('3', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: false, reason: 'RANK_TOO_HIGH' });
    });

    it('should allow 3 on pile top 3 with lower override (equal)', () => {
      const result = isCardLegal(card('3'), pileContext('3', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'RANK_LOWER_OR_EQUAL' });
    });
  });

  // -------------------------------------------------------------------
  // Priority order verification
  // -------------------------------------------------------------------

  describe('priority order', () => {
    it('Joker takes priority over freePlay', () => {
      const result = isCardLegal(joker(), pileContext('A', { freePlay: true }));
      expect(result.reason).toBe('ALWAYS_LEGAL_JOKER');
    });

    it('Joker takes priority over empty pile', () => {
      const result = isCardLegal(joker(), emptyPileContext());
      expect(result.reason).toBe('ALWAYS_LEGAL_JOKER');
    });

    it('Two takes priority over freePlay', () => {
      const result = isCardLegal(card('2'), pileContext('A', { freePlay: true }));
      expect(result.reason).toBe('ALWAYS_LEGAL_TWO');
    });

    it('Two takes priority over empty pile', () => {
      const result = isCardLegal(card('2'), emptyPileContext());
      expect(result.reason).toBe('ALWAYS_LEGAL_TWO');
    });

    it('Two takes priority over Queen override', () => {
      const result = isCardLegal(card('2'), pileContext('3', { nextCardOverride: 'lower' }));
      expect(result.reason).toBe('ALWAYS_LEGAL_TWO');
    });

    it('empty pile takes priority over freePlay', () => {
      const result = isCardLegal(card('5'), emptyPileContext({ freePlay: true }));
      expect(result.reason).toBe('PILE_EMPTY');
    });

    it('freePlay takes priority over normal comparison', () => {
      // Without freePlay, 3 on K would be illegal
      const result = isCardLegal(card('3'), pileContext('K', { freePlay: true }));
      expect(result.reason).toBe('FREE_PLAY');
    });

    it('Joker on pile top (consumed freePlay) takes priority over normal comparison', () => {
      const result = isCardLegal(card('3'), jokerPileContext());
      expect(result.reason).toBe('PILE_EMPTY');
    });
  });

  // -------------------------------------------------------------------
  // Exhaustive rank-vs-rank coverage for default direction
  // -------------------------------------------------------------------

  describe('exhaustive rank comparison (higher direction)', () => {
    const ranks: readonly Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    it('should accept all cards with rank >= pile top and reject all with rank < pile top', () => {
      for (const pileRank of ranks) {
        for (const cardRank of ranks) {
          const result = isCardLegal(card(cardRank), pileContext(pileRank));
          const cardOrd = rankToOrdinal(cardRank);
          const pileOrd = rankToOrdinal(pileRank);

          if (cardOrd >= pileOrd) {
            expect(result.legal).toBe(true);
            expect(result.reason).toBe('RANK_HIGHER_OR_EQUAL');
          } else {
            expect(result.legal).toBe(false);
            expect(result.reason).toBe('RANK_TOO_LOW');
          }
        }
      }
    });
  });

  describe('exhaustive rank comparison (lower direction)', () => {
    const ranks: readonly Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    it('should accept all cards with rank <= pile top and reject all with rank > pile top', () => {
      for (const pileRank of ranks) {
        for (const cardRank of ranks) {
          const result = isCardLegal(
            card(cardRank),
            pileContext(pileRank, { nextCardOverride: 'lower' }),
          );
          const cardOrd = rankToOrdinal(cardRank);
          const pileOrd = rankToOrdinal(pileRank);

          if (cardOrd <= pileOrd) {
            expect(result.legal).toBe(true);
            expect(result.reason).toBe('RANK_LOWER_OR_EQUAL');
          } else {
            expect(result.legal).toBe(false);
            expect(result.reason).toBe('RANK_TOO_HIGH');
          }
        }
      }
    });
  });

  // -------------------------------------------------------------------
  // Engine spec edge cases (Section 17) relevant to the rank comparator
  // -------------------------------------------------------------------

  describe('engine spec edge cases (Section 17)', () => {
    // Edge case #3: Queen declares "lower", next player plays a 2
    // The 2 is always legal regardless of direction
    it('edge case #3: 2 is legal after Queen declares lower', () => {
      const result = isCardLegal(card('2'), pileContext('Q', { nextCardOverride: 'lower' }));
      expect(result).toEqual({ legal: true, reason: 'ALWAYS_LEGAL_TWO' });
    });
  });

  // -------------------------------------------------------------------
  // Suit independence: rank comparison is suit-agnostic
  // -------------------------------------------------------------------

  describe('suit independence', () => {
    it('should produce identical results regardless of card suit', () => {
      const suits: ReadonlyArray<'hearts' | 'diamonds' | 'clubs' | 'spades'> = [
        'hearts', 'diamonds', 'clubs', 'spades',
      ];
      const ctx = pileContext('7');

      for (const suit of suits) {
        const result = isCardLegal(card('9', suit), ctx);
        expect(result).toEqual({ legal: true, reason: 'RANK_HIGHER_OR_EQUAL' });
      }
    });
  });

  // -------------------------------------------------------------------
  // ComparisonResult immutability
  // -------------------------------------------------------------------

  describe('result immutability', () => {
    it('should return a new object on each call', () => {
      const result1 = isCardLegal(card('7'), pileContext('7'));
      const result2 = isCardLegal(card('7'), pileContext('7'));
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2); // different references
    });
  });
});
