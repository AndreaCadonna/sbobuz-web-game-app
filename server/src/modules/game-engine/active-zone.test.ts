/**
 * Tests for the Active Zone Resolver module.
 *
 * Covers all 15 edge cases from the active-zone-resolver spec plus
 * additional tests for getActiveZoneCards.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 5.3 (Active Zone Progression)
 * @see docs/specs/engine/active-zone-resolver.md Section 5 (Edge Cases)
 */

import { describe, it, expect } from 'vitest';

import type { Card } from '@shared/card.js';
import type { PlayerState } from '@shared/game-state.js';

import { getActiveZone, getActiveZoneCards } from './active-zone.js';

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
function createPlayer(opts: {
  hand?: number;
  faceUp?: number;
  faceDown?: number;
  handCards?: ReadonlyArray<Card>;
  faceUpCards?: ReadonlyArray<Card>;
  faceDownCards?: ReadonlyArray<Card>;
}): PlayerState {
  return {
    id: 'test-player',
    hand: opts.handCards ?? cards(opts.hand ?? 0, 'h'),
    faceUpCards: opts.faceUpCards ?? cards(opts.faceUp ?? 0, 'fu'),
    faceDownCards: opts.faceDownCards ?? cards(opts.faceDown ?? 0, 'fd'),
  };
}

// ---------------------------------------------------------------------------
// getActiveZone
// ---------------------------------------------------------------------------

describe('getActiveZone', () => {
  // Spec scenario #1: Normal play, cards in hand
  it('returns "hand" when player has cards in hand (scenario #1)', () => {
    const player = createPlayer({ hand: 3, faceUp: 3, faceDown: 3 });
    expect(getActiveZone(player, false)).toBe('hand');
  });

  // Spec scenario #2: Hand empty, draw pile has cards
  it('returns "hand" when hand is empty but draw pile has cards (scenario #2)', () => {
    const player = createPlayer({ hand: 0, faceUp: 3, faceDown: 3 });
    expect(getActiveZone(player, false)).toBe('hand');
  });

  // Spec scenario #3: Hand empty, draw pile empty, has face-up
  it('returns "faceUp" when hand and draw pile empty, face-up remains (scenario #3)', () => {
    const player = createPlayer({ hand: 0, faceUp: 2, faceDown: 3 });
    expect(getActiveZone(player, true)).toBe('faceUp');
  });

  // Spec scenario #4: Hand empty, draw pile empty, face-up empty, has face-down
  it('returns "faceDown" when only face-down remains (scenario #4)', () => {
    const player = createPlayer({ hand: 0, faceUp: 0, faceDown: 2 });
    expect(getActiveZone(player, true)).toBe('faceDown');
  });

  // Spec scenario #5: All zones empty
  it('returns "finished" when all zones are empty (scenario #5)', () => {
    const player = createPlayer({ hand: 0, faceUp: 0, faceDown: 0 });
    expect(getActiveZone(player, true)).toBe('finished');
  });

  // Spec scenario #6: Failed blind play -- cards moved to hand
  it('returns "hand" after failed blind play with cards in hand (scenario #6)', () => {
    const player = createPlayer({ hand: 5, faceUp: 0, faceDown: 1 });
    expect(getActiveZone(player, true)).toBe('hand');
  });

  // Spec scenario #7: Picked up pile in face-up zone
  it('returns "hand" after picking up pile while in face-up zone (scenario #7)', () => {
    const player = createPlayer({ hand: 8, faceUp: 1, faceDown: 3 });
    expect(getActiveZone(player, true)).toBe('hand');
  });

  // Spec scenario #8: Single card in hand, draw pile empty
  it('returns "hand" with single card in hand, draw pile empty (scenario #8)', () => {
    const player = createPlayer({ hand: 1, faceUp: 0, faceDown: 0 });
    expect(getActiveZone(player, true)).toBe('hand');
  });

  // Spec scenario #9: Hand just emptied, draw pile has 1 card
  it('returns "hand" when hand empty but draw pile has 1 card (scenario #9)', () => {
    const player = createPlayer({ hand: 0, faceUp: 3, faceDown: 3 });
    expect(getActiveZone(player, false)).toBe('hand');
  });

  // Spec scenario #10: Player about to win -- last face-down just played
  it('returns "finished" when last face-down card was just played (scenario #10)', () => {
    const player = createPlayer({ hand: 0, faceUp: 0, faceDown: 0 });
    expect(getActiveZone(player, true)).toBe('finished');
  });

  // Spec scenario #11: Face-up has 1 card, everything else empty
  it('returns "faceUp" with single face-up card, all else empty (scenario #11)', () => {
    const player = createPlayer({ hand: 0, faceUp: 1, faceDown: 0 });
    expect(getActiveZone(player, true)).toBe('faceUp');
  });

  // Spec scenario #12: Face-down has 1 card, everything else empty
  it('returns "faceDown" with single face-down card, all else empty (scenario #12)', () => {
    const player = createPlayer({ hand: 0, faceUp: 0, faceDown: 1 });
    expect(getActiveZone(player, true)).toBe('faceDown');
  });

  // Spec scenario #13: 2-player start, draw pile has 36 cards
  it('returns "hand" at 2-player game start with large draw pile (scenario #13)', () => {
    const player = createPlayer({ hand: 3, faceUp: 3, faceDown: 3 });
    expect(getActiveZone(player, false)).toBe('hand');
  });

  // Spec scenario #14: 5-player game, draw pile has 9 cards
  it('returns "hand" in 5-player game with small draw pile (scenario #14)', () => {
    const player = createPlayer({ hand: 2, faceUp: 3, faceDown: 3 });
    expect(getActiveZone(player, false)).toBe('hand');
  });

  // Spec scenario #15: Reversion from faceDown to hand after pile pickup
  it('returns "hand" after reversion from faceDown zone (scenario #15)', () => {
    const player = createPlayer({ hand: 12, faceUp: 0, faceDown: 2 });
    expect(getActiveZone(player, true)).toBe('hand');
  });

  // Additional: draw pile empty but hand has cards -- still hand zone
  it('returns "hand" when draw pile is empty but hand has cards', () => {
    const player = createPlayer({ hand: 2, faceUp: 3, faceDown: 3 });
    expect(getActiveZone(player, true)).toBe('hand');
  });

  // Additional: all empty with draw pile non-empty (edge case)
  it('returns "hand" when all zones empty but draw pile is not empty', () => {
    const player = createPlayer({ hand: 0, faceUp: 0, faceDown: 0 });
    expect(getActiveZone(player, false)).toBe('hand');
  });
});

