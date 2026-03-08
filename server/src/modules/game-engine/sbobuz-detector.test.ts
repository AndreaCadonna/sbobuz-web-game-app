/**
 * Tests for the Sbobuz Detector module.
 *
 * Covers all 18 edge cases from the sbobuz-detector spec plus
 * additional verification of the SbobuzCheckResult structure.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 12 (Sbobuz Detection)
 * @see docs/specs/engine/sbobuz-detector.md Section 5 (Edge Cases)
 */

import { describe, it, expect } from 'vitest';

import type { Card, JokerCard, Rank, StandardCard, Suit } from '@shared/card.js';

import { checkSbobuz } from './sbobuz-detector.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a standard card with the given rank and suit. */
function sc(rank: Rank, suit: Suit): StandardCard {
  return { type: 'standard', rank, suit, id: `${suit}_${rank}` };
}

/** Shorthand for creating a standard card with a default suit. */
function c(rank: Rank, suitIndex: number = 0): StandardCard {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const suit = suits[suitIndex % 4]!;
  return sc(rank, suit);
}

/** Creates joker 1. */
const joker1: JokerCard = { type: 'joker', id: 'joker_1' };

/** Creates joker 2. */
const joker2: JokerCard = { type: 'joker', id: 'joker_2' };

// ---------------------------------------------------------------------------
// checkSbobuz
// ---------------------------------------------------------------------------

