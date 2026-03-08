/**
 * Active Zone Resolver for the Sbobuz game engine.
 *
 * Determines which card zone a player should play from, based on their
 * current card distribution and the draw pile status. The zone progression
 * follows: hand -> faceUp -> faceDown -> finished. However, zone transitions
 * are bidirectional -- picking up the pile reverts a player to the hand zone.
 *
 * The active zone is always recomputed from the current state, never stored.
 * This is a derived value, not stored state.
 *
 * All functions are pure, deterministic, and free of side effects.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 5.3 (Active Zone Progression)
 * @see docs/specs/engine/active-zone-resolver.md
 */

import type { ActiveZone } from '@shared/active-zone.js';
import type { Card } from '@shared/card.js';
import type { PlayerState } from '@shared/game-state.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determines which zone a player plays from.
 *
 * The logic follows a strict priority order:
 * 1. If the player has cards in hand OR the draw pile is not empty -> 'hand'
 *    (draw pile not empty means the player will refill their hand after playing)
 * 2. Else if the player has face-up cards -> 'faceUp'
 * 3. Else if the player has face-down cards -> 'faceDown'
 * 4. Else -> 'finished' (player has won or is about to win)
 *
 * @param player - The player whose active zone is being determined.
 * @param drawPileEmpty - Whether the draw pile is empty.
 * @returns The active zone for this player.
 *
 * @example
 * ```typescript
 * // Player with cards in hand
 * getActiveZone(player, false); // 'hand'
 *
 * // Player with empty hand but draw pile has cards
 * getActiveZone(playerEmptyHand, false); // 'hand'
 *
 * // Player with empty hand, empty draw pile, face-up cards remain
 * getActiveZone(playerEmptyHand, true); // 'faceUp'
 * ```
 */
export function getActiveZone(player: PlayerState, drawPileEmpty: boolean): ActiveZone {
  // Step 1: Hand zone is active if player has hand cards OR draw pile can refill
  if (player.hand.length > 0 || !drawPileEmpty) {
    return 'hand';
  }

  // Step 2: Face-up zone
  if (player.faceUpCards.length > 0) {
    return 'faceUp';
  }

  // Step 3: Face-down zone
  if (player.faceDownCards.length > 0) {
    return 'faceDown';
  }

  // Step 4: All zones empty
  return 'finished';
}

/**
 * Returns the cards available in the player's active zone.
 *
 * Maps the zone enum back to the concrete array on the PlayerState:
 * - 'hand' -> player.hand
 * - 'faceUp' -> player.faceUpCards
 * - 'faceDown' -> player.faceDownCards
 * - 'finished' -> empty array
 *
 * @param player - The player.
 * @param activeZone - The player's active zone (from getActiveZone).
 * @returns The cards in the active zone.
 *
 * @example
 * ```typescript
 * const zone = getActiveZone(player, false);
 * const cards = getActiveZoneCards(player, zone);
 * ```
 */
export function getActiveZoneCards(
  player: PlayerState,
  activeZone: ActiveZone,
): ReadonlyArray<Card> {
  switch (activeZone) {
    case 'hand':
      return player.hand;
    case 'faceUp':
      return player.faceUpCards;
    case 'faceDown':
      return player.faceDownCards;
    case 'finished':
      return [];
    default: {
      // Exhaustive check -- if a new zone is added, TypeScript will error here
      const _exhaustive: never = activeZone;
      return _exhaustive;
    }
  }
}
