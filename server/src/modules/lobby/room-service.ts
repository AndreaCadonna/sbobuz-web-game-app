/**
 * Room service — business logic for room lifecycle.
 *
 * Orchestrates room creation, joining, leaving, readying, starting games,
 * AI player management, and settings updates. All mutations are persisted
 * to Redis via the room repository.
 *
 * @see docs/specs/lobby-module.md Section 4-7 (Actions, Validation, Business Rules, Processing)
 */

import { randomUUID } from 'node:crypto';

import type { RoomPlayer, RoomSettings, RoomState } from '@sbobuz/shared';

import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import type { Room, CreateRoomInput, RoomListItem } from './lobby.types.js';
import {
  computeRoomStatus,
  DEFAULT_ROOM_SETTINGS,
  MIN_PLAYERS,
  ROOM_TTL_SECONDS,
  toRoomState,
} from './lobby.types.js';
import {
  saveRoom,
  getRoom,
  getRoomIdByInviteCode,
  getUserCurrentRoom,
  clearUserCurrentRoom,
  deleteRoom,
  listPublicRooms,
  archiveRoom,
} from './room-repository.js';

const logger = createModuleLogger('lobby');

// --- Helper: generate invite code (8-char alphanumeric) ---

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

// --- CREATE_ROOM ---

/**
 * Create a new room.
 *
 * @param input - Room creation data.
 * @returns The created room state and invite code.
 */
export async function createRoom(input: CreateRoomInput): Promise<{ room: RoomState; inviteCode: string }> {
  // Check user is not already in a room
  const existingRoom = await getUserCurrentRoom(input.hostId);
  if (existingRoom) {
    throw new ConflictError('You are already in a room', {
      errorCode: 'ROOM_ALREADY_IN_GAME',
    });
  }

  const now = new Date().toISOString();
  const roomId = randomUUID();
  const inviteCode = generateInviteCode();

  // Merge settings with defaults
  const settings: RoomSettings = {
    maxPlayers: input.settings?.maxPlayers ?? DEFAULT_ROOM_SETTINGS.maxPlayers,
    turnTimerSeconds: input.settings?.turnTimerSeconds ?? DEFAULT_ROOM_SETTINGS.turnTimerSeconds,
    allowAI: input.settings?.allowAI ?? DEFAULT_ROOM_SETTINGS.allowAI,
    disconnectGraceSeconds: input.settings?.disconnectGraceSeconds ?? DEFAULT_ROOM_SETTINGS.disconnectGraceSeconds,
  };

  const hostPlayer: RoomPlayer = {
    userId: input.hostId,
    username: input.hostUsername,
    displayName: input.hostDisplayName,
    isReady: false,
    isHost: true,
    isAI: false,
    joinedAt: now,
    connectionStatus: 'connected',
  };

  const room: Room = {
    roomId,
    hostId: input.hostId,
    name: input.name.trim(),
    settings,
    players: [hostPlayer],
    status: 'WAITING',
    createdAt: now,
    maxPlayers: settings.maxPlayers,
    minPlayers: MIN_PLAYERS,
    isPrivate: input.isPrivate ?? false,
    inviteCode,
    ttlSeconds: ROOM_TTL_SECONDS,
    lastActivityAt: now,
  };

  await saveRoom(room);

  logger.info(
    { roomId, hostId: input.hostId, isPrivate: room.isPrivate },
    'Room created',
  );

  return { room: toRoomState(room), inviteCode };
}

// --- JOIN_ROOM ---

/**
 * Join a room by roomId or inviteCode.
 *
 * @param userId - The joining user's ID.
 * @param username - The joining user's username.
 * @param displayName - The joining user's display name.
 * @param roomId - The room to join (mutually exclusive with inviteCode).
 * @param inviteCode - The invite code to join by (mutually exclusive with roomId).
 * @returns The updated room state.
 */
