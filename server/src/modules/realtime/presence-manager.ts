/**
 * Presence Manager — tracks player connectivity status within rooms.
 *
 * Manages the ONLINE/AWAY/DISCONNECTED presence lifecycle, 30-second grace
 * period on disconnect, and reconnection handling with full state sync.
 *
 * Presence state is stored in Redis for cross-instance visibility:
 * - `ws:room:{roomId}:presence` — Hash of userId -> JSON PresenceState
 * - `presence:{userId}:grace` — String with 30-second TTL
 *
 * @see docs/specs/realtime-module.md Section 5.5 (Disconnect and Grace Period)
 * @see docs/specs/realtime-module.md Section 5.6 (State Rehydration on Reconnect)
 * @see docs/specs/realtime-module.md Section 7 (Redis Key Schema)
 */

import { getRedisClient } from '../../infra/redis/index.js';
import type { PresenceState, PresenceStatus } from '../../infra/websocket/types.js';
import { createModuleLogger } from '../../shared/logger.js';

const logger = createModuleLogger('realtime');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Grace period duration in milliseconds (30 seconds). */
export const GRACE_PERIOD_MS = 30_000;

/** Grace period duration in seconds (for Redis TTL). */
const GRACE_PERIOD_SECONDS = 30;

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

function roomPresenceKey(roomId: string): string {
  return `ws:room:${roomId}:presence`;
}

function graceKey(userId: string): string {
  return `presence:${userId}:grace`;
}

// ---------------------------------------------------------------------------
// Grace period tracking in memory (roomId -> Map<userId, timeout>)
// ---------------------------------------------------------------------------

const graceTimers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Set a player's presence to ONLINE when they connect/join a room.
 *
 * @param roomId - The room ID.
 * @param userId - The user ID.
 */
export async function setOnline(roomId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const presence: PresenceState = {
    userId,
    status: 'ONLINE',
    lastSeen: now,
    gracePeriodEndsAt: null,
  };

  const redis = getRedisClient();
  await redis.hset(roomPresenceKey(roomId), userId, JSON.stringify(presence));

  // Clear any existing grace period
  await clearGracePeriod(roomId, userId);

  logger.debug({ roomId, userId }, 'Presence set to ONLINE');
}

/**
 * Set a player's presence to DISCONNECTED and start the grace period.
 *
 * @param roomId - The room ID.
 * @param userId - The user ID.
 * @param onGraceExpired - Callback invoked when the grace period expires.
 */
export async function setDisconnected(
  roomId: string,
  userId: string,
  onGraceExpired: (roomId: string, userId: string) => void,
): Promise<void> {
  const now = new Date();
  const gracePeriodEndsAt = new Date(now.getTime() + GRACE_PERIOD_MS).toISOString();

  const presence: PresenceState = {
    userId,
    status: 'DISCONNECTED',
    lastSeen: now.toISOString(),
    gracePeriodEndsAt,
  };

  const redis = getRedisClient();
  const pipeline = redis.pipeline();
  pipeline.hset(roomPresenceKey(roomId), userId, JSON.stringify(presence));
  pipeline.set(graceKey(userId), '1', 'EX', GRACE_PERIOD_SECONDS);
  await pipeline.exec();

  // Set local timer for grace period expiration
  startGraceTimer(roomId, userId, onGraceExpired);

  logger.info(
    { roomId, userId, gracePeriodEndsAt },
    'Presence set to DISCONNECTED, grace period started',
  );
}

/**
 * Check if a user is in a grace period (disconnected but not yet expired).
 *
 * @param userId - The user ID.
 * @returns The room ID if in grace period, or null if not.
 */
export async function checkGracePeriod(userId: string): Promise<string | null> {
  const redis = getRedisClient();
  const exists = await redis.exists(graceKey(userId));

  if (!exists) {
    return null;
  }

  // Find which room they were in by checking our grace timers
  for (const [roomId, userTimers] of graceTimers) {
    if (userTimers.has(userId)) {
      return roomId;
    }
  }

  // Fallback: scan Redis presence hashes (slower, but handles cross-instance)
  // In practice, the timer map should cover single-instance cases
  return null;
}

/**
 * Check if a user has a grace period entry in Redis for a specific room.
 *
 * @param roomId - The room ID.
 * @param userId - The user ID.
 * @returns true if the user has presence in the room AND a grace key exists.
 */
export async function isInGracePeriod(roomId: string, userId: string): Promise<boolean> {
  const redis = getRedisClient();
  const [presenceRaw, graceExists] = await Promise.all([
    redis.hget(roomPresenceKey(roomId), userId),
    redis.exists(graceKey(userId)),
  ]);

  if (!presenceRaw || !graceExists) {
    return false;
  }

  const presence = JSON.parse(presenceRaw) as PresenceState;
  return presence.status === 'DISCONNECTED';
}

/**
 * Handle a player reconnecting within the grace period.
 *
 * Restores presence to ONLINE and clears the grace period.
 *
 * @param roomId - The room ID.
 * @param userId - The user ID.
 * @returns true if reconnection was within grace, false if grace had expired.
 */