// ---------------------------------------------------------------------------
// getActiveZoneCards
// ---------------------------------------------------------------------------

describe('getActiveZoneCards', () => {
  it('returns hand cards for "hand" zone', () => {
    const handCards = cards(3, 'hand');
    const player = createPlayer({
      handCards,
      faceUp: 2,
      faceDown: 1,
    });

    const result = getActiveZoneCards(player, 'hand');
    expect(result).toBe(handCards);
  });

  it('returns faceUpCards for "faceUp" zone', () => {
    const faceUpCards = cards(2, 'faceUp');
    const player = createPlayer({
      hand: 0,
      faceUpCards,
      faceDown: 1,
    });

    const result = getActiveZoneCards(player, 'faceUp');
    expect(result).toBe(faceUpCards);
  });

  it('returns faceDownCards for "faceDown" zone', () => {
    const faceDownCards = cards(3, 'faceDown');
    const player = createPlayer({
      hand: 0,
      faceUp: 0,
      faceDownCards,
    });

    const result = getActiveZoneCards(player, 'faceDown');
    expect(result).toBe(faceDownCards);
  });

  it('returns empty array for "finished" zone', () => {
    const player = createPlayer({ hand: 0, faceUp: 0, faceDown: 0 });
    const result = getActiveZoneCards(player, 'finished');
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('returns the correct array reference (identity check)', () => {
    const handCards = cards(5, 'ref');
    const player = createPlayer({ handCards, faceUp: 0, faceDown: 0 });

    // getActiveZoneCards should return the same array reference, not a copy
    expect(getActiveZoneCards(player, 'hand')).toBe(player.hand);
  });

  it('works with getActiveZone output', () => {
    const faceUpCards = cards(2, 'combo');
    const player = createPlayer({
      hand: 0,
      faceUpCards,
      faceDown: 1,
    });

    const zone = getActiveZone(player, true);
    const zoneCards = getActiveZoneCards(player, zone);
    expect(zone).toBe('faceUp');
    expect(zoneCards).toBe(faceUpCards);
  });
});