export async function joinRoom(
  userId: string,
  username: string,
  displayName: string,
  roomId?: string | undefined,
  inviteCode?: string | undefined,
): Promise<RoomState> {
  // Resolve room ID
  let resolvedRoomId: string | undefined = roomId;
  if (inviteCode) {
    resolvedRoomId = await getRoomIdByInviteCode(inviteCode);
    if (!resolvedRoomId) {
      throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
    }
  }

  if (!resolvedRoomId) {
    throw new ValidationError('Provide roomId or inviteCode');
  }

  // Check user is not already in a room
  const existingRoom = await getUserCurrentRoom(userId);
  if (existingRoom) {
    if (existingRoom === resolvedRoomId) {
      throw new ConflictError('You are already in this room', {
        errorCode: 'ROOM_ALREADY_IN_GAME',
      });
    }
    throw new ConflictError('You are already in another room. Leave it first.', {
      errorCode: 'ROOM_ALREADY_IN_GAME',
    });
  }

  // Fetch room
  const room = await getRoom(resolvedRoomId);
  if (!room) {
    throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
  }

  // Check room status
  if (room.status !== 'WAITING') {
    if (room.status === 'IN_GAME') {
      throw new ConflictError('Game has already started', {
        errorCode: 'ROOM_ALREADY_IN_GAME',
      });
    }
    if (room.status === 'READY') {
      throw new ConflictError('Room is full or game is about to start', {
        errorCode: 'ROOM_FULL',
      });
    }
    throw new NotFoundError('Room no longer exists', { errorCode: 'ROOM_NOT_FOUND' });
  }

  // Check not full
  if (room.players.length >= room.maxPlayers) {
    throw new ConflictError('Room is full', { errorCode: 'ROOM_FULL' });
  }

  // Check not already in this room
  if (room.players.some((p) => p.userId === userId)) {
    throw new ConflictError('You are already in this room', {
      errorCode: 'ROOM_ALREADY_IN_GAME',
    });
  }

  // Add player
  const now = new Date().toISOString();
  const newPlayer: RoomPlayer = {
    userId,
    username,
    displayName,
    isReady: false,
    isHost: false,
    isAI: false,
    joinedAt: now,
    connectionStatus: 'connected',
  };

  room.players = [...room.players, newPlayer];
  room.lastActivityAt = now;
  room.status = computeRoomStatus(room);

  await saveRoom(room);

  logger.info({ roomId: room.roomId, userId }, 'Player joined room');

  return toRoomState(room);
}

// --- LEAVE_ROOM ---

/**
 * Leave a room. Handles host transfer and empty room cleanup.
 *
 * @param userId - The leaving user's ID.
 * @param roomId - The room to leave.
 * @returns The updated room state, or undefined if the room was deleted.
 */
export async function leaveRoom(
  userId: string,
  roomId: string,
): Promise<{ room: RoomState | undefined; hostTransferred: boolean; newHostId?: string | undefined }> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
  }

  // Check user is in this room
  const playerIndex = room.players.findIndex((p) => p.userId === userId);
  if (playerIndex === -1) {
    throw new NotFoundError('You are not in this room', {
      errorCode: 'ROOM_PLAYER_NOT_IN_ROOM',
    });
  }

  const wasHost = room.players[playerIndex]!.isHost;

  // Remove player
  room.players = room.players.filter((p) => p.userId !== userId);

  // Clear user's current room
  await clearUserCurrentRoom(userId);

  // If room is empty, delete it
  if (room.players.length === 0) {
    await deleteRoom(room);
    logger.info({ roomId }, 'Room deleted (empty)');
    return { room: undefined, hostTransferred: false };
  }

  let hostTransferred = false;
  let newHostId: string | undefined;

  // Host transfer if the departing player was the host
  if (wasHost) {
    // Find the longest-standing human player
    const humanPlayers = room.players
      .filter((p) => !p.isAI)
      .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

    if (humanPlayers.length > 0) {
      const newHost = humanPlayers[0]!;
      newHostId = newHost.userId;

      // Update the host in the players array
      room.players = room.players.map((p) => ({
        ...p,
        isHost: p.userId === newHost.userId,
      }));
      room.hostId = newHost.userId;
      hostTransferred = true;

      logger.info(
        { roomId, oldHostId: userId, newHostId: newHost.userId },
        'Host transferred',
      );
    } else {
      // No human players remain (only AI) — delete the room
      await deleteRoom(room);
      logger.info({ roomId }, 'Room deleted (no human players remain)');
      return { room: undefined, hostTransferred: false };
    }
  }

  const now = new Date().toISOString();
  room.lastActivityAt = now;
  room.status = computeRoomStatus(room);

  await saveRoom(room);

  logger.info({ roomId, userId }, 'Player left room');

  return { room: toRoomState(room), hostTransferred, newHostId };
}

// --- SET_READY ---

/**
 * Toggle a player's ready state.
 *
 * @param userId - The player's user ID.
 * @param roomId - The room ID.
 * @param isReady - The desired ready state.
 * @returns The updated room state.
 */
