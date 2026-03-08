/**
 * Room/lobby types shared across modules.
 *
 * These types represent the pre-game lobby where players gather before
 * a match starts. Room state is ephemeral (Redis-backed) during the
 * active phase and archived to PostgreSQL when a game starts.
 *
 * @see docs/specs/lobby-module.md Section 2 (Data Model)
 * @see docs/specs/data-layer.md (RoomVisibility)
 */

/**
 * Room visibility setting. Determines whether a room appears in the
 * public room listing or is joinable only via invite code.
 *
 * @see docs/specs/data-layer.md Section 2 (RoomVisibility)
 */
export type RoomVisibility = 'public' | 'private';

/**
 * The lifecycle status of a room.
 *
 * @see docs/specs/lobby-module.md Section 2.4 (RoomStatus)
 */
export type RoomStatus =
  | 'CREATED'    // Room just created, not yet open (transitional)
  | 'WAITING'    // Open for players to join/leave/ready
  | 'READY'      // All players ready + minimum met. Host can start.
  | 'IN_GAME'    // Game has started. Room is locked.
  | 'COMPLETED'  // Game ended. Room archived. Terminal.
  | 'EXPIRED';   // TTL expired. Room cleaned up. Terminal.

/**
 * A player's presence in a room. Lightweight projection of user identity
 * plus room-specific state.
 *
 * @see docs/specs/lobby-module.md Section 2.3 (RoomPlayer)
 */
export interface RoomPlayer {
  /** User.id (for human players) or generated ID for AI (e.g., "ai_easy_1"). */
  readonly userId: string;
  /** Copied from User.username at join time. */
  readonly username: string;
  /** Copied from User.displayName at join time. */
  readonly displayName: string;
  /** Whether this player has confirmed readiness to start. */
  readonly isReady: boolean;
  /** Whether this player is the current room host. */
  readonly isHost: boolean;
  /** Whether this is an AI-controlled player. */
  readonly isAI: boolean;
  /** AI difficulty level, only set when isAI is true. */
  readonly aiDifficulty?: 'easy' | 'medium' | 'hard' | undefined;
  /** ISO 8601 timestamp of when this player joined the room. */
  readonly joinedAt: string;
  /** Connection status for human players. AI players are always 'connected'. */
  readonly connectionStatus: 'connected' | 'disconnected';
}

/**
 * Configurable game settings for a room, set by the host.
 * Immutable once the game starts (copied into GameConfig).
 *
 * @see docs/specs/lobby-module.md Section 2.2 (RoomSettings)
 */
export interface RoomSettings {
  /** Maximum number of players, 2-5. */
  readonly maxPlayers: 2 | 3 | 4 | 5;
  /** Turn timer duration in seconds. */
  readonly turnTimerSeconds: number;
  /** Whether AI opponents can be added to this room. */
  readonly allowAI: boolean;
  /** Disconnect grace period in seconds before game cancellation. */
  readonly disconnectGraceSeconds: number;
}

/**
 * The complete state of a game room.
 *
 * @see docs/specs/lobby-module.md Section 2.1 (Room)
 */
export interface RoomState {
  /** UUIDv4 room identifier. */
  readonly roomId: string;
  /** User.id of the room host. Transferred on host departure. */
  readonly hostId: string;
  /** Human-readable room name, 1-50 chars. */
  readonly name: string;
  /** Configurable game settings. */
  readonly settings: RoomSettings;
  /** Ordered list of players currently in the room. */
  readonly players: ReadonlyArray<RoomPlayer>;
  /** Current lifecycle status. */
  readonly status: RoomStatus;
  /** ISO 8601 timestamp of room creation. */
  readonly createdAt: string;
  /** Maximum number of players (from settings). */
  readonly maxPlayers: number;
  /** Minimum number of players required to start (always 2). */
  readonly minPlayers: number;
  /** Whether the room is private (not listed publicly). */
  readonly isPrivate: boolean;
  /** UUIDv4 invite code for joining the room. */
  readonly inviteCode: string;
  /** Time-to-live in seconds. Refreshed on every player action. */
  readonly ttlSeconds: number;
  /** ISO 8601 timestamp of last activity. */
  readonly lastActivityAt: string;
}
