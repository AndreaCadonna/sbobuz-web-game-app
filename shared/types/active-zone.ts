/**
 * Active zone types for the Sbobuz game engine.
 *
 * A player's cards exist in three zones played in strict order:
 * HAND -> FACE_UP -> FACE_DOWN -> (empty = win)
 *
 * The active zone is always computed from the current state, never
 * stored as a forward-only progression. Zone transitions can revert
 * (e.g., picking up the pile sends cards to hand).
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 5.3 (Active Zone Progression)
 */

/**
 * The zone a player currently plays from.
 *
 * - `'hand'`: Player has cards in hand, or draw pile can refill hand.
 * - `'faceUp'`: Hand is empty, draw pile is empty, face-up cards remain.
 * - `'faceDown'`: Hand and face-up are empty, face-down cards remain.
 * - `'finished'`: All zones are empty. Player has won.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 5.3
 */
export type ActiveZone = 'hand' | 'faceUp' | 'faceDown' | 'finished';