export async function setReady(
  userId: string,
  roomId: string,
  isReady: boolean,
): Promise<RoomState> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
  }

  // Check room status
  if (room.status !== 'WAITING' && room.status !== 'READY') {
    throw new ConflictError('Cannot change ready status in current room state', {
      errorCode: 'ROOM_NOT_READY',
    });
  }

  // Check user is in this room
  const player = room.players.find((p) => p.userId === userId);
  if (!player) {
    throw new NotFoundError('You are not in this room', {
      errorCode: 'ROOM_PLAYER_NOT_IN_ROOM',
    });
  }

  // AI players cannot toggle ready
  if (player.isAI) {
    throw new ValidationError('AI players cannot toggle ready status');
  }

  // Update ready state
  room.players = room.players.map((p) =>
    p.userId === userId ? { ...p, isReady } : p,
  );

  const now = new Date().toISOString();
  room.lastActivityAt = now;
  room.status = computeRoomStatus(room);

  await saveRoom(room);

  logger.info({ roomId, userId, isReady }, 'Player ready state changed');

  return toRoomState(room);
}

// --- START_GAME ---

/**
 * Start the game for a room. Host only. Room must be READY.
 *
 * Archives the room to PostgreSQL and transitions to IN_GAME.
 * Returns the gameId (placeholder until Game Engine integration).
 *
 * @param userId - The requesting user's ID (must be host).
 * @param roomId - The room ID.
 * @returns The game ID and updated room state.
 */
export async function startGame(
  userId: string,
  roomId: string,
): Promise<{ gameId: string; room: RoomState }> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
  }

  // Check user is host
  if (room.hostId !== userId) {
    throw new AuthorizationError('Only the host can start the game', {
      errorCode: 'ROOM_NOT_HOST',
    });
  }

  // Check room status
  if (room.status !== 'READY') {
    if (room.status === 'WAITING') {
      throw new ConflictError('Not all players are ready', {
        errorCode: 'ROOM_NOT_READY',
      });
    }
    throw new ConflictError('Cannot start game in current room state', {
      errorCode: 'ROOM_ALREADY_IN_GAME',
    });
  }

  // Double-check: all humans ready, min players, at least one human
  const humanPlayers = room.players.filter((p) => !p.isAI);
  if (humanPlayers.length === 0) {
    throw new ValidationError('Cannot start a game with only AI players');
  }
  if (!humanPlayers.every((p) => p.isReady)) {
    throw new ConflictError('Not all players are ready', {
      errorCode: 'ROOM_NOT_READY',
    });
  }
  if (room.players.length < room.minPlayers) {
    throw new ConflictError('Not enough players to start', {
      errorCode: 'ROOM_NOT_READY',
    });
  }

  // Transition to IN_GAME
  const now = new Date().toISOString();
  const gameId = randomUUID();

  room.status = 'IN_GAME';
  room.gameId = gameId;
  room.lastActivityAt = now;

  // Archive to PostgreSQL
  await archiveRoom({
    roomId: room.roomId,
    hostId: room.hostId,
    name: room.name,
    settings: room.settings,
    players: room.players,
    createdAt: room.createdAt,
    gameStartedAt: now,
    gameId,
  });

  // Save updated room to Redis (removes from public list)
  await saveRoom(room);

  logger.info({ roomId, gameId, playerCount: room.players.length }, 'Game started');

  return { gameId, room: toRoomState(room) };
}

// --- ADD_AI_PLAYER ---

/**
 * Add an AI player to the room. Host only.
 *
 * @param userId - The requesting user's ID (must be host).
 * @param roomId - The room ID.
 * @param difficulty - AI difficulty level.
 * @returns The updated room state.
 */
export async function addAIPlayer(
  userId: string,
  roomId: string,
  difficulty: 'easy' | 'medium' | 'hard',
): Promise<RoomState> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
  }

  // Check user is host
  if (room.hostId !== userId) {
    throw new AuthorizationError('Only the host can add AI players', {
      errorCode: 'ROOM_NOT_HOST',
    });
  }

  // Check room status
  if (room.status !== 'WAITING' && room.status !== 'READY') {
    throw new ConflictError('Cannot add AI player in current room state', {
      errorCode: 'ROOM_ALREADY_IN_GAME',
    });
  }

  // Check AI allowed
  if (!room.settings.allowAI) {
    throw new ValidationError('AI players are not allowed in this room');
  }

  // Check not full
  if (room.players.length >= room.maxPlayers) {
    throw new ConflictError('Room is full', { errorCode: 'ROOM_FULL' });
  }

  // Generate AI player ID
  const aiCount = room.players.filter((p) => p.isAI).length;
  const aiId = `ai_${difficulty}_${aiCount + 1}`;
  const now = new Date().toISOString();

  const capitalDifficulty = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  const aiPlayer: RoomPlayer = {
    userId: aiId,
    username: `AI (${capitalDifficulty})`,
    displayName: `AI (${capitalDifficulty})`,
    isReady: false,
    isHost: false,
    isAI: true,
    aiDifficulty: difficulty,
    joinedAt: now,
    connectionStatus: 'connected',
  };

  room.players = [...room.players, aiPlayer];

  // Unready all human players (like a settings change)
  room.players = room.players.map((p) =>
    p.isAI ? p : { ...p, isReady: false },
  );

  room.lastActivityAt = now;
  room.status = computeRoomStatus(room);

  await saveRoom(room);

  logger.info({ roomId, aiId, difficulty }, 'AI player added');

  return toRoomState(room);
}

