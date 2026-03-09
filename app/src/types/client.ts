/**
 * Client-only types for the Sbobuz frontend.
 *
 * These types are NOT shared with the server. They represent UI state,
 * client-side views, and frontend-specific concerns.
 *
 * Server-authoritative types are imported from '@sbobuz/shared'.
 */
import type {
  Card,
  GameAction,
  GameConfig,
  GamePhase,
  ActiveZone,
  RoomPlayer,
  RoomSettings,
  RoomStatus,
} from '@sbobuz/shared';

// ── Re-export shared types for convenience ────────────────────────

export type {
  Card,
  GameAction,
  GameConfig,
  GamePhase,
  ActiveZone,
  RoomPlayer,
  RoomSettings,
  RoomStatus,
};

// ── Sanitized Game State (mirrors server's SanitizedGameState) ─────

/**
 * A player's state as seen by a specific viewer.
 * Hand cards are null for opponents (hidden).
 */
export interface SanitizedPlayerState {
  readonly id: string;
  readonly hand: ReadonlyArray<Card> | null;
  readonly handCount: number;
  readonly faceUpCards: ReadonlyArray<Card>;
  readonly faceDownCount: number;
}

/**
 * The server-sanitized game state sent to each player.
 * Private information (other players' hands, draw pile order) has been removed.
 */
export interface SanitizedGameState {
  readonly gameId: string;
  readonly phase: GamePhase;
  readonly config: GameConfig;
  readonly drawPileCount: number;
  readonly playPile: ReadonlyArray<Card>;
  readonly burnPileCount: number;
  readonly players: ReadonlyArray<SanitizedPlayerState>;
  readonly turnOrder: ReadonlyArray<string>;
  readonly currentPlayerIndex: number;
  readonly turnDirection: 1 | -1;
  readonly freePlay: boolean;
  readonly nextCardOverride: 'lower' | null;
  readonly actionCount: number;
}

// ── Socket Event Payloads (client-side mirror) ─────────────────────

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

export interface GameStateUpdatePayload {
  readonly gameId: string;
  readonly state: SanitizedGameState;
  readonly lastAction: {
    readonly type: string;
    readonly playerId: string;
    readonly timestamp: string;
  };
}

export interface ActionRejectedPayload {
  readonly reason: string;
  readonly actionType: string;
  readonly gameId: string;
}

export interface GameStartedPayload {
  readonly gameId: string;
  readonly initialState: SanitizedGameState;
}

export interface GameEndedPayload {
  readonly gameId: string;
  readonly result: {
    readonly winnerId: string;
    readonly reason: 'completed' | 'cancelled' | 'forfeit';
    readonly finalState: SanitizedGameState;
  };
}

export interface PlayerJoinedPayload {
  readonly userId: string;
  readonly username: string;
}

export interface PlayerLeftPayload {
  readonly userId: string;
  readonly reason: 'voluntary' | 'kicked' | 'disconnect_timeout';
}

export interface PlayerDisconnectedPayload {
  readonly userId: string;
  readonly gracePeriodMs: number;
}

export interface PlayerReconnectedPayload {
  readonly userId: string;
}

export interface SocketErrorPayload {
  readonly code: string;
  readonly message: string;
}

export interface FullSyncPayload {
  readonly roomState: RoomStateUpdatePayload;
  readonly gameState: SanitizedGameState | null;
  readonly presence: ReadonlyArray<{
    readonly userId: string;
    readonly status: 'ONLINE' | 'AWAY' | 'DISCONNECTED';
    readonly lastSeen: string;
    readonly gracePeriodEndsAt: string | null;
  }>;
}

export interface ServerDrainingPayload {
  readonly reason: string;
  readonly reconnectAfterMs: number;
}

export interface GameActionPayload {
  readonly gameId: string;
  readonly action: GameAction;
}

export interface RoomJoinPayload {
  readonly roomId: string;
}

export interface RoomLeavePayload {
  readonly roomId: string;
}

export interface AckResponse {
  readonly success: boolean;
  readonly error?: { code: string; message: string } | undefined;
}

export interface RoomJoinResponse {
  readonly success: boolean;
  readonly error?: { code: string; message: string } | undefined;
  readonly roomState?: RoomStateUpdatePayload | undefined;
}

export interface GameActionResponse {
  readonly success: boolean;
  readonly error?: { code: string; message: string } | undefined;
}

// ── Socket.IO Typed Event Maps (client perspective) ─────────────────

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
  error: (payload: SocketErrorPayload) => void;
  'state:full_sync': (payload: FullSyncPayload) => void;
  'server:draining': (payload: ServerDrainingPayload) => void;
}

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
  'game:request_state': (
    payload: { gameId: string },
    callback: (response: { success: boolean; state?: SanitizedGameState; error?: string }) => void,
  ) => void;
  'presence:heartbeat': () => void;
}

// ── Auth Types ─────────────────────────────────────────────────────

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly createdAt: string | null;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

// ── UI Types ───────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  readonly id: string;
  readonly type: NotificationType;
  readonly message: string;
  readonly durationMs: number;
  readonly createdAt: number;
}

export type ModalType =
  | { type: 'confirm_leave_game' }
  | { type: 'game_over'; winnerId: string | null }
  | { type: 'player_kicked'; reason: string }
  | { type: 'room_expired' }
  | { type: 'server_unavailable' }
  | { type: 'invite_link'; roomId: string; inviteCode: string }
  | { type: 'settings' };

// ── Room Types ─────────────────────────────────────────────────────

export interface RoomSummary {
  readonly roomId: string;
  readonly name: string;
  readonly hostDisplayName: string;
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly status: RoomStatus;
  readonly turnTimerSeconds: number;
  readonly isPrivate: boolean;
  readonly createdAt: string;
}

export interface RoomDetail {
  readonly roomId: string;
  readonly name: string;
  readonly hostId: string;
  readonly players: ReadonlyArray<RoomPlayer>;
  readonly maxPlayers: number;
  readonly minPlayers: number;
  readonly status: RoomStatus;
  readonly settings: RoomSettings;
  readonly inviteCode: string;
  readonly isPrivate: boolean;
  readonly createdAt: string;
  readonly lastActivityAt: string;
}
