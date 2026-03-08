/**
 * Game action types for the Sbobuz game engine.
 *
 * Every player intent is a typed, validated action. The engine accepts
 * only these shapes. Actions form a discriminated union on the `type` field.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (Action Types)
 */

/**
 * Play one or more cards of the same rank from the player's active zone.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (PlayCardsAction)
 * @see SBOBUZ_ENGINE_SPEC.md Section 10.2 (PLAY_CARDS validation)
 */
export interface PlayCardsAction {
  readonly type: 'PLAY_CARDS';
  readonly playerId: string;
  /** One or more card IDs, all of the same rank. */
  readonly cardIds: ReadonlyArray<string>;
}

/**
 * Play a face-down card by position (blind play).
 * The card is revealed and then checked for legality.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (PlayBlindAction)
 * @see SBOBUZ_ENGINE_SPEC.md Section 10.3 (PLAY_BLIND validation)
 */
export interface PlayBlindAction {
  readonly type: 'PLAY_BLIND';
  readonly playerId: string;
  /** Position in faceDownCards array (0, 1, or 2). */
  readonly cardIndex: number;
}

/**
 * Pick up the entire play pile into the player's hand.
 * Always voluntary -- a player can pick up even if they have a legal play.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (PickUpPileAction)
 * @see SBOBUZ_ENGINE_SPEC.md Section 10.4 (PICK_UP_PILE validation)
 */
export interface PickUpPileAction {
  readonly type: 'PICK_UP_PILE';
  readonly playerId: string;
}

/**
 * Declare whether the next card must be higher or lower after playing a Queen.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (DeclareDirectionAction)
 * @see SBOBUZ_ENGINE_SPEC.md Section 10.5 (DECLARE_DIRECTION validation)
 */
export interface DeclareDirectionAction {
  readonly type: 'DECLARE_DIRECTION';
  readonly playerId: string;
  readonly direction: 'higher' | 'lower';
}

/**
 * Automatically generated when a player's turn timer expires.
 * The player forfeits their turn.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (TimeoutForfeitAction)
 */
export interface TimeoutForfeitAction {
  readonly type: 'TIMEOUT_FORFEIT';
  readonly playerId: string;
}

/**
 * Cancel the game entirely, typically due to a disconnect timeout or admin action.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (CancelGameAction)
 */
export interface CancelGameAction {
  readonly type: 'CANCEL_GAME';
  readonly reason: 'disconnect_timeout' | 'admin';
  readonly disconnectedPlayerId?: string | undefined;
}

/**
 * The discriminated union of all possible game actions.
 * Every player intent must conform to one of these shapes.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9
 */
export type GameAction =
  | PlayCardsAction
  | PlayBlindAction
  | PickUpPileAction
  | DeclareDirectionAction
  | TimeoutForfeitAction
  | CancelGameAction;

/**
 * All possible action type discriminators.
 * Useful for exhaustive switch statements.
 */
export type GameActionType = GameAction['type'];
