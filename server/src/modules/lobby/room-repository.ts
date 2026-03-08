/**
 * Room repository — Redis-backed active room CRUD with PostgreSQL archival.
 *
 * Active rooms live in Redis as JSON strings with TTL. When a game starts,
 * room metadata is archived to the PostgreSQL `rooms` table.
 *
 * Redis key structure:
 * - `room:{roomId}` — JSON Room object, TTL = room.ttlSeconds
 * - `room:invite:{inviteCode}` — roomId string, TTL synced with room
 * - `room:public_list` — SET of public room IDs (status = WAITING)
 * - `user:current_room:{userId}` — roomId string, TTL synced with room
 *
 * @see docs/specs/lobby-module.md Section 2 (Data Model)
 * @see docs/specs/lobby-module.md Section 7 (Processing Logic)
 */

import { getPool } from '../../infra/database/index.js';
import { getRedisClient } from '../../infra/redis/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import type { Room, RoomArchive, RoomListItem } from './lobby.types.js';

const logger = createModuleLogger('lobby');

// --- Redis key helpers ---

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}

function inviteKey(inviteCode: string): string {
  return `room:invite:${inviteCode}`;
}

function userCurrentRoomKey(userId: string): string {
  return `user:current_room:${userId}`;
}

const PUBLIC_LIST_KEY = 'room:public_list';

// --- Room CRUD ---

/**
 * Save a room to Redis with all associated keys.
 * Uses a pipeline for atomicity.
 *
 * @param room - The room to save.
 */
export async function saveRoom(room: Room): Promise<void> {
  const redis = getRedisClient();
  const ttl = room.ttlSeconds;
  const json = JSON.stringify(room);

  const pipeline = redis.pipeline();

  // Store room JSON with TTL
  pipeline.set(roomKey(room.roomId), json, 'EX', ttl);

  // Store invite code mapping with same TTL
  pipeline.set(inviteKey(room.inviteCode), room.roomId, 'EX', ttl);

  // Refresh TTL on user:current_room keys for all human players
  for (const player of room.players) {
    if (!player.isAI) {
      pipeline.set(userCurrentRoomKey(player.userId), room.roomId, 'EX', ttl);
    }
  }

  // Manage public list membership
  if (!room.isPrivate && room.status === 'WAITING') {
    pipeline.sadd(PUBLIC_LIST_KEY, room.roomId);
  } else {
    pipeline.srem(PUBLIC_LIST_KEY, room.roomId);
  }

  await pipeline.exec();

  logger.debug({ roomId: room.roomId, status: room.status }, 'Room saved to Redis');
}

/**
 * Get a room by ID from Redis.
 *
 * @param roomId - The room UUID.
 * @returns The Room or undefined if not found / expired.
 */
export async function getRoom(roomId: string): Promise<Room | undefined> {
  const redis = getRedisClient();
  const json = await redis.get(roomKey(roomId));

  if (!json) return undefined;

  return JSON.parse(json) as Room;
}

/**
 * Resolve a room ID from an invite code.
 *
 * @param inviteCode - The invite code.
 * @returns The roomId or undefined if not found / expired.
 */
export async function getRoomIdByInviteCode(inviteCode: string): Promise<string | undefined> {
  const redis = getRedisClient();
  const roomId = await redis.get(inviteKey(inviteCode));
  return roomId ?? undefined;
}

/**
 * Get the room a user is currently in.
 *
 * @param userId - The user UUID.
 * @returns The roomId or undefined if user is not in a room.
 */
export async function getUserCurrentRoom(userId: string): Promise<string | undefined> {
  const redis = getRedisClient();
  const roomId = await redis.get(userCurrentRoomKey(userId));
  return roomId ?? undefined;
}

/**
 * Set the user's current room mapping.
 *
 * @param userId - The user UUID.
 * @param roomId - The room UUID.
 * @param ttl - TTL in seconds.
 */
export async function setUserCurrentRoom(userId: string, roomId: string, ttl: number): Promise<void> {
  const redis = getRedisClient();
  await redis.set(userCurrentRoomKey(userId), roomId, 'EX', ttl);
}