describe('checkSbobuz', () => {
  // --- Triggered cases ---

  // Spec scenario #1: Four 7s on top
  it('detects Sbobuz with four 7s on top (scenario #1)', () => {
    const pile: Card[] = [c('3', 0), sc('7', 'hearts'), sc('7', 'diamonds'), sc('7', 'clubs'), sc('7', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: '7' });
  });

  // Spec scenario #8: Four 2s (special card, still Sbobuz)
  it('detects Sbobuz with four 2s -- special card still triggers (scenario #8)', () => {
    const pile: Card[] = [sc('2', 'hearts'), sc('2', 'diamonds'), sc('2', 'clubs'), sc('2', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: '2' });
  });

  // Spec scenario #9: Four Queens (Sbobuz overrides Queen effect)
  it('detects Sbobuz with four Queens (scenario #9)', () => {
    const pile: Card[] = [sc('Q', 'hearts'), sc('Q', 'diamonds'), sc('Q', 'clubs'), sc('Q', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: 'Q' });
  });

  // Spec scenario #10: Four Kings (Sbobuz overrides King clear)
  it('detects Sbobuz with four Kings (scenario #10)', () => {
    const pile: Card[] = [sc('K', 'hearts'), sc('K', 'diamonds'), sc('K', 'clubs'), sc('K', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: 'K' });
  });

  // Spec scenario #11: Four Aces
  it('detects Sbobuz with four Aces (scenario #11)', () => {
    const pile: Card[] = [sc('A', 'hearts'), sc('A', 'diamonds'), sc('A', 'clubs'), sc('A', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: 'A' });
  });

  // Spec scenario #12: Sbobuz built across turns
  it('detects Sbobuz built across multiple turns (scenario #12)', () => {
    // Same as #1 -- detector does not care who played what
    const pile: Card[] = [c('5', 0), sc('7', 'hearts'), sc('7', 'diamonds'), sc('7', 'clubs'), sc('7', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: '7' });
  });

  // Spec scenario #14: Cards below top 4 are irrelevant
  it('ignores cards below the top 4 (scenario #14)', () => {
    const pile: Card[] = [
      sc('3', 'hearts'), sc('5', 'diamonds'), sc('9', 'clubs'),
      sc('7', 'hearts'), sc('7', 'diamonds'), sc('7', 'clubs'), sc('7', 'spades'),
    ];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: '7' });
  });

  // Spec scenario #16: Exactly 4 cards in pile, all same rank
  it('detects Sbobuz with exactly 4 cards in pile (scenario #16)', () => {
    const pile: Card[] = [sc('4', 'hearts'), sc('4', 'diamonds'), sc('4', 'clubs'), sc('4', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: '4' });
  });

  // Spec scenario #17: Pile with 5+ cards, top 4 match
  it('detects Sbobuz in pile with 5+ cards (scenario #17)', () => {
    const pile: Card[] = [sc('2', 'hearts'), sc('9', 'hearts'), sc('9', 'diamonds'), sc('9', 'clubs'), sc('9', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: true, rank: '9' });
  });

  // --- Not triggered cases ---

  // Spec scenario #2: Three 7s (not enough)
  it('does not trigger with only three matching cards (scenario #2)', () => {
    const pile: Card[] = [c('5', 0), sc('7', 'hearts'), sc('7', 'diamonds'), sc('7', 'clubs')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // Spec scenario #3: Pile has fewer than 4 cards
  it('does not trigger with fewer than 4 cards in pile (scenario #3)', () => {
    const pile: Card[] = [sc('5', 'hearts'), sc('5', 'diamonds'), sc('5', 'clubs')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // Spec scenario #4: Empty pile
  it('does not trigger on empty pile (scenario #4)', () => {
    const result = checkSbobuz([]);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // Spec scenario #5: Four different ranks on top
  it('does not trigger with four different ranks (scenario #5)', () => {
    const pile: Card[] = [sc('3', 'hearts'), sc('5', 'diamonds'), sc('7', 'clubs'), sc('9', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // Spec scenario #6: Joker in top 4 breaks Sbobuz
  it('does not trigger when Joker is in the top 4 (scenario #6)', () => {
    const pile: Card[] = [c('5', 0), sc('7', 'hearts'), joker1, sc('7', 'clubs'), sc('7', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // Spec scenario #7: Joker on top, three 7s below
  it('does not trigger when Joker is on top with three matching below (scenario #7)', () => {
    const pile: Card[] = [c('5', 0), sc('7', 'hearts'), sc('7', 'diamonds'), sc('7', 'clubs'), joker1];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // Spec scenario #13: Three 7s then a Joker on top
  it('does not trigger with three matching cards then Joker on top (scenario #13)', () => {
    const pile: Card[] = [c('3', 0), sc('7', 'hearts'), sc('7', 'diamonds'), sc('7', 'clubs'), joker2];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // Spec scenario #15: Both Jokers in top 4
  it('does not trigger with both Jokers in top 4 (scenario #15)', () => {
    const pile: Card[] = [c('3', 0), joker1, sc('7', 'hearts'), joker2, sc('7', 'diamonds')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // Spec scenario #18: Top 3 match but 4th does not
  it('does not trigger when top 3 match but 4th differs (scenario #18)', () => {
    const pile: Card[] = [c('5', 0), sc('8', 'hearts'), sc('7', 'diamonds'), sc('7', 'clubs'), sc('7', 'spades')];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  // --- Additional edge cases ---

  it('handles pile with exactly 1 card', () => {
    const result = checkSbobuz([c('A', 0)]);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  it('handles pile with exactly 2 cards', () => {
    const result = checkSbobuz([c('A', 0), c('A', 1)]);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  it('detects Sbobuz for every rank', () => {
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

    for (const rank of ranks) {
      const pile: Card[] = suits.map((suit) => sc(rank, suit));
      const result = checkSbobuz(pile);
      expect(result).toEqual({ triggered: true, rank });
    }
  });

  it('does not trigger with three of a kind plus one different rank', () => {
    const pile: Card[] = [
      sc('9', 'hearts'), sc('9', 'diamonds'), sc('9', 'clubs'), sc('10', 'spades'),
    ];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });

  it('does not treat the pile as triggered when only the bottom 4 match', () => {
    const pile: Card[] = [
      sc('5', 'hearts'), sc('5', 'diamonds'), sc('5', 'clubs'), sc('5', 'spades'),
      sc('3', 'hearts'),
    ];
    const result = checkSbobuz(pile);
    expect(result).toEqual({ triggered: false, rank: null });
  });
});
