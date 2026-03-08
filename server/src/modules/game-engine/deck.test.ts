/**
 * Tests for the Deck Builder and Dealer module.
 *
 * Covers:
 * - Deck creation: correct card count, types, IDs, and order.
 * - Deck shuffling: determinism, different seeds produce different orders.
 * - Card dealing: correct distribution across zones, draw pile sizes.
 * - Edge cases: 2-player and 5-player games, card uniqueness,
 *   card conservation (no cards lost or duplicated).
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 2 (Deck Composition)
 * @see SBOBUZ_ENGINE_SPEC.md Section 4 (Setup & Deal)
 * @see docs/specs/engine/state-factory.md Section 7 (Edge Cases)
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, Suit } from '@shared/card.js';

import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { createRng } from './rng.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Returns all card IDs from a deck. */
function cardIds(cards: ReadonlyArray<Card>): string[] {
  return cards.map((c) => c.id);
}

/** Collects all cards from a deal result (all player zones + draw pile). */
function collectAllCards(
  players: ReadonlyArray<{ readonly hand: ReadonlyArray<Card>; readonly faceUpCards: ReadonlyArray<Card>; readonly faceDownCards: ReadonlyArray<Card> }>,
  drawPile: ReadonlyArray<Card>,
): Card[] {
  const all: Card[] = [];
  for (const player of players) {
    all.push(...player.faceDownCards);
    all.push(...player.faceUpCards);
    all.push(...player.hand);
  }
  all.push(...drawPile);
  return all;
}

// ---------------------------------------------------------------------------
// createDeck
// ---------------------------------------------------------------------------

describe('createDeck', () => {
  it('returns exactly 54 cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(54);
  });

  it('contains 52 standard cards and 2 jokers', () => {
    const deck = createDeck();
    const standard = deck.filter((c) => c.type === 'standard');
    const jokers = deck.filter((c) => c.type === 'joker');
    expect(standard).toHaveLength(52);
    expect(jokers).toHaveLength(2);
  });

  it('has all 4 suits with 13 ranks each', () => {
    const deck = createDeck();
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    for (const suit of suits) {
      const suitCards = deck.filter(
        (c) => c.type === 'standard' && c.suit === suit,
      );
      expect(suitCards).toHaveLength(13);

      const suitRanks = suitCards.map((c) => {
        if (c.type === 'standard') return c.rank;
        return undefined;
      });
      for (const rank of ranks) {
        expect(suitRanks).toContain(rank);
      }
    }
  });

  it('has joker_1 and joker_2', () => {
    const deck = createDeck();
    const jokerIds = deck.filter((c) => c.type === 'joker').map((c) => c.id);
    expect(jokerIds).toContain('joker_1');
    expect(jokerIds).toContain('joker_2');
  });

  it('all card IDs are unique', () => {
    // Spec scenario #22: Card ID uniqueness
    const deck = createDeck();
    const ids = cardIds(deck);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(54);
  });

  it('uses the ID format "{suit}_{rank}" for standard cards', () => {
    const deck = createDeck();
    const standard = deck.filter((c) => c.type === 'standard');
    for (const c of standard) {
      if (c.type === 'standard') {
        expect(c.id).toBe(`${c.suit}_${c.rank}`);
      }
    }
  });

  it('creates cards in deterministic order: suits then ranks, jokers last', () => {
    const deck = createDeck();

    // First card should be hearts_2
    expect(deck[0]).toEqual({
      type: 'standard',
      rank: '2',
      suit: 'hearts',
      id: 'hearts_2',
    });

    // 13th card (index 12) should be hearts_A
    expect(deck[12]).toEqual({
      type: 'standard',
      rank: 'A',
      suit: 'hearts',
      id: 'hearts_A',
    });

    // 14th card (index 13) should be diamonds_2
    expect(deck[13]).toEqual({
      type: 'standard',
      rank: '2',
      suit: 'diamonds',
      id: 'diamonds_2',
    });

    // Last two should be jokers
    expect(deck[52]).toEqual({ type: 'joker', id: 'joker_1' });
    expect(deck[53]).toEqual({ type: 'joker', id: 'joker_2' });
  });

  it('returns the same deck on every call (deterministic)', () => {
    const deck1 = createDeck();
    const deck2 = createDeck();
    expect(deck1).toEqual(deck2);
  });
});

// ---------------------------------------------------------------------------
// shuffleDeck
// ---------------------------------------------------------------------------

