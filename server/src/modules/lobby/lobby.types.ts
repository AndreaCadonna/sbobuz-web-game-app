/**
 * Lobby module internal types.
 *
 * These extend the shared types with server-side concerns like
 * Redis serialization and archive records.
 *
 * @see docs/specs/lobby-module.md Section 2 (Data Model)
 */

import type { RoomState, RoomSettings, RoomPlayer, RoomStatus } from '@sbobuz/shared';

/**
 * Default room settings applied at creation when not specified.
 */
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 4,
  turnTimerSeconds: 60,
  allowAI: true,
  disconnectGraceSeconds: 30,
};

/**
 * Default room TTL in seconds (30 minutes).
 */
export const ROOM_TTL_SECONDS = 1800;

/**
 * Minimum players required to start a game (always 2).
 */
export const MIN_PLAYERS = 2;

/**
 * Internal mutable room type used during room mutations.
 * The repository converts this to/from JSON for Redis storage.
 */
export interface Room {
  roomId: string;
  hostId: string;
  name: string;
  settings: RoomSettings;
  players: RoomPlayer[];
  status: RoomStatus;
  createdAt: string;
  maxPlayers: number;
  minPlayers: number;
  isPrivate: boolean;
  inviteCode: string;
  ttlSeconds: number;
  lastActivityAt: string;
  gameId?: string | undefined;
}

/**
 * Data required to create a new room.
 */
export interface CreateRoomInput {
  hostId: string;
  hostUsername: string;
  hostDisplayName: string;
  name: string;
  settings?: Partial<RoomSettings> | undefined;
  isPrivate?: boolean | undefined;
}

/**
 * Room archive record persisted to PostgreSQL when a game starts.
 */
export interface RoomArchive {
  roomId: string;
  hostId: string;
  name: string;
  settings: RoomSettings;
  players: RoomPlayer[];
  createdAt: string;
  gameStartedAt: string;
  gameId: string;
}

/**
 * Summary of a room for the public listing.
 * Does NOT include the invite code.
 */
export interface RoomListItem {
  roomId: string;
  name: string;
  hostDisplayName: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  settings: RoomSettings;
  createdAt: string;
}

/**
 * Convert a Room to RoomState (the shared type exposed to clients).
 */
export function toRoomState(room: Room): RoomState {
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    name: room.name,
    settings: room.settings,
    players: room.players,
    status: room.status,
    createdAt: room.createdAt,
    maxPlayers: room.maxPlayers,
    minPlayers: room.minPlayers,
    isPrivate: room.isPrivate,
    inviteCode: room.inviteCode,
    ttlSeconds: room.ttlSeconds,
    lastActivityAt: room.lastActivityAt,
  };
}

/**
 * Compute the room status based on current player state.
 * Terminal states (IN_GAME, COMPLETED, EXPIRED) are never recomputed.
 */
export function computeRoomStatus(room: Room): RoomStatus {
  if (room.status === 'EXPIRED' || room.status === 'COMPLETED' || room.status === 'IN_GAME') {
    return room.status;
  }

  const humanPlayers = room.players.filter((p) => !p.isAI);
  const allHumansReady = humanPlayers.length > 0 && humanPlayers.every((p) => p.isReady);
  const totalPlayers = room.players.length;
  const meetsMinimum = totalPlayers >= room.minPlayers;
  const hasHumanPlayers = humanPlayers.length >= 1;

  if (allHumansReady && meetsMinimum && hasHumanPlayers) {
    return 'READY';
  }

  return 'WAITING';
}