// --- REMOVE_PLAYER (Kick) ---

/**
 * Remove (kick) a player from the room. Host only.
 *
 * @param hostUserId - The requesting user's ID (must be host).
 * @param roomId - The room ID.
 * @param targetUserId - The user to kick.
 * @returns The updated room state.
 */
export async function removePlayer(
  hostUserId: string,
  roomId: string,
  targetUserId: string,
): Promise<RoomState> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
  }

  // Check user is host
  if (room.hostId !== hostUserId) {
    throw new AuthorizationError('Only the host can remove players', {
      errorCode: 'ROOM_NOT_HOST',
    });
  }

  // Check target is in room
  const targetPlayer = room.players.find((p) => p.userId === targetUserId);
  if (!targetPlayer) {
    throw new NotFoundError('Player not in room', {
      errorCode: 'ROOM_PLAYER_NOT_IN_ROOM',
    });
  }

  // Cannot kick the host
  if (targetUserId === room.hostId) {
    throw new ValidationError('Cannot kick the host. Use leave instead.');
  }

  // Remove target player
  room.players = room.players.filter((p) => p.userId !== targetUserId);

  // Clear target's current room mapping (only for human players)
  if (!targetPlayer.isAI) {
    await clearUserCurrentRoom(targetUserId);
  }

  const now = new Date().toISOString();
  room.lastActivityAt = now;
  room.status = computeRoomStatus(room);

  await saveRoom(room);

  logger.info({ roomId, targetUserId, kickedBy: hostUserId }, 'Player removed from room');

  return toRoomState(room);
}

// --- UPDATE_SETTINGS ---

/**
 * Update room settings. Host only. Unreadies all human players.
 *
 * @param userId - The requesting user's ID (must be host).
 * @param roomId - The room ID.
 * @param newSettings - Partial settings to merge.
 * @returns The updated room state.
 */
export async function updateSettings(
  userId: string,
  roomId: string,
  newSettings: Partial<RoomSettings>,
): Promise<RoomState> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
  }

  // Check user is host
  if (room.hostId !== userId) {
    throw new AuthorizationError('Only the host can change settings', {
      errorCode: 'ROOM_NOT_HOST',
    });
  }

  // Check room status
  if (room.status !== 'WAITING' && room.status !== 'READY') {
    throw new ConflictError('Cannot change settings in current room state', {
      errorCode: 'ROOM_ALREADY_IN_GAME',
    });
  }

  // Validate maxPlayers against current player count
  if (newSettings.maxPlayers !== undefined && newSettings.maxPlayers < room.players.length) {
    throw new ValidationError(
      `Cannot reduce max players below current player count (${room.players.length})`,
    );
  }

  // If allowAI changed to false and AI players exist, remove them
  if (newSettings.allowAI === false && room.players.some((p) => p.isAI)) {
    room.players = room.players.filter((p) => !p.isAI);
    logger.info({ roomId }, 'AI players removed (allowAI set to false)');
  }

  // Merge settings
  room.settings = {
    ...room.settings,
    ...newSettings,
  };

  // Update maxPlayers on room level if changed
  if (newSettings.maxPlayers !== undefined) {
    room.maxPlayers = newSettings.maxPlayers;
  }

  // Unready all human players
  room.players = room.players.map((p) =>
    p.isAI ? p : { ...p, isReady: false },
  );

  const now = new Date().toISOString();
  room.lastActivityAt = now;
  room.status = computeRoomStatus(room);

  await saveRoom(room);

  logger.info({ roomId, settings: newSettings }, 'Room settings updated');

  return toRoomState(room);
}

// --- GET_ROOM ---

/**
 * Get room details by ID.
 *
 * @param roomId - The room UUID.
 * @returns The room state.
 */
export async function getRoomDetails(roomId: string): Promise<RoomState> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new NotFoundError('Room not found', { errorCode: 'ROOM_NOT_FOUND' });
  }
  return toRoomState(room);
}

// --- LIST_ROOMS ---

/**
 * List public rooms.
 *
 * @returns Array of room list items.
 */
export async function listRooms(): Promise<RoomListItem[]> {
  return listPublicRooms();
}
