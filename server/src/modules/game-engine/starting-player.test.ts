/**
 * Tests for the Starting Player Algorithm.
 *
 * Covers:
 * - Clear winner: unique lowest card decides (Step 1).
 * - Tiebreaker on second-lowest card (Step 2).
 * - Tiebreaker on third-lowest card (Step 3).
 * - Positional advantage for exactly 2 tied players (Step 4).
 * - Random fallback for 3+ tied players or equidistant 2 (Step 5).
 * - Joker handling: treated as highest possible value.
 * - Edge cases: 1 player, 2 players, 5 players, all identical hands.
 * - Determinism: same inputs produce same output.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 4.1 (Starting Player Algorithm)
 * @see docs/specs/engine/state-factory.md Section 4.4
 * @see docs/specs/engine/state-factory.md Section 7 (Edge Cases #5-#9, #23)
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, Suit } from '@shared/card.js';
import type { PlayerState } from '@shared/game-state.js';

import { determineStartingPlayer } from './starting-player.js';
import { createRng } from './rng.js';

// ---------------------------------------------------------------------------
// Test helpers / factory functions
// ---------------------------------------------------------------------------

/** Creates a standard card for testing. */
function card(rank: Rank, suit: Suit = 'hearts'): Card {
  return { type: 'standard', rank, suit, id: `${suit}_${rank}` };
}

/** Creates a joker card for testing. */
function joker(id: 'joker_1' | 'joker_2' = 'joker_1'): Card {
  return { type: 'joker', id };
}

/**
 * Creates a minimal PlayerState with the given hand cards.
 * Face-up and face-down cards are irrelevant for starting player selection,
 * so they default to empty arrays.
 */
function player(
  id: string,
  hand: ReadonlyArray<Card>,
  faceUpCards: ReadonlyArray<Card> = [],
  faceDownCards: ReadonlyArray<Card> = [],
): PlayerState {
  return { id, hand, faceUpCards, faceDownCards };
}