describe('shuffleDeck', () => {
  it('returns a deck with the same 54 cards', () => {
    const deck = createDeck();
    const rng = createRng(42);
    const { value: shuffled } = shuffleDeck(deck, rng);

    expect(shuffled).toHaveLength(54);

    // Same set of IDs
    const originalIds = new Set(cardIds(deck));
    const shuffledIds = new Set(cardIds(shuffled));
    expect(shuffledIds).toEqual(originalIds);
  });

  it('produces a different order from the original (with high probability)', () => {
    const deck = createDeck();
    const rng = createRng(42);
    const { value: shuffled } = shuffleDeck(deck, rng);

    // Very unlikely that shuffling keeps the same order
    const originalIds = cardIds(deck);
    const shuffledCardIds = cardIds(shuffled);
    expect(shuffledCardIds).not.toEqual(originalIds);
  });

  it('is deterministic: same seed produces same shuffle', () => {
    // Spec scenario #3: Same seed produces identical state
    const deck = createDeck();

    const rng1 = createRng(42);
    const { value: shuffled1 } = shuffleDeck(deck, rng1);

    const rng2 = createRng(42);
    const { value: shuffled2 } = shuffleDeck(deck, rng2);

    expect(cardIds(shuffled1)).toEqual(cardIds(shuffled2));
  });

  it('different seeds produce different shuffles', () => {
    // Spec scenario #4: Different seeds produce different states
    const deck = createDeck();

    const rng1 = createRng(42);
    const { value: shuffled1 } = shuffleDeck(deck, rng1);

    const rng2 = createRng(43);
    const { value: shuffled2 } = shuffleDeck(deck, rng2);

    expect(cardIds(shuffled1)).not.toEqual(cardIds(shuffled2));
  });

  it('does not mutate the input deck', () => {
    const deck = createDeck();
    const originalIds = cardIds(deck);
    const rng = createRng(42);

    shuffleDeck(deck, rng);

    expect(cardIds(deck)).toEqual(originalIds);
  });

  it('advances the RNG state', () => {
    const deck = createDeck();
    const rng = createRng(42);
    const { nextRng } = shuffleDeck(deck, rng);

    expect(nextRng.state).toBeGreaterThan(rng.state);
    // Fisher-Yates on 54 cards uses 53 swaps
    expect(nextRng.state).toBe(53);
  });
});

// ---------------------------------------------------------------------------
// dealCards
// ---------------------------------------------------------------------------

