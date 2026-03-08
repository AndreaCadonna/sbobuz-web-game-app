/**
 * Card domain types for the Sbobuz game engine.
 *
 * A standard 54-card deck: 52 suited cards (4 suits x 13 ranks) + 2 jokers.
 * Cards use a discriminated union on the `type` field to distinguish
 * standard cards from jokers.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 2 (Deck Composition)
 * @see SBOBUZ_ENGINE_SPEC.md Section 8 (Card Model)
 */

/** The four standard playing card suits. */
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

/**
 * Standard card ranks from 2 through Ace.
 *
 * Rank hierarchy for comparison (lowest to highest):
 * 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A
 *
 * Note: 2 is the lowest numerical rank but has a special effect
 * that makes it playable on any card. Rank position and playability
 * are separate concerns.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 3 (Card Rank Hierarchy)
 */
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

/**
 * A standard suited card with a rank and suit.
 *
 * @example
 * ```typescript
 * const card: StandardCard = {
 *   type: 'standard',
 *   rank: '7',
 *   suit: 'hearts',
 *   id: 'hearts_7',
 * };
 * ```
 */
export interface StandardCard {
  readonly type: 'standard';
  readonly rank: Rank;
  readonly suit: Suit;
  /** Unique identifier for tracking, e.g. "hearts_7" */
  readonly id: string;
}

/**
 * A joker card. Jokers have no suit and no rank.
 * Two jokers exist in the deck, identified by their unique IDs.
 *
 * @example
 * ```typescript
 * const joker: JokerCard = { type: 'joker', id: 'joker_1' };
 * ```
 */
export interface JokerCard {
  readonly type: 'joker';
  readonly id: 'joker_1' | 'joker_2';
}

/**
 * A card in the Sbobuz deck. Discriminated union on the `type` field.
 *
 * - `'standard'`: A suited card with rank and suit.
 * - `'joker'`: A joker with no rank or suit.
 */
export type Card = StandardCard | JokerCard;
