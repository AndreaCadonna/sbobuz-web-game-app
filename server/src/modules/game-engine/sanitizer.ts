/**
 * State Sanitizer for the Sbobuz game engine.
 *
 * Produces player-specific views of the game state that hide private
 * information. The server is authoritative and holds the full state; clients
 * receive only the information they are allowed to see.
 *
 * Visibility rules (from SBOBUZ_ENGINE_SPEC.md Section 18):
 * - Player's own hand: visible (full card details)
 * - Other players' hands: hidden (count only)
 * - All face-up cards: visible to everyone
 * - Face-down cards: hidden from everyone (count only)
 * - Draw pile: count only, never card values
 * - Play pile: fully visible
 * - All metadata (phase, turn, flags): visible
 *
 * All functions are pure, deterministic, and free of side effects.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 18 (Client-Server Contract)
 */

import type { Card } from '@shared/card.js';
import type { GameConfig, GamePhase, GameState, PlayerState } from '@shared/game-state.js';

// ---------------------------------------------------------------------------
// Types owned by this component
// ---------------------------------------------------------------------------

/**
 * A sanitized view of a player's state. Hand cards may be hidden
 * (replaced with a count) depending on the viewing player.
 */
export interface SanitizedPlayerState {
  /** Player's unique identifier. */
  readonly id: string;

  /**
   * The player's hand cards. Visible only if this is the viewing player.
   * null when hidden (for other players' hands).
   */
  readonly hand: ReadonlyArray<Card> | null;

  /** Number of cards in hand. Always visible. */
  readonly handCount: number;

  /** Face-up table cards. Visible to all players. */
  readonly faceUpCards: ReadonlyArray<Card>;

  /** Number of face-down cards. Card values are never revealed. */
  readonly faceDownCount: number;
}

/**
 * A sanitized view of the entire game state, safe to send to a specific player.
 * All private information has been removed or replaced with counts.
 */
export interface SanitizedGameState {
  // --- Identity ---
  /** Unique game identifier. */
  readonly gameId: string;
  /** Current lifecycle phase. */
  readonly phase: GamePhase;
  /** Game configuration. */
  readonly config: GameConfig;

  // --- Piles ---
  /** Number of cards in the draw pile. Card values are never revealed. */
  readonly drawPileCount: number;
  /** The play pile, fully visible. */
  readonly playPile: ReadonlyArray<Card>;
  /** Number of cards in the burn pile. */
  readonly burnPileCount: number;

  // --- Players ---
  /** All players' sanitized states. */
  readonly players: ReadonlyArray<SanitizedPlayerState>;

  // --- Turn state ---
  /** Player IDs in current turn sequence. */
  readonly turnOrder: ReadonlyArray<string>;
  /** Index into turnOrder for the current player. */
  readonly currentPlayerIndex: number;
  /** Turn direction: 1 = normal, -1 = reversed. */
  readonly turnDirection: 1 | -1;

  // --- Single-Use Flags ---
  /** True when the next player can play any card (set by 2 or Joker). */
  readonly freePlay: boolean;
  /** Queen effect: when 'lower', next card must be equal or lower. */
  readonly nextCardOverride: 'lower' | null;

  // --- Metadata ---
  /** Monotonically increasing count of validated actions applied. */
  readonly actionCount: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sanitizes a single player's state from the perspective of the viewing player.
 *
 * @param player - The player whose state to sanitize.
 * @param isViewingPlayer - Whether this player IS the one viewing the state.
 * @returns A sanitized player state.
 */
function sanitizePlayer(
  player: PlayerState,
  isViewingPlayer: boolean,
): SanitizedPlayerState {
  return {
    id: player.id,
    hand: isViewingPlayer ? player.hand : null,
    handCount: player.hand.length,
    faceUpCards: player.faceUpCards,
    faceDownCount: player.faceDownCards.length,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produces a player-specific sanitized view of the game state.
 *
 * Hides information that the specified player should not see:
 * - Other players' hand contents (replaced with count)
 * - All face-down card contents (replaced with count)
 * - Draw pile contents (replaced with count)
 *
 * Preserves all public information:
 * - The viewing player's own hand
 * - All face-up cards
 * - The full play pile
 * - Turn state, flags, phase, and metadata
 *
 * @param state - The full authoritative game state.
 * @param viewingPlayerId - The player for whom to sanitize the state.
 * @returns A SanitizedGameState safe to send to the specified player.
 *
 * @example
 * ```typescript
 * const sanitized = sanitizeStateForPlayer(gameState, 'player-1');
 * // sanitized.players[0].hand is visible (player-1's hand)
 * // sanitized.players[1].hand is null (other player's hand hidden)
 * // sanitized.drawPileCount is a number (card values hidden)
 * ```
 */
export function sanitizeStateForPlayer(
  state: GameState,
  viewingPlayerId: string,
): SanitizedGameState {
  return {
    gameId: state.gameId,
    phase: state.phase,
    config: state.config,

    drawPileCount: state.drawPile.length,
    playPile: state.playPile,
    burnPileCount: state.burnPile.length,

    players: state.players.map((p) =>
      sanitizePlayer(p, p.id === viewingPlayerId),
    ),

    turnOrder: state.turnOrder,
    currentPlayerIndex: state.currentPlayerIndex,
    turnDirection: state.turnDirection,

    freePlay: state.freePlay,
    nextCardOverride: state.nextCardOverride,

    actionCount: state.actionCount,
  };
}
