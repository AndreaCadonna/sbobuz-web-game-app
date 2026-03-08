/**
 * Starting Player Algorithm for the Sbobuz game engine.
 *
 * Determines who plays first using a multi-step tiebreaker:
 *   1. Lowest card in hand.
 *   2. Second-lowest card (tiebreaker).
 *   3. Third-lowest card (tiebreaker).
 *   4. Positional advantage (exactly 2 tied players only).
 *   5. Random fallback (seeded PRNG).
 *
 * Only hand cards participate. Face-up and face-down cards are irrelevant.
 * Jokers are treated as the highest possible value (above Ace) so that
 * holding a Joker is never an advantage for starting.
 *
 * All functions are pure, deterministic, and free of side effects.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 4.1 (Starting Player Algorithm)
 * @see docs/specs/engine/state-factory.md Section 4.4
 */

import type { Card, Rank } from '@shared/card.js';
import type { PlayerState } from '@shared/game-state.js';

import { compareRanks } from './rank-comparator.js';
import type { RNGResult, SeededRNG } from './rng.js';
import { pick } from './rng.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of the starting player determination.
 *
 * Contains the index into the turnOrder array for the starting player
 * and the (possibly advanced) RNG state.
 */
export interface StartingPlayerResult {
  /** Index into the turnOrder/players array for the starting player. */
  readonly startingIndex: number;
  /** The RNG state after the algorithm completes (advanced only if random fallback was used). */
  readonly nextRng: SeededRNG;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sentinel ordinal for Jokers in starting player comparison.
 *
 * Jokers have no rank. For comparison purposes, they are treated as
 * higher than Ace (ordinal 12), so holding a Joker is never an advantage.
 * We use 13 as the sentinel, one above Ace's ordinal of 12.
 */
const JOKER_ORDINAL = 13;

/**
 * Gets the rank ordinal of a card for starting player comparison.
 *
 * Standard cards use the rank comparator's ordinal.
 * Jokers return JOKER_ORDINAL (highest possible, above Ace).
 *
 * @param card - The card to evaluate.
 * @returns The ordinal value for comparison.
 */
function cardToOrdinal(card: Card): number {
  if (card.type === 'joker') {
    return JOKER_ORDINAL;
  }
  return rankOrdinal(card.rank);
}

/**
 * Gets the ordinal of a Rank using the rank comparator.
 *
 * This wraps the compareRanks function to produce absolute ordinals.
 * We compare against '2' (the lowest rank, ordinal 0) to get the
 * absolute position.
 *
 * @param rank - The rank to convert.
 * @returns The ordinal position (0-12).
 */
function rankOrdinal(rank: Rank): number {
  // compareRanks returns rankToOrdinal(a) - rankToOrdinal(b)
  // So compareRanks(rank, '2') === rankToOrdinal(rank) - 0 === rankToOrdinal(rank)
  return compareRanks(rank, '2');
}

/**
 * Sorts a player's hand cards by ordinal ascending and returns an array
 * of ordinal values.
 *
 * The returned array has exactly `hand.length` elements, sorted ascending.
 * Jokers sort to the end (highest ordinal).
 *
 * @param hand - The player's hand cards.
 * @returns Sorted array of ordinals.
 */
function sortedHandOrdinals(hand: ReadonlyArray<Card>): number[] {
  return hand.map(cardToOrdinal).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determines the starting player using the multi-step tiebreaker algorithm
 * from the Sbobuz spec.
 *
 * Only hand cards participate in the comparison. Jokers are treated as the
 * highest possible value (above Ace).
 *
 * Steps:
 * 1. Compare lowest card in each player's hand.
 * 2. Tiebreaker: second-lowest card.
 * 3. Tiebreaker: third-lowest card.
 * 4. Positional advantage (exactly 2 tied players only):
 *    Choose the player whose position lets the other tied player play
 *    soonest after them in forward turn order. If equidistant, go to step 5.
 * 5. Random fallback using seeded PRNG.
 *
 * @param players - Player states after dealing (with hand cards).
 *   Must have at least 2 players.
 * @param rng - The current RNG state (for random tiebreaker if needed).
 * @returns A {@link StartingPlayerResult} with the starting index and
 *   (possibly advanced) RNG state.
 * @throws {Error} If players array is empty.
 *
 * @example
 * ```typescript
 * // Player 0 has [3, 5, K], Player 1 has [5, 8, Q]
 * // Player 0 starts because 3 < 5
 * const result = determineStartingPlayer(players, rng);
 * // result.startingIndex === 0
 * ```
 */
export function determineStartingPlayer(
  players: ReadonlyArray<PlayerState>,
  rng: SeededRNG,
): StartingPlayerResult {
  if (players.length === 0) {
    throw new Error('EMPTY_PLAYERS: cannot determine starting player with no players');
  }

  if (players.length === 1) {
    return { startingIndex: 0, nextRng: rng };
  }

  // Compute sorted ordinals for each player's hand
  const playerOrdinals = players.map((p) => sortedHandOrdinals(p.hand));

  // Start with all players as candidates
  let candidateIndices = players.map((_, i) => i);

  // STEPS 1-3: Compare lexicographically through each card position
  // Each player's hand has 3 cards (sorted ascending), so we compare
  // position 0 (lowest), then 1, then 2.
  const maxPositions = 3;
  for (let pos = 0; pos < maxPositions; pos++) {
    if (candidateIndices.length <= 1) break;

    // Find the minimum ordinal at this position among candidates
    let minOrdinal = Infinity;
    for (const idx of candidateIndices) {
      const ordinals = playerOrdinals[idx]!;
      const val = pos < ordinals.length ? ordinals[pos]! : JOKER_ORDINAL;
      if (val < minOrdinal) {
        minOrdinal = val;
      }
    }

    // Filter to only candidates that have this minimum
    candidateIndices = candidateIndices.filter((idx) => {
      const ordinals = playerOrdinals[idx]!;
      const val = pos < ordinals.length ? ordinals[pos]! : JOKER_ORDINAL;
      return val === minOrdinal;
    });
  }

  // If only one candidate remains, they start
  if (candidateIndices.length === 1) {
    return { startingIndex: candidateIndices[0]!, nextRng: rng };
  }

  // STEP 4: Positional advantage (exactly 2 tied players only)
  if (candidateIndices.length === 2) {
    const idx0 = candidateIndices[0]!;
    const idx1 = candidateIndices[1]!;
    const totalPlayers = players.length;

    // Distance from idx0 to idx1 in forward direction
    const dist0to1 = ((idx1 - idx0) % totalPlayers + totalPlayers) % totalPlayers;
    // Distance from idx1 to idx0 in forward direction
    const dist1to0 = ((idx0 - idx1) % totalPlayers + totalPlayers) % totalPlayers;

    // The player whose position lets the other play soonest is the one
    // where the OTHER player is closest in forward direction.
    // If idx0 starts, the other (idx1) plays after dist0to1 steps.
    // If idx1 starts, the other (idx0) plays after dist1to0 steps.
    // We want to minimize the distance for the other player to play,
    // so pick the player that gives the shorter distance.
    if (dist0to1 < dist1to0) {
      // idx0 starting means idx1 plays sooner
      return { startingIndex: idx0, nextRng: rng };
    }
    if (dist1to0 < dist0to1) {
      // idx1 starting means idx0 plays sooner
      return { startingIndex: idx1, nextRng: rng };
    }

    // Equidistant -- fall through to random
  }

  // STEP 5: Random fallback
  // For 3+ tied players, or 2 equidistant tied players
  const { value: chosenIndex, nextRng } = pick(rng, candidateIndices);
  return { startingIndex: chosenIndex, nextRng };
}
