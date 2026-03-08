/**
 * Win Condition Evaluator for the Sbobuz game engine.
 *
 * Checks whether a player has emptied all three card zones (hand, face-up,
 * face-down) and the draw pile is empty, indicating that the player has won.
 *
 * A player wins when ALL of the following are true:
 * 1. player.hand.length === 0
 * 2. player.faceUpCards.length === 0
 * 3. player.faceDownCards.length === 0
 * 4. drawPileEmpty === true
 *
 * This is logically equivalent to getActiveZone(player, drawPileEmpty) === 'finished',
 * but exists as a separate component for semantic clarity and to return the
 * winner's ID.
 *
 * All functions are pure, deterministic, and free of side effects.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 5.3 (Active Zone Progression)
 * @see SBOBUZ_ENGINE_SPEC.md Section 7 (Effect Priority, Step 5 — Win Check)
 * @see docs/specs/engine/win-condition-evaluator.md
 */

import type { PlayerState } from '@shared/game-state.js';

// ---------------------------------------------------------------------------
// Types owned by this component
// ---------------------------------------------------------------------------

/**
 * Result of a win condition check.
 */
export interface WinCheckResult {
  /** Whether the player has won. */
  readonly won: boolean;

  /** The player ID, if they won. null otherwise. */
  readonly winnerId: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks if a specific player has won the game.
 *
 * A player wins when all three card zones are empty AND the draw pile is empty.
 * If the draw pile is non-empty, a player cannot win because they would draw
 * cards into their hand during the draw phase.
 *
 * @param player - The player to check.
 * @param drawPileEmpty - Whether the draw pile is empty.
 * @returns WinCheckResult indicating whether the player has won.
 *
 * @example
 * ```typescript
 * // Player with all zones empty and draw pile empty
 * checkWinCondition(emptyPlayer, true);
 * // => { won: true, winnerId: 'player-1' }
 *
 * // Player with cards remaining
 * checkWinCondition(playerWithCards, true);
 * // => { won: false, winnerId: null }
 * ```
 */
export function checkWinCondition(
  player: PlayerState,
  drawPileEmpty: boolean,
): WinCheckResult {
  if (
    drawPileEmpty &&
    player.hand.length === 0 &&
    player.faceUpCards.length === 0 &&
    player.faceDownCards.length === 0
  ) {
    return { won: true, winnerId: player.id };
  }

  return { won: false, winnerId: null };
}

/**
 * Checks if any player in the game has won.
 *
 * Iterates through all players and returns the first winner found.
 * In practice, only the current player (who just acted) can win on any
 * given turn, but this function provides a belt-and-suspenders check.
 *
 * @param players - All players in the game.
 * @param drawPileEmpty - Whether the draw pile is empty.
 * @returns WinCheckResult with the winner's ID, or { won: false, winnerId: null }.
 *
 * @example
 * ```typescript
 * checkAnyWinner(state.players, state.drawPile.length === 0);
 * // => { won: true, winnerId: 'alice' } or { won: false, winnerId: null }
 * ```
 */
export function checkAnyWinner(
  players: ReadonlyArray<PlayerState>,
  drawPileEmpty: boolean,
): WinCheckResult {
  for (const player of players) {
    const result = checkWinCondition(player, drawPileEmpty);
    if (result.won) {
      return result;
    }
  }

  return { won: false, winnerId: null };
}
