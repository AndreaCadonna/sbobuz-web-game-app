/**
 * Socket.IO typed event contracts for the Sbobuz realtime module.
 *
 * Defines the complete bidirectional event contract between client and server,
 * plus inter-server events for multi-instance coordination via Redis adapter.
 *
 * @see docs/specs/realtime-module.md Section 2.3 (Event Type Contracts)
 * @see docs/specs/realtime-module.md Section 2.4 (Event Payloads)
 */

import type { GameAction } from '@sbobuz/shared';

import type { SanitizedGameState } from '../../modules/game-engine/index.js';

// ---------------------------------------------------------------------------
// Presence Types
// ---------------------------------------------------------------------------

/**
 * A player's connectivity status within a room.
 */
export type PresenceStatus = 'ONLINE' | 'AWAY' | 'DISCONNECTED';

/**
 * Tracks a player's connectivity state within a room.
 * Stored in Redis with TTL for automatic cleanup.
 */
export interface PresenceState {
  readonly userId: string;
  readonly status: PresenceStatus;
  readonly lastSeen: string;
  readonly gracePeriodEndsAt: string | null;
}

// ---------------------------------------------------------------------------
// Connection Types
// ---------------------------------------------------------------------------

/**
 * Device metadata from the Socket.IO handshake.
 */
export interface SocketDeviceInfo {
  readonly userAgent: string;
  readonly transport: 'websocket' | 'polling';
  readonly ip: string;
}

/**
 * Represents a single active WebSocket connection.
 * One SocketConnection per authenticated user at any given time.
 */
export interface SocketConnection {
  readonly socketId: string;
  readonly userId: string;
  readonly username: string;
  readonly roomId: string | null;
  readonly connectedAt: string;
  readonly lastPingAt: string;
  readonly deviceInfo: SocketDeviceInfo;
}

// ---------------------------------------------------------------------------
// Socket.IO Event Payloads
// ---------------------------------------------------------------------------

/** Room join request payload. */
export interface RoomJoinPayload {
  readonly roomId: string;
}

/** Room join response sent via callback. */
export interface RoomJoinResponse {
  readonly success: boolean;
  readonly error?: { code: string; message: string } | undefined;
  readonly roomState?: RoomStateUpdatePayload | undefined;
}

/** Room leave request payload. */
export interface RoomLeavePayload {
  readonly roomId: string;
}

/** Generic acknowledgment response. */
export interface AckResponse {
  readonly success: boolean;
  readonly error?: { code: string; message: string } | undefined;
}

/** Room state broadcast payload. */
export interface RoomStateUpdatePayload {
  readonly roomId: string;
  readonly players: ReadonlyArray<{
    userId: string;
    username: string;
    isReady: boolean;
    isConnected: boolean;
  }>;
  readonly hostUserId: string;
  readonly status: string;
}

/** Game action request payload. */
export interface GameActionPayload {
  readonly gameId: string;
  readonly action: GameAction;
}

/** Game action response sent via callback. */
export interface GameActionResponse {
  readonly success: boolean;
  readonly error?: { code: string; message: string } | undefined;
}

/** Game state update broadcast payload. */
export interface GameStateUpdatePayload {
  readonly gameId: string;
  readonly state: SanitizedGameState;
  readonly lastAction: {
    readonly type: string;
    readonly playerId: string;
    readonly timestamp: string;
  };
}

/** Action rejected payload (sent to offending player only). */
export interface ActionRejectedPayload {
  readonly reason: string;
  readonly actionType: string;
  readonly gameId: string;
}

/** Game started broadcast payload. */
export interface GameStartedPayload {
  readonly gameId: string;
  readonly initialState: SanitizedGameState;
}

/** Game ended broadcast payload. */
export interface GameEndedPayload {
  readonly gameId: string;
  readonly result: {
    readonly winnerId: string;
    readonly reason: 'completed' | 'cancelled' | 'forfeit';
    readonly finalState: SanitizedGameState;
  };
}

/** Player joined room payload. */
export interface PlayerJoinedPayload {
  readonly userId: string;
  readonly username: string;
}

/** Player left room payload. */
export interface PlayerLeftPayload {
  readonly userId: string;
  readonly reason: 'voluntary' | 'kicked' | 'disconnect_timeout';
}

/** Player disconnected payload. */
export interface PlayerDisconnectedPayload {
  readonly userId: string;
  readonly gracePeriodMs: number;
}

/** Player reconnected payload. */
export interface PlayerReconnectedPayload {
  readonly userId: string;
}

/** Socket error payload. */
export interface SocketErrorPayload {
  readonly code: SocketErrorCode;
  readonly message: string;
}

/** Possible socket error codes. */
export type SocketErrorCode =
  | 'AUTH_FAILED'
  | 'AUTH_EXPIRED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_IN_ROOM'
  | 'GAME_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'INVALID_ACTION'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** Full state sync payload (sent on reconnect). */
export interface FullSyncPayload {
  readonly roomState: RoomStateUpdatePayload;
  readonly gameState: SanitizedGameState | null;
  readonly presence: ReadonlyArray<PresenceState>;
}

/** Server draining payload. */
export interface ServerDrainingPayload {
  readonly reason: string;
  readonly reconnectAfterMs: number;
}

// ---------------------------------------------------------------------------
// Typed Socket.IO Event Maps
// ---------------------------------------------------------------------------

/**
 * Events the server sends to connected clients.
 */
export interface ServerToClientEvents {
  'room:state_update': (payload: RoomStateUpdatePayload) => void;
  'game:state_update': (payload: GameStateUpdatePayload) => void;
  'game:action_rejected': (payload: ActionRejectedPayload) => void;
  'game:started': (payload: GameStartedPayload) => void;
  'game:ended': (payload: GameEndedPayload) => void;
  'presence:player_joined': (payload: PlayerJoinedPayload) => void;
  'presence:player_left': (payload: PlayerLeftPayload) => void;
  'presence:player_disconnected': (payload: PlayerDisconnectedPayload) => void;
  'presence:player_reconnected': (payload: PlayerReconnectedPayload) => void;
  'error': (payload: SocketErrorPayload) => void;
  'state:full_sync': (payload: FullSyncPayload) => void;
  'server:draining': (payload: ServerDrainingPayload) => void;
}

/**
 * Events the client sends to the server.
 */
export interface ClientToServerEvents {
  'room:join': (
    payload: RoomJoinPayload,
    callback: (response: RoomJoinResponse) => void,
  ) => void;
  'room:leave': (
    payload: RoomLeavePayload,
    callback: (response: AckResponse) => void,
  ) => void;
  'game:action': (
    payload: GameActionPayload,
    callback: (response: GameActionResponse) => void,
  ) => void;
  'presence:heartbeat': () => void;
}

/**
 * Events exchanged between Socket.IO server instances
 * via the Redis adapter for multi-instance coordination.
 */
export interface InterServerEvents {
  'user:force_disconnect': (payload: { userId: string; reason: string }) => void;
  'room:broadcast': (payload: { roomId: string; event: string; data: unknown }) => void;
  'presence:sync': (payload: { roomId: string; presence: PresenceState[] }) => void;
}

/**
 * Data attached to each socket instance.
 * Populated during the auth middleware handshake.
 */
export interface SocketData {
  userId: string;
  username: string;
  email: string;
  sessionId: string;
  connectedAt: string;
}

/**
 * Typed Socket.IO server type alias for convenience.
 */
export type { Server as SocketIOServer } from 'socket.io';

import type { Socket } from 'socket.io';

/**
 * Typed socket instance.
 */
export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
