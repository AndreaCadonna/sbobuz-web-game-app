/**
 * Sbobuz Detector for the Sbobuz game engine.
 *
 * Checks whether the top four cards of the play pile share the same rank --
 * the "Sbobuz" condition. This is the signature mechanic of the game: when
 * four of a kind land on the pile, the pile burns, the turn direction
 * reverses, and the completing player plays again.
 *
 * Sbobuz is a pile condition, not a card type. It is checked after every
 * card placement. Jokers cannot contribute to or trigger a Sbobuz because
 * they have no rank.
 *
 * The Sbobuz check has the highest priority in the effect resolution order.
 * If a Sbobuz triggers, all individual card effects are overridden and do
 * not resolve.
 *
 * This is a pure, stateless function. Each call is independent.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 12 (Sbobuz Detection)
 * @see docs/specs/engine/sbobuz-detector.md
 */

import type { Card, Rank } from '@shared/card.js';

// ---------------------------------------------------------------------------
// Types owned by this component
// ---------------------------------------------------------------------------

/**
 * Result of a Sbobuz detection check.
 */
export interface SbobuzCheckResult {
  /** Whether a Sbobuz (four of a kind) was detected. */
  readonly triggered: boolean;

  /**
   * The rank that triggered the Sbobuz, if triggered.
   * null if not triggered.
   */
  readonly rank: Rank | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of matching cards required for a Sbobuz. */
const SBOBUZ_COUNT = 4;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks if the top 4 cards of the play pile share the same rank.
 *
 * The play pile convention: last element is the top card (most recently played).
 *
 * Detection algorithm:
 * 1. If pile has fewer than 4 cards -> not triggered.
 * 2. Extract the top 4 cards (last 4 elements).
 * 3. If any of the top 4 is a Joker -> not triggered (Jokers have no rank).
 * 4. If all 4 ranks are identical -> triggered with that rank.
 * 5. Otherwise -> not triggered.
 *
 * @param playPile - The play pile array. Last element = top.
 * @returns SbobuzCheckResult indicating whether Sbobuz triggered and which rank.
 *
 * @example
 * ```typescript
 * // Four 7s on top
 * checkSbobuz([...other, card7h, card7d, card7c, card7s]);
 * // => { triggered: true, rank: '7' }
 *
 * // Joker breaks the sequence
 * checkSbobuz([...other, card7h, joker1, card7c, card7s]);
 * // => { triggered: false, rank: null }
 * ```
 */
export function checkSbobuz(playPile: ReadonlyArray<Card>): SbobuzCheckResult {
  // Step 1: Need at least 4 cards
  if (playPile.length < SBOBUZ_COUNT) {
    return { triggered: false, rank: null };
  }

  // Step 2: Extract the top 4 cards
  const topFour = playPile.slice(-SBOBUZ_COUNT);

  // Step 3: Check for any Jokers in the top 4
  // Jokers have no rank and cannot participate in Sbobuz
  for (const card of topFour) {
    if (card.type === 'joker') {
      return { triggered: false, rank: null };
    }
  }

  // Step 4: All 4 are standard cards -- check if ranks are identical
  // Safe to access .rank since we verified all are standard cards above
  const firstCard = topFour[0]!;
  // TypeScript cannot narrow through the loop above, but we know all are standard
  if (firstCard.type !== 'standard') {
    // Unreachable -- satisfies type checker
    return { triggered: false, rank: null };
  }

  const targetRank = firstCard.rank;

  for (let i = 1; i < SBOBUZ_COUNT; i++) {
    const card = topFour[i]!;
    if (card.type !== 'standard' || card.rank !== targetRank) {
      return { triggered: false, rank: null };
    }
  }

  // Step 5: All 4 ranks match
  return { triggered: true, rank: targetRank };
}
