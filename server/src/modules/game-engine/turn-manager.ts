/**
 * Turn Manager for the Sbobuz game engine.
 *
 * Computes the next player index in the turn sequence, given the current
 * index, turn direction, and player count. Handles forward and reverse
 * traversal with wraparound using the double-modulo formula.
 *
 * This is the only component responsible for index arithmetic on the turn
 * order. It does not track whose turn it is -- that state lives in
 * GameState.currentPlayerIndex.
 *
 * The Turn Manager is a single pure function with no side effects.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 13 (Turn Advancement)
 * @see docs/specs/engine/turn-manager.md
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the next player index after advancing by the turn direction.
 *
 * Uses the double-modulo formula to handle negative indices correctly:
 * ```
 * nextIndex = ((currentIndex + direction) % playerCount + playerCount) % playerCount
 * ```
 *
 * JavaScript's `%` operator returns negative values for negative operands.
 * When `direction === -1` and `currentIndex === 0`, the naive
 * `(0 + -1) % 4` yields `-1`, not `3`. The double-modulo normalizes
 * the result to the range `[0, playerCount - 1]`.
 *
 * @param currentIndex - The current player's index in turnOrder (0-based).
 * @param direction - 1 for forward, -1 for reversed.
 * @param playerCount - Total number of players. Must be 2-5.
 * @returns The next player's index in turnOrder.
 * @throws {Error} If playerCount is not in [2, 5].
 * @throws {Error} If currentIndex is out of bounds.
 * @throws {Error} If direction is not 1 or -1.
 *
 * @example
 * ```typescript
 * advanceTurn(2, 1, 4);   // 3
 * advanceTurn(3, 1, 4);   // 0 (wraps forward)
 * advanceTurn(0, -1, 4);  // 3 (wraps backward)
 * ```
 */
export function advanceTurn(
  currentIndex: number,
  direction: 1 | -1,
  playerCount: number,
): number {
  // Validation
  if (playerCount < 2) {
    throw new Error('INVALID_PLAYER_COUNT: need at least 2 players');
  }
  if (playerCount > 5) {
    throw new Error('INVALID_PLAYER_COUNT: maximum 5 players');
  }
  if (currentIndex < 0 || currentIndex >= playerCount) {
    throw new Error(
      `INDEX_OUT_OF_BOUNDS: currentIndex must be in [0, ${String(playerCount)}), got ${String(currentIndex)}`,
    );
  }
  if (direction !== 1 && direction !== -1) {
    throw new Error(
      `INVALID_DIRECTION: must be 1 or -1, got ${String(direction as number)}`,
    );
  }

  // Double-modulo to handle negative values
  return ((currentIndex + direction) % playerCount + playerCount) % playerCount;
}