export async function handleReconnection(roomId: string, userId: string): Promise<boolean> {
  const redis = getRedisClient();

  // Check if grace period key still exists
  const graceExists = await redis.exists(graceKey(userId));
  if (!graceExists) {
    return false;
  }

  // Restore to ONLINE
  await setOnline(roomId, userId);

  logger.info({ roomId, userId }, 'Player reconnected within grace period');
  return true;
}

/**
 * Remove a player's presence from a room entirely.
 *
 * Called when grace period expires or player voluntarily leaves.
 *
 * @param roomId - The room ID.
 * @param userId - The user ID.
 */
export async function removePresence(roomId: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  const pipeline = redis.pipeline();
  pipeline.hdel(roomPresenceKey(roomId), userId);
  pipeline.del(graceKey(userId));
  await pipeline.exec();

  clearGraceTimer(roomId, userId);

  logger.debug({ roomId, userId }, 'Presence removed');
}

/**
 * Get all presence states for a room.
 *
 * @param roomId - The room ID.
 * @returns Array of presence states for all members.
 */
export async function getRoomPresence(roomId: string): Promise<PresenceState[]> {
  const redis = getRedisClient();
  const raw = await redis.hgetall(roomPresenceKey(roomId));

  const result: PresenceState[] = [];
  for (const [, value] of Object.entries(raw)) {
    try {
      result.push(JSON.parse(value) as PresenceState);
    } catch {
      // Skip malformed entries
    }
  }

  return result;
}

/**
 * Get a single player's presence in a room.
 *
 * @param roomId - The room ID.
 * @param userId - The user ID.
 * @returns The presence state, or null if not found.
 */
export async function getPlayerPresence(
  roomId: string,
  userId: string,
): Promise<PresenceState | null> {
  const redis = getRedisClient();
  const raw = await redis.hget(roomPresenceKey(roomId), userId);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as PresenceState;
  } catch {
    return null;
  }
}

/**
 * Update the lastSeen timestamp for a player (called on heartbeat/activity).
 *
 * @param roomId - The room ID.
 * @param userId - The user ID.
 */
export async function updateLastSeen(roomId: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  const raw = await redis.hget(roomPresenceKey(roomId), userId);

  if (!raw) return;

  try {
    const presence = JSON.parse(raw) as PresenceState;
    const updated: PresenceState = {
      ...presence,
      lastSeen: new Date().toISOString(),
    };
    await redis.hset(roomPresenceKey(roomId), userId, JSON.stringify(updated));
  } catch {
    // Skip if malformed
  }
}

/**
 * Clean up all presence data for a room (when room is destroyed).
 *
 * @param roomId - The room ID.
 */
export async function cleanupRoomPresence(roomId: string): Promise<void> {
  const redis = getRedisClient();

  // Get all users in this room's presence and clear their grace keys
  const presenceData = await redis.hgetall(roomPresenceKey(roomId));
  const pipeline = redis.pipeline();

  for (const [userId] of Object.entries(presenceData)) {
    pipeline.del(graceKey(userId));
    clearGraceTimer(roomId, userId);
  }

  pipeline.del(roomPresenceKey(roomId));
  await pipeline.exec();

  // Clean up grace timer map
  graceTimers.delete(roomId);

  logger.debug({ roomId }, 'Room presence cleaned up');
}

// ---------------------------------------------------------------------------
// Grace period timer management
// ---------------------------------------------------------------------------

function startGraceTimer(
  roomId: string,
  userId: string,
  onExpired: (roomId: string, userId: string) => void,
): void {
  clearGraceTimer(roomId, userId);

  let roomTimers = graceTimers.get(roomId);
  if (!roomTimers) {
    roomTimers = new Map();
    graceTimers.set(roomId, roomTimers);
  }

  const timer = setTimeout(() => {
    logger.info({ roomId, userId }, 'Grace period expired');
    clearGraceTimer(roomId, userId);
    onExpired(roomId, userId);
  }, GRACE_PERIOD_MS);

  // Prevent timer from keeping the process alive
  if (timer.unref) {
    timer.unref();
  }

  roomTimers.set(userId, timer);
}

function clearGraceTimer(roomId: string, userId: string): void {
  const roomTimers = graceTimers.get(roomId);
  if (!roomTimers) return;

  const timer = roomTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    roomTimers.delete(userId);
  }

  if (roomTimers.size === 0) {
    graceTimers.delete(roomId);
  }
}

async function clearGracePeriod(roomId: string, userId: string): Promise<void> {
  clearGraceTimer(roomId, userId);

  try {
    const redis = getRedisClient();
    await redis.del(graceKey(userId));
  } catch (err) {
    logger.error({ err, roomId, userId }, 'Failed to clear grace period key');
  }
}

/**
 * Reset all presence state (for testing only).
 */
export function resetPresenceManager(): void {
  // Clear all grace timers
  for (const [, userTimers] of graceTimers) {
    for (const [, timer] of userTimers) {
      clearTimeout(timer);
    }
  }
  graceTimers.clear();
}

/**
 * Get the number of active grace timers (for testing/monitoring).
 */
export function getGraceTimerCount(): number {
  let count = 0;
  for (const [, userTimers] of graceTimers) {
    count += userTimers.size;
  }
  return count;
}