/** Shorthand to create a player with hand from rank array. */
function playerWithRanks(id: string, ranks: Rank[]): PlayerState {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const hand = ranks.map((r, i) => card(r, suits[i % suits.length]!));
  return player(id, hand);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('determineStartingPlayer', () => {
  const rng = createRng(42);

  // =========================================================================
  // Step 1: Clear winner -- unique lowest card
  // =========================================================================

  describe('Step 1 -- lowest card decides', () => {
    it('player with uniquely lowest card starts (2 players)', () => {
      // Spec scenario #5: Player A has [3, 7, K], Player B has [5, 8, Q].
      // Player A starts (3 < 5).
      const players = [
        playerWithRanks('A', ['3', '7', 'K']),
        playerWithRanks('B', ['5', '8', 'Q']),
      ];
      const result = determineStartingPlayer(players, rng);
      expect(result.startingIndex).toBe(0);
    });

    it('player at later index with lowest card starts', () => {
      const players = [
        playerWithRanks('A', ['7', '8', 'K']),
        playerWithRanks('B', ['3', '9', 'Q']),
      ];
      const result = determineStartingPlayer(players, rng);
      expect(result.startingIndex).toBe(1);
    });

    it('works with 5 players and a clear winner', () => {
      const players = [
        playerWithRanks('P0', ['5', '8', 'A']),
        playerWithRanks('P1', ['4', '7', 'K']),
        playerWithRanks('P2', ['6', '9', 'Q']),
        playerWithRanks('P3', ['3', '10', 'J']),
        playerWithRanks('P4', ['7', 'J', 'A']),
      ];
      const result = determineStartingPlayer(players, rng);
      // P3 has the lowest card (3)
      expect(result.startingIndex).toBe(3);
    });

    it('2 is the lowest rank for comparison, even though it is special', () => {
      const players = [
        playerWithRanks('A', ['3', '7', 'K']),
        playerWithRanks('B', ['2', '8', 'Q']),
      ];
      const result = determineStartingPlayer(players, rng);
      // 2 is the lowest rank in the hierarchy (ordinal 0)
      expect(result.startingIndex).toBe(1);
    });

    it('does not advance the RNG when there is a clear winner', () => {
      const players = [
        playerWithRanks('A', ['3', '7', 'K']),
        playerWithRanks('B', ['5', '8', 'Q']),
      ];
      const result = determineStartingPlayer(players, rng);
      // RNG should not have been consumed
      expect(result.nextRng.state).toBe(rng.state);
    });
  });

  // =========================================================================
  // Step 2: Tiebreaker on second-lowest card
  // =========================================================================

  describe('Step 2 -- tiebreaker on second-lowest card', () => {
    it('breaks tie with second card (2 players)', () => {
      // Spec scenario #6: Player A has [3, 5, K], Player B has [3, 7, Q].
      // Tied on 3. Player A starts (5 < 7).
      const players = [
        playerWithRanks('A', ['3', '5', 'K']),
        playerWithRanks('B', ['3', '7', 'Q']),
      ];
      const result = determineStartingPlayer(players, rng);
      expect(result.startingIndex).toBe(0);
    });

    it('breaks tie with second card among 3 players', () => {
      const players = [
        playerWithRanks('P0', ['3', '9', 'K']),
        playerWithRanks('P1', ['3', '5', 'Q']),
        playerWithRanks('P2', ['3', '7', 'J']),
      ];
      const result = determineStartingPlayer(players, rng);
      // All tied on 3. P1 has lowest second card (5)
      expect(result.startingIndex).toBe(1);
    });

    it('only considers candidates still tied after step 1', () => {
      const players = [
        playerWithRanks('P0', ['4', '5', 'K']), // Eliminated at step 1 (4 > 3)
        playerWithRanks('P1', ['3', '9', 'Q']),
        playerWithRanks('P2', ['3', '6', 'J']),
      ];
      const result = determineStartingPlayer(players, rng);
      // P0 eliminated. P1 and P2 tied on 3. P2 wins with 6 < 9.
      expect(result.startingIndex).toBe(2);
    });
  });

  // =========================================================================
  // Step 3: Tiebreaker on third-lowest card
  // =========================================================================

  describe('Step 3 -- tiebreaker on third-lowest card', () => {
    it('breaks tie with third card (2 players)', () => {
      // Spec scenario #7: Player A has [3, 5, J], Player B has [3, 5, Q].
      // Tied on 3 and 5. Player A starts (J < Q).
      const players = [
        playerWithRanks('A', ['3', '5', 'J']),
        playerWithRanks('B', ['3', '5', 'Q']),
      ];
      const result = determineStartingPlayer(players, rng);
      expect(result.startingIndex).toBe(0);
    });

    it('breaks tie with third card among multiple players', () => {
      const players = [
        playerWithRanks('P0', ['3', '5', 'A']),
        playerWithRanks('P1', ['3', '5', '10']),
        playerWithRanks('P2', ['3', '5', 'K']),
      ];
      const result = determineStartingPlayer(players, rng);
      // All tied on 3 and 5. P1 has lowest third card (10)
      expect(result.startingIndex).toBe(1);
    });
  });

  // =========================================================================
  // Step 4: Positional advantage (exactly 2 tied players)
  // =========================================================================

  describe('Step 4 -- positional advantage (2 tied players)', () => {
    it('picks the player whose position lets the other play soonest (2 players total)', () => {
      // Spec scenario #8: Player A at index 0 has [3, 5, J],
      // Player B at index 1 has [3, 5, J]. All cards identical.
      // If A starts, B plays next (distance 1). If B starts, A plays next (distance 1).
      // Equidistant in a 2-player game -- goes to random.
      // But let's first test a case that IS decidable.
      // In a 3-player game with 2 tied at indices 0 and 2:
      // If 0 starts, 2 plays after distance 2. If 2 starts, 0 plays after distance 1.
      // Pick 2 because it gives 0 the shortest distance.
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['4', '6', 'K']), // Not tied
        playerWithRanks('P2', ['3', '5', 'J']),
      ];
      const result = determineStartingPlayer(players, rng);
      // P0 and P2 are tied. P1 is eliminated.
      // If P0 starts: distance to P2 = 2 steps
      // If P2 starts: distance to P0 = 1 step
      // Pick the one where the OTHER is closer: P2 starting means P0 is 1 away.
      // P0 starting means P2 is 2 away. So pick P2 (shorter distance for the other).
      expect(result.startingIndex).toBe(2);
    });

    it('picks correct player when tied at indices 0 and 1 in a 4-player game', () => {
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['3', '5', 'J']),
        playerWithRanks('P2', ['4', '6', 'K']),
        playerWithRanks('P3', ['5', '8', 'A']),
      ];
      const result = determineStartingPlayer(players, rng);
      // P0 and P1 are tied. In 4 players:
      // If P0 starts: P1 is 1 step away.
      // If P1 starts: P0 is 3 steps away.
      // P0 gives shorter distance for the other (1 < 3), so pick P0.
      expect(result.startingIndex).toBe(0);
    });

    it('picks correct player when tied at indices 1 and 3 in a 5-player game', () => {
      const players = [
        playerWithRanks('P0', ['4', '6', 'K']),
        playerWithRanks('P1', ['3', '5', 'J']),
        playerWithRanks('P2', ['5', '8', 'A']),
        playerWithRanks('P3', ['3', '5', 'J']),
        playerWithRanks('P4', ['6', '9', 'Q']),
      ];
      const result = determineStartingPlayer(players, rng);
      // P1 and P3 are tied. In 5 players:
      // If P1 starts: P3 is 2 steps away.
      // If P3 starts: P1 is 3 steps away.
      // P1 gives shorter distance (2 < 3), so pick P1.
      expect(result.startingIndex).toBe(1);
    });

    it('equidistant players in even-player game fall to random (2 players)', () => {
      // Spec scenario #8 (equidistant case):
      // 2 players at indices 0 and 1. Both are 1 step apart in either direction.
      // Equidistant -- falls to random.
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['3', '5', 'J']),
      ];
      const result = determineStartingPlayer(players, rng);
      // Since it falls to random, the result depends on the RNG seed.
      // We verify it picks one of the two and advances the RNG.
      expect([0, 1]).toContain(result.startingIndex);
      expect(result.nextRng.state).toBeGreaterThan(rng.state);
    });

    it('equidistant players in 4-player game fall to random', () => {
      // Tied at indices 0 and 2 in a 4-player game.
      // If P0 starts: P2 is 2 steps. If P2 starts: P0 is 2 steps.
      // Equidistant.
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['4', '6', 'K']),
        playerWithRanks('P2', ['3', '5', 'J']),
        playerWithRanks('P3', ['5', '8', 'A']),
      ];
      const result = determineStartingPlayer(players, rng);
      // Falls to random
      expect([0, 2]).toContain(result.startingIndex);
      expect(result.nextRng.state).toBeGreaterThan(rng.state);
    });
  });

  // =========================================================================
  // Step 5: Random fallback
  // =========================================================================

  describe('Step 5 -- random fallback', () => {
    it('falls to random for 3+ tied players', () => {
      // Spec scenario #9: Three players with identical hand ranks.
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['3', '5', 'J']),
        playerWithRanks('P2', ['3', '5', 'J']),
      ];
      const result = determineStartingPlayer(players, rng);
      expect([0, 1, 2]).toContain(result.startingIndex);
      expect(result.nextRng.state).toBeGreaterThan(rng.state);
    });

    it('random fallback is deterministic for the same seed', () => {
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['3', '5', 'J']),
        playerWithRanks('P2', ['3', '5', 'J']),
      ];
      const rng1 = createRng(99);
      const rng2 = createRng(99);
      const result1 = determineStartingPlayer(players, rng1);
      const result2 = determineStartingPlayer(players, rng2);
      expect(result1.startingIndex).toBe(result2.startingIndex);
    });

    it('different seeds may produce different results for tied players', () => {
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['3', '5', 'J']),
        playerWithRanks('P2', ['3', '5', 'J']),
      ];
      // Try many seeds -- at least some should produce different results
      const results = new Set<number>();
      for (let seed = 0; seed < 100; seed++) {
        const result = determineStartingPlayer(players, createRng(seed));
        results.add(result.startingIndex);
      }
      // With 100 seeds and 3 candidates, we should see more than 1 result
      expect(results.size).toBeGreaterThan(1);
    });

    it('all 5 players tied -- random selects one', () => {
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['3', '5', 'J']),
        playerWithRanks('P2', ['3', '5', 'J']),
        playerWithRanks('P3', ['3', '5', 'J']),
        playerWithRanks('P4', ['3', '5', 'J']),
      ];
      const result = determineStartingPlayer(players, rng);
      expect([0, 1, 2, 3, 4]).toContain(result.startingIndex);
      expect(result.nextRng.state).toBeGreaterThan(rng.state);
    });
  });

  // =========================================================================
  // Joker handling
  // =========================================================================

  describe('Joker handling', () => {
    it('Joker in hand is treated as highest value (above Ace)', () => {
      // Spec scenario #23: Jokers have no rank.
      // Holding a Joker is never an advantage for starting.
      const players = [
        player('A', [card('3'), card('5'), joker('joker_1')]),
        playerWithRanks('B', ['3', '5', 'K']),
      ];
      const result = determineStartingPlayer(players, rng);
      // Both tied on 3 and 5. A has Joker (ordinal 13), B has K (ordinal 11).
      // B wins with K < Joker.
      expect(result.startingIndex).toBe(1);
    });

    it('Joker vs Ace: Joker is higher than Ace', () => {
      const players = [
        player('A', [card('3'), card('5'), joker('joker_1')]),
        playerWithRanks('B', ['3', '5', 'A']),
      ];
      const result = determineStartingPlayer(players, rng);
      // Both tied on 3 and 5. A has Joker (ordinal 13), B has A (ordinal 12).
      // B wins.
      expect(result.startingIndex).toBe(1);
    });

    it('two Jokers in hand makes a very high hand', () => {
      const players = [
        player('A', [card('3'), joker('joker_1'), joker('joker_2')]),
        playerWithRanks('B', ['3', 'K', 'A']),
      ];
      const result = determineStartingPlayer(players, rng);
      // A: sorted ordinals [1, 13, 13]. B: sorted ordinals [1, 11, 12].
      // Tied on first (1 == 1). Second: 13 vs 11. B wins (11 < 13).
      expect(result.startingIndex).toBe(1);
    });

    it('Joker as lowest card in hand (impossible in practice, but handled)', () => {
      // If all 3 cards are special: Joker + Joker + 2
      const players = [
        player('A', [joker('joker_1'), joker('joker_2'), card('2')]),
        playerWithRanks('B', ['3', '5', '7']),
      ];
      const result = determineStartingPlayer(players, rng);
      // A: sorted ordinals [0, 13, 13]. B: sorted ordinals [1, 3, 5].
      // A has lowest first card (0 < 1). A starts.
      expect(result.startingIndex).toBe(0);
    });
  });

  // =========================================================================
  // Hand sorting -- unsorted input
  // =========================================================================

  describe('hand sorting', () => {
    it('handles unsorted hands correctly', () => {
      // Cards in hand are not necessarily sorted. The algorithm should
      // sort them before comparing.
      const players = [
        playerWithRanks('A', ['K', '3', '7']), // Sorted: [3, 7, K]
        playerWithRanks('B', ['Q', '5', '8']), // Sorted: [5, 8, Q]
      ];
      const result = determineStartingPlayer(players, rng);
      // A has lowest card (3 < 5)
      expect(result.startingIndex).toBe(0);
    });

    it('hand order does not affect the result', () => {
      const players1 = [
        playerWithRanks('A', ['3', '5', 'J']),
        playerWithRanks('B', ['3', '7', 'Q']),
      ];
      const players2 = [
        playerWithRanks('A', ['J', '3', '5']),
        playerWithRanks('B', ['Q', '3', '7']),
      ];
      const result1 = determineStartingPlayer(players1, rng);
      const result2 = determineStartingPlayer(players2, rng);
      expect(result1.startingIndex).toBe(result2.startingIndex);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('single player returns index 0 without using RNG', () => {
      const players = [playerWithRanks('solo', ['3', '5', 'J'])];
      const result = determineStartingPlayer(players, rng);
      expect(result.startingIndex).toBe(0);
      expect(result.nextRng.state).toBe(rng.state);
    });

    it('throws on empty players array', () => {
      expect(() => determineStartingPlayer([], rng)).toThrow('EMPTY_PLAYERS');
    });

    it('face-up and face-down cards do not affect the result', () => {
      // Only hand cards matter. Even if face-up cards have lower ranks.
      const p1 = player(
        'A',
        [card('7'), card('8'), card('K')],
        [card('2'), card('3'), card('4')], // Lower face-up cards
        [card('2', 'diamonds'), card('3', 'diamonds'), card('4', 'diamonds')],
      );
      const p2 = player(
        'B',
        [card('5', 'spades'), card('6', 'spades'), card('Q', 'spades')],
        [card('A'), card('A', 'diamonds'), card('A', 'clubs')], // Higher face-up
        [],
      );
      const result = determineStartingPlayer([p1, p2], rng);
      // P2 has lowest hand card (5 < 7), despite P1 having lower face-up cards
      expect(result.startingIndex).toBe(1);
    });

    it('handles all players having the same single lowest rank differently across suits', () => {
      // All have a 3, but the second cards differ
      const players = [
        playerWithRanks('P0', ['3', '10', 'A']),
        playerWithRanks('P1', ['3', '8', 'K']),
        playerWithRanks('P2', ['3', '6', 'Q']),
      ];
      const result = determineStartingPlayer(players, rng);
      // All tied on 3. P2 has lowest second (6)
      expect(result.startingIndex).toBe(2);
    });
  });

  // =========================================================================
  // Determinism
  // =========================================================================

  describe('determinism', () => {
    it('same inputs always produce same output', () => {
      const players = [
        playerWithRanks('A', ['3', '5', 'J']),
        playerWithRanks('B', ['4', '7', 'Q']),
      ];
      const rng1 = createRng(42);
      const rng2 = createRng(42);

      const result1 = determineStartingPlayer(players, rng1);
      const result2 = determineStartingPlayer(players, rng2);
      expect(result1.startingIndex).toBe(result2.startingIndex);
      expect(result1.nextRng).toEqual(result2.nextRng);
    });

    it('random tiebreaker is deterministic for same RNG state', () => {
      const players = [
        playerWithRanks('P0', ['3', '5', 'J']),
        playerWithRanks('P1', ['3', '5', 'J']),
        playerWithRanks('P2', ['3', '5', 'J']),
      ];
      const rng1 = createRng(12345);
      const rng2 = createRng(12345);
      const result1 = determineStartingPlayer(players, rng1);
      const result2 = determineStartingPlayer(players, rng2);
      expect(result1.startingIndex).toBe(result2.startingIndex);
    });
  });

  // =========================================================================
  // Integration: works correctly with realistic dealt hands
  // =========================================================================

  describe('realistic dealt hands', () => {
    it('handles a mix of ranks and suits correctly', () => {
      const players = [
        player('Alice', [
          { type: 'standard', rank: '7', suit: 'hearts', id: 'hearts_7' },
          { type: 'standard', rank: 'Q', suit: 'spades', id: 'spades_Q' },
          { type: 'standard', rank: '4', suit: 'clubs', id: 'clubs_4' },
        ]),
        player('Bob', [
          { type: 'standard', rank: '5', suit: 'diamonds', id: 'diamonds_5' },
          { type: 'standard', rank: '9', suit: 'hearts', id: 'hearts_9' },
          { type: 'standard', rank: 'K', suit: 'clubs', id: 'clubs_K' },
        ]),
        player('Charlie', [
          { type: 'standard', rank: '3', suit: 'spades', id: 'spades_3' },
          { type: 'standard', rank: '8', suit: 'diamonds', id: 'diamonds_8' },
          { type: 'standard', rank: 'J', suit: 'hearts', id: 'hearts_J' },
        ]),
      ];
      const result = determineStartingPlayer(players, rng);
      // Alice: sorted [4, 7, Q]. Bob: sorted [5, 9, K]. Charlie: sorted [3, 8, J].
      // Charlie has the lowest first card (3).
      expect(result.startingIndex).toBe(2);
    });
  });
});
