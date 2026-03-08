/**
 * Game state types for the Sbobuz game engine.
 *
 * The game state is a single, serializable, immutable object that captures
 * the complete truth of the game at any moment. No hidden state, no side
 * channels. If you cannot reconstruct the board from this object, something
 * is missing.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 8 (Game State Model)
 * @see SBOBUZ_ENGINE_SPEC.md Section 20 (Resolved Design Decisions)
 */

import type { Card } from './card.js';

/**
 * Configuration for a game instance.
 * Set by the room host during room creation; immutable once the game starts.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 20 (Updated GameConfig)
 */
export interface GameConfig {
  /** Turn timer duration in seconds. Configurable per room. */
  readonly turnTimerSeconds: number;
  /** How long to wait for a disconnected player before cancelling. */
  readonly disconnectGraceSeconds: number;
  /** Maximum number of players. Fixed at 5. */
  readonly maxPlayers: 5;
  /** Minimum number of players. Fixed at 2. */
  readonly minPlayers: 2;
}

/**
 * The lifecycle phase of a game.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 8 (GamePhase)
 * @see SBOBUZ_ENGINE_SPEC.md Section 20 (Updated GamePhase Type)
 */
export type GamePhase =
  | 'setup'
  | 'playing'
  | 'awaiting_queen_declaration'
  | 'awaiting_post_clear_play'
  | 'finished'
  | 'cancelled';

/**
 * A single player's card state within a game.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 8 (PlayerState)
 */
export interface PlayerState {
  /** Player's unique identifier. */
  readonly id: string;
  /** Cards in the player's hand. Private -- only the owning player sees these. */
  readonly hand: ReadonlyArray<Card>;
  /** Face-up table cards. Visible to all players. */
  readonly faceUpCards: ReadonlyArray<Card>;
  /** Face-down table cards. Hidden from everyone, including the owner. */
  readonly faceDownCards: ReadonlyArray<Card>;
}

/**
 * The complete, authoritative state of a Sbobuz game.
 *
 * This is an immutable snapshot. Every state transition produces a new
 * GameState object via the reducer.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 8 (Game State Model)
 */
export interface GameState {
  // --- Identity ---
  /** Unique game identifier (UUIDv4). */
  readonly gameId: string;
  /** Current lifecycle phase. */
  readonly phase: GamePhase;
  /** Game configuration, immutable for the game's lifetime. */
  readonly config: GameConfig;

  // --- Deck & Piles ---
  /** Face-down draw deck. Index 0 is the top card. */
  readonly drawPile: ReadonlyArray<Card>;
  /** Center play pile. Last element is the top card. */
  readonly playPile: ReadonlyArray<Card>;
  /** Burned/removed cards from King clears and Sbobuz. */
  readonly burnPile: ReadonlyArray<Card>;

  // --- Players ---
  /** All players' card states. */
  readonly players: ReadonlyArray<PlayerState>;
  /** Player IDs in current turn sequence. */
  readonly turnOrder: ReadonlyArray<string>;
  /** Index into turnOrder for the current player. */
  readonly currentPlayerIndex: number;
  /** Turn direction: 1 = normal (clockwise), -1 = reversed. */
  readonly turnDirection: 1 | -1;

  // --- Single-Use Flags ---
  /** True when the next player can play any card (set by 2 or Joker). */
  readonly freePlay: boolean;
  /** Queen effect: when 'lower', next card must be equal or lower. Consumed on next play. */
  readonly nextCardOverride: 'lower' | null;

  // --- Metadata ---
  /** The RNG seed used for this game's shuffle and starting player selection. */
  readonly rngSeed: number;
  /** Monotonically increasing count of validated actions applied. */
  readonly actionCount: number;
}
