/**
 * Deck Builder and Dealer for the Sbobuz game engine.
 *
 * Creates the standard 54-card deck (52 standard + 2 jokers), shuffles it
 * using a seeded PRNG, and deals cards to players in the correct order:
 * 3 face-down, 3 face-up, 3 hand per player.
 *
 * All functions are pure, deterministic, and free of side effects.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 2 (Deck Composition)
 * @see SBOBUZ_ENGINE_SPEC.md Section 4 (Setup & Deal)
 * @see docs/specs/engine/state-factory.md Section 4.1-4.3
 */

import type { Card, JokerCard, Rank, StandardCard, Suit } from '@shared/card.js';
import type { PlayerState } from '@shared/game-state.js';

import type { RNGResult, SeededRNG } from './rng.js';
import { shuffle } from './rng.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All four suits in the fixed creation order. */
const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'] as const;

/** All thirteen ranks in the fixed creation order. */
const RANKS: readonly Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
] as const;

/** Total cards in a Sbobuz deck. */
const DECK_SIZE = 54;

/** Cards dealt to each player (3 face-down + 3 face-up + 3 hand). */
const CARDS_PER_PLAYER = 9;

/** Cards in each zone per player. */
const CARDS_PER_ZONE = 3;

// ---------------------------------------------------------------------------
// Types owned by this module
// ---------------------------------------------------------------------------

/**
 * The result of dealing cards to all players.
 *
 * Contains the player states with their dealt cards and the remaining
 * draw pile.
 */
export interface DealResult {
  /** Player states in the same order as the input player IDs. */
  readonly players: ReadonlyArray<PlayerState>;
  /** Remaining cards after dealing, forming the draw pile (index 0 = top). */
  readonly drawPile: ReadonlyArray<Card>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates the standard 54-card Sbobuz deck in a fixed, deterministic order.
 *
 * The deck is NOT shuffled. Cards are created in this order:
 * 1. For each suit in ['hearts', 'diamonds', 'clubs', 'spades']:
 *    For each rank in ['2', '3', ..., 'K', 'A']:
 *      Create a StandardCard with id = '{suit}_{rank}'.
 * 2. Joker with id = 'joker_1'.
 * 3. Joker with id = 'joker_2'.
 *
 * @returns An unshuffled deck of 54 cards.
 *
 * @example
 * ```typescript
 * const deck = createDeck();
 * // deck.length === 54
 * // deck[0] === { type: 'standard', rank: '2', suit: 'hearts', id: 'hearts_2' }
 * // deck[52] === { type: 'joker', id: 'joker_1' }
 * // deck[53] === { type: 'joker', id: 'joker_2' }
 * ```
 */
export function createDeck(): ReadonlyArray<Card> {
  const cards: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const standardCard: StandardCard = {
        type: 'standard',
        rank,
        suit,
        id: `${suit}_${rank}`,
      };
      cards.push(standardCard);
    }
  }

  const joker1: JokerCard = { type: 'joker', id: 'joker_1' };
  const joker2: JokerCard = { type: 'joker', id: 'joker_2' };
  cards.push(joker1, joker2);

  return cards;
}

/**
 * Shuffles a deck using the seeded PRNG.
 *
 * Returns a new shuffled array and the advanced RNG state. The input
 * deck is never mutated.
 *
 * @param deck - The deck to shuffle. Not mutated.
 * @param rng - The current RNG instance.
 * @returns An RNGResult containing the shuffled deck and the next RNG state.
 *
 * @example
 * ```typescript
 * const deck = createDeck();
 * const rng = createRng(42);
 * const { value: shuffled, nextRng } = shuffleDeck(deck, rng);
 * ```
 */
export function shuffleDeck(
  deck: ReadonlyArray<Card>,
  rng: SeededRNG,
): RNGResult<ReadonlyArray<Card>> {
  return shuffle(rng, deck);
}

/**
 * Deals cards from a shuffled deck to create player states.
 *
 * Cards are dealt from the top of the deck (index 0). For each player
 * in order:
 * 1. Deal 3 cards face-down (take next 3 from deck).
 * 2. Deal 3 cards face-up (take next 3 from deck).
 * 3. Deal 3 cards to hand (take next 3 from deck).
 *
 * The remaining cards form the draw pile.
 *
 * @param shuffledDeck - The shuffled deck to deal from. Must have exactly 54 cards.
 * @param playerIds - The player IDs in seating order. Must be 2-5 players.
 * @returns A DealResult with player states and the remaining draw pile.
 * @throws {Error} If the player count is not 2-5.
 * @throws {Error} If the deck does not have exactly 54 cards.
 *
 * @example
 * ```typescript
 * const result = dealCards(shuffledDeck, ['alice', 'bob']);
 * // result.players.length === 2
 * // result.players[0].hand.length === 3
 * // result.players[0].faceUpCards.length === 3
 * // result.players[0].faceDownCards.length === 3
 * // result.drawPile.length === 36
 * ```
 */
export function dealCards(
  shuffledDeck: ReadonlyArray<Card>,
  playerIds: ReadonlyArray<string>,
): DealResult {
  if (playerIds.length < 2 || playerIds.length > 5) {
    throw new Error(
      `INVALID_PLAYER_COUNT: must be 2-5 players, got ${String(playerIds.length)}`,
    );
  }

  if (shuffledDeck.length !== DECK_SIZE) {
    throw new Error(
      `INVALID_DECK_SIZE: deck must have ${String(DECK_SIZE)} cards, got ${String(shuffledDeck.length)}`,
    );
  }

  const totalCardsDealt = playerIds.length * CARDS_PER_PLAYER;
  let deckIndex = 0;

  const players: PlayerState[] = [];

  for (const playerId of playerIds) {
    const faceDownCards = shuffledDeck.slice(deckIndex, deckIndex + CARDS_PER_ZONE);
    deckIndex += CARDS_PER_ZONE;

    const faceUpCards = shuffledDeck.slice(deckIndex, deckIndex + CARDS_PER_ZONE);
    deckIndex += CARDS_PER_ZONE;

    const hand = shuffledDeck.slice(deckIndex, deckIndex + CARDS_PER_ZONE);
    deckIndex += CARDS_PER_ZONE;

    players.push({
      id: playerId,
      hand,
      faceUpCards,
      faceDownCards,
    });
  }

  const drawPile = shuffledDeck.slice(totalCardsDealt);

  return { players, drawPile };
}