/**
 * Clear the user's current room mapping.
 *
 * @param userId - The user UUID.
 */
export async function clearUserCurrentRoom(userId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(userCurrentRoomKey(userId));
}

/**
 * Delete a room and all associated keys from Redis.
 *
 * @param room - The room to delete.
 */
export async function deleteRoom(room: Room): Promise<void> {
  const redis = getRedisClient();
  const pipeline = redis.pipeline();

  // Delete room JSON
  pipeline.del(roomKey(room.roomId));

  // Delete invite code mapping
  pipeline.del(inviteKey(room.inviteCode));

  // Remove from public list
  pipeline.srem(PUBLIC_LIST_KEY, room.roomId);

  // Clear user:current_room for all human players
  for (const player of room.players) {
    if (!player.isAI) {
      pipeline.del(userCurrentRoomKey(player.userId));
    }
  }

  await pipeline.exec();

  logger.info({ roomId: room.roomId }, 'Room deleted from Redis');
}

/**
 * List public rooms (rooms in the public_list SET with status WAITING).
 *
 * Fetches room IDs from the SET, then retrieves room details for each.
 * Filters out any rooms that no longer exist (expired between SET read and GET).
 *
 * @returns Array of RoomListItem for public display.
 */
export async function listPublicRooms(): Promise<RoomListItem[]> {
  const redis = getRedisClient();
  const roomIds = await redis.smembers(PUBLIC_LIST_KEY);

  if (roomIds.length === 0) return [];

  // Fetch all rooms in parallel
  const pipeline = redis.pipeline();
  for (const id of roomIds) {
    pipeline.get(roomKey(id));
  }
  const results = await pipeline.exec();

  if (!results) return [];

  const rooms: RoomListItem[] = [];
  const staleIds: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const [err, json] = results[i] as [Error | null, string | null];
    if (err || !json) {
      // Room expired, mark for cleanup
      staleIds.push(roomIds[i]!);
      continue;
    }

    const room = JSON.parse(json) as Room;

    // Only include rooms that are still WAITING
    if (room.status !== 'WAITING') {
      staleIds.push(roomIds[i]!);
      continue;
    }

    const hostPlayer = room.players.find((p) => p.isHost);

    rooms.push({
      roomId: room.roomId,
      name: room.name,
      hostDisplayName: hostPlayer?.displayName ?? 'Unknown',
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      status: room.status,
      settings: room.settings,
      createdAt: room.createdAt,
    });
  }

  // Clean up stale entries from the public list
  if (staleIds.length > 0) {
    const cleanupPipeline = redis.pipeline();
    for (const id of staleIds) {
      cleanupPipeline.srem(PUBLIC_LIST_KEY, id);
    }
    await cleanupPipeline.exec();

    logger.debug({ count: staleIds.length }, 'Cleaned up stale rooms from public list');
  }

  return rooms;
}

/**
 * Archive a room to PostgreSQL when a game starts.
 *
 * Inserts a record into the `rooms` table with the room metadata snapshot.
 *
 * @param archive - The room archive data.
 */
export async function archiveRoom(archive: RoomArchive): Promise<void> {
  const pool = getPool();

  await pool.query(
    `INSERT INTO rooms (id, host_user_id, room_code, visibility, max_players,
       turn_timer_seconds, disconnect_grace_seconds, player_ids,
       status, created_at, game_started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      archive.roomId,
      archive.hostId,
      archive.players.length <= 6 ? archive.roomId.slice(0, 6) : archive.roomId.slice(0, 6),
      'public', // visibility is derived from room state
      archive.settings.maxPlayers,
      archive.settings.turnTimerSeconds,
      archive.settings.disconnectGraceSeconds,
      archive.players.map((p) => p.userId),
      'game_started',
      archive.createdAt,
      archive.gameStartedAt,
    ],
  );

  logger.info(
    { roomId: archive.roomId, gameId: archive.gameId },
    'Room archived to PostgreSQL',
  );
}