describe('dealCards', () => {
  /** Helper to create a shuffled deck for dealing tests. */
  function getShuffledDeck(seed = 42): ReadonlyArray<Card> {
    const deck = createDeck();
    const rng = createRng(seed);
    const { value: shuffled } = shuffleDeck(deck, rng);
    return shuffled;
  }

  describe('2-player game', () => {
    // Spec scenario #1: 2-player game setup
    it('deals 9 cards per player with 36 in draw pile', () => {
      const deck = getShuffledDeck();
      const result = dealCards(deck, ['alice', 'bob']);

      expect(result.players).toHaveLength(2);
      expect(result.drawPile).toHaveLength(36);

      for (const player of result.players) {
        expect(player.hand).toHaveLength(3);
        expect(player.faceUpCards).toHaveLength(3);
        expect(player.faceDownCards).toHaveLength(3);
      }
    });
  });

  describe('3-player game', () => {
    it('deals 9 cards per player with 27 in draw pile', () => {
      const deck = getShuffledDeck();
      const result = dealCards(deck, ['alice', 'bob', 'charlie']);

      expect(result.players).toHaveLength(3);
      expect(result.drawPile).toHaveLength(27);

      for (const player of result.players) {
        expect(player.hand).toHaveLength(3);
        expect(player.faceUpCards).toHaveLength(3);
        expect(player.faceDownCards).toHaveLength(3);
      }
    });
  });

  describe('4-player game', () => {
    it('deals 9 cards per player with 18 in draw pile', () => {
      const deck = getShuffledDeck();
      const result = dealCards(deck, ['alice', 'bob', 'charlie', 'dave']);

      expect(result.players).toHaveLength(4);
      expect(result.drawPile).toHaveLength(18);

      for (const player of result.players) {
        expect(player.hand).toHaveLength(3);
        expect(player.faceUpCards).toHaveLength(3);
        expect(player.faceDownCards).toHaveLength(3);
      }
    });
  });

  describe('5-player game', () => {
    // Spec scenario #2: 5-player game setup
    it('deals 9 cards per player with 9 in draw pile', () => {
      const deck = getShuffledDeck();
      const result = dealCards(deck, ['p1', 'p2', 'p3', 'p4', 'p5']);

      expect(result.players).toHaveLength(5);
      expect(result.drawPile).toHaveLength(9);

      for (const player of result.players) {
        expect(player.hand).toHaveLength(3);
        expect(player.faceUpCards).toHaveLength(3);
        expect(player.faceDownCards).toHaveLength(3);
      }
    });
  });

  describe('card conservation', () => {
    it('all 54 cards are accounted for across all zones and draw pile', () => {
      // Spec scenario #10: All cards accounted for
      const deck = getShuffledDeck();
      const result = dealCards(deck, ['alice', 'bob', 'charlie']);
      const allCards = collectAllCards(result.players, result.drawPile);

      expect(allCards).toHaveLength(54);

      // No duplicates
      const ids = allCards.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(54);

      // Same set as original deck
      const deckIds = new Set(cardIds(deck));
      expect(uniqueIds).toEqual(deckIds);
    });

    it('card conservation holds for all player counts', () => {
      for (let playerCount = 2; playerCount <= 5; playerCount++) {
        const playerIds = Array.from({ length: playerCount }, (_, i) => `player_${String(i)}`);
        const deck = getShuffledDeck(playerCount * 7);
        const result = dealCards(deck, playerIds);
        const allCards = collectAllCards(result.players, result.drawPile);

        expect(allCards).toHaveLength(54);
        const ids = new Set(allCards.map((c) => c.id));
        expect(ids.size).toBe(54);
      }
    });
  });

  describe('deal order', () => {
    it('deals face-down first, then face-up, then hand from top of deck', () => {
      // The first player gets deck[0..2] as face-down, deck[3..5] as face-up,
      // deck[6..8] as hand.
      const deck = getShuffledDeck();
      const result = dealCards(deck, ['alice', 'bob']);

      // Alice's face-down cards should be the first 3 cards from the shuffled deck
      expect(cardIds(result.players[0]!.faceDownCards)).toEqual(
        cardIds(deck.slice(0, 3)),
      );

      // Alice's face-up cards should be the next 3
      expect(cardIds(result.players[0]!.faceUpCards)).toEqual(
        cardIds(deck.slice(3, 6)),
      );

      // Alice's hand cards should be the next 3
      expect(cardIds(result.players[0]!.hand)).toEqual(
        cardIds(deck.slice(6, 9)),
      );

      // Bob's face-down should be the next 3 (indices 9-11)
      expect(cardIds(result.players[1]!.faceDownCards)).toEqual(
        cardIds(deck.slice(9, 12)),
      );

      // Bob's face-up should be indices 12-14
      expect(cardIds(result.players[1]!.faceUpCards)).toEqual(
        cardIds(deck.slice(12, 15)),
      );

      // Bob's hand should be indices 15-17
      expect(cardIds(result.players[1]!.hand)).toEqual(
        cardIds(deck.slice(15, 18)),
      );

      // Draw pile should be remaining cards from index 18
      expect(cardIds(result.drawPile)).toEqual(cardIds(deck.slice(18)));
    });
  });

  describe('player IDs', () => {
    it('preserves player IDs in the same order', () => {
      const deck = getShuffledDeck();
      const ids = ['zulu', 'alpha', 'mike'];
      const result = dealCards(deck, ids);

      expect(result.players.map((p) => p.id)).toEqual(ids);
    });
  });

  describe('determinism', () => {
    it('same deck and player list produces same deal', () => {
      const deck = getShuffledDeck();
      const playerIds = ['alice', 'bob', 'charlie'];

      const result1 = dealCards(deck, playerIds);
      const result2 = dealCards(deck, playerIds);

      expect(result1).toEqual(result2);
    });
  });

  describe('validation', () => {
    it('throws on 0 players', () => {
      const deck = getShuffledDeck();
      expect(() => dealCards(deck, [])).toThrow('INVALID_PLAYER_COUNT');
    });

    it('throws on 1 player', () => {
      const deck = getShuffledDeck();
      expect(() => dealCards(deck, ['solo'])).toThrow('INVALID_PLAYER_COUNT');
    });

    it('throws on 6 players', () => {
      const deck = getShuffledDeck();
      const sixPlayers = ['a', 'b', 'c', 'd', 'e', 'f'];
      expect(() => dealCards(deck, sixPlayers)).toThrow('INVALID_PLAYER_COUNT');
    });

    it('throws if deck is not 54 cards', () => {
      const shortDeck = createDeck().slice(0, 50);
      expect(() => dealCards(shortDeck, ['alice', 'bob'])).toThrow('INVALID_DECK_SIZE');
    });

    it('throws if deck is larger than 54 cards', () => {
      const deck = createDeck();
      const longDeck = [...deck, ...deck.slice(0, 2)];
      expect(() => dealCards(longDeck, ['alice', 'bob'])).toThrow('INVALID_DECK_SIZE');
    });
  });

  describe('draw pile convention', () => {
    it('draw pile index 0 is the top card (first to be drawn)', () => {
      // Spec scenario #14: Draw pile convention (index 0 = top)
      // The draw pile is the remainder of the shuffled deck after dealing.
      // Index 0 of the draw pile is the first card that would be drawn.
      const deck = getShuffledDeck();
      const result = dealCards(deck, ['alice', 'bob']);

      // For 2 players, 18 cards dealt. Draw pile starts at index 18.
      expect(result.drawPile[0]).toEqual(deck[18]);
    });
  });
});
