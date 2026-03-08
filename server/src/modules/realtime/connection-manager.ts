/**
 * Connection Manager — tracks active WebSocket connections.
 *
 * Enforces one-socket-per-user policy, maintains connection records in Redis,
 * and runs a periodic heartbeat sweep to detect dead connections.
 *
 * @see docs/specs/realtime-module.md Section 5.2 (One Socket Per User)
 * @see docs/specs/realtime-module.md Section 5.4 (Heartbeat and Timeout)
 * @see docs/specs/realtime-module.md Section 7 (Redis Key Schema)
 */

import { getRedisClient } from '../../infra/redis/index.js';
import type { TypedSocketIOServer } from '../../infra/websocket/setup.js';
import type { SocketConnection, SocketDeviceInfo, TypedSocket } from '../../infra/websocket/types.js';
import { removeSocketRateLimiter } from '../../infra/websocket/rate-limiter.js';
import { createModuleLogger } from '../../shared/logger.js';

const logger = createModuleLogger('realtime');

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

function socketUserKey(userId: string): string {
  return `ws:socket:${userId}`;
}

function connectionKey(socketId: string): string {
  return `ws:connection:${socketId}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Heartbeat sweep interval in ms (every 15 seconds). */
const HEARTBEAT_SWEEP_INTERVAL_MS = 15_000;

/** Maximum silence before a connection is considered dead (45 seconds = 3 missed heartbeats). */
const STALE_CONNECTION_THRESHOLD_MS = 45_000;

// ---------------------------------------------------------------------------
// In-memory connection tracking
// ---------------------------------------------------------------------------

/** userId -> SocketConnection */
const connections = new Map<string, SocketConnection>();

/** socketId -> userId (reverse lookup) */
const socketToUser = new Map<string, string>();

/** Heartbeat sweep timer. */
let sweepTimer: ReturnType<typeof setInterval> | undefined;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a new socket connection.
 *
 * Enforces one-socket-per-user: if the user already has an active socket,
 * the old socket is forcefully disconnected before the new one is registered.
 *
 * @param socket - The newly connected, authenticated socket.
 * @param io - The Socket.IO server instance (for finding old sockets).
 */
export async function registerConnection(
  socket: TypedSocket,
  io: TypedSocketIOServer,
): Promise<void> {
  const userId = socket.data.userId;
  const username = socket.data.username;
  const socketId = socket.id;

  // --- Enforce one-socket-per-user ---
  const existingConnection = connections.get(userId);

  if (existingConnection) {
    logger.info(
      { userId, oldSocketId: existingConnection.socketId, newSocketId: socketId },
      'Superseding existing connection',
    );

    // Notify and disconnect the old socket
    const oldSocket = io.sockets.sockets.get(existingConnection.socketId);
    if (oldSocket) {
      oldSocket.emit('error', {
        code: 'AUTH_FAILED',
        message: 'Connection superseded by new session',
      });
      oldSocket.disconnect(true);
    }

    // Clean up old connection data
    await removeConnectionFromRedis(existingConnection.socketId, userId);
    socketToUser.delete(existingConnection.socketId);
    removeSocketRateLimiter(existingConnection.socketId);
  }

  // Also check Redis for stale mappings from other instances
  const redis = getRedisClient();
  const existingSocketId = await redis.get(socketUserKey(userId));
  if (existingSocketId && existingSocketId !== socketId) {
    // Broadcast force disconnect to other instances
    io.serverSideEmit('user:force_disconnect', {
      userId,
      reason: 'Connection superseded by new session',
    });
    await removeConnectionFromRedis(existingSocketId, userId);
  }

  // --- Build connection record ---
  const now = new Date().toISOString();
  const deviceInfo: SocketDeviceInfo = {
    userAgent: (socket.handshake.headers['user-agent'] as string | undefined) ?? 'unknown',
    transport: socket.conn.transport.name === 'websocket' ? 'websocket' : 'polling',
    ip: socket.handshake.headers['x-forwarded-for'] as string ?? socket.handshake.address,
  };

  const connection: SocketConnection = {
    socketId,
    userId,
    username,
    roomId: null,
    connectedAt: now,
    lastPingAt: now,
    deviceInfo,
  };

  // --- Store in memory ---
  connections.set(userId, connection);
  socketToUser.set(socketId, userId);

  // --- Store in Redis ---
  const pipeline = redis.pipeline();
  pipeline.set(socketUserKey(userId), socketId);
  pipeline.set(
    connectionKey(socketId),
    JSON.stringify(connection),
  );
  await pipeline.exec();

  logger.info(
    { socketId, userId, transport: deviceInfo.transport },
    'Connection registered',
  );
}

/**
 * Unregister a socket connection on disconnect.
 *
 * @param socketId - The disconnecting socket's ID.
 * @returns The connection record that was removed, or undefined if not found.
 */
export async function unregisterConnection(socketId: string): Promise<SocketConnection | undefined> {
  const userId = socketToUser.get(socketId);
  if (!userId) {
    return undefined;
  }

  const connection = connections.get(userId);

  // Only remove if this socket is still the active one for the user
  // (avoids race condition with superseded connections)
  if (connection && connection.socketId === socketId) {
    connections.delete(userId);
    await removeConnectionFromRedis(socketId, userId);
  }

  socketToUser.delete(socketId);
  removeSocketRateLimiter(socketId);

  logger.info({ socketId, userId }, 'Connection unregistered');

  return connection;
}

/**
 * Update the lastPingAt timestamp for a connection (heartbeat).
 *
 * @param socketId - The socket that sent the heartbeat.
 */
export function updateHeartbeat(socketId: string): void {
  const userId = socketToUser.get(socketId);
  if (!userId) return;

  const connection = connections.get(userId);
  if (!connection || connection.socketId !== socketId) return;

  const now = new Date().toISOString();
  const updated: SocketConnection = { ...connection, lastPingAt: now };
  connections.set(userId, updated);
}

/**
 * Update the roomId for a connection (after joining/leaving a room).
 *
 * @param socketId - The socket ID.
 * @param roomId - The new room ID, or null if leaving.
 */
export function updateConnectionRoom(socketId: string, roomId: string | null): void {
  const userId = socketToUser.get(socketId);
  if (!userId) return;

  const connection = connections.get(userId);
  if (!connection || connection.socketId !== socketId) return;

  const updated: SocketConnection = { ...connection, roomId };
  connections.set(userId, updated);
}

/**
 * Get a connection by userId.
 */
export function getConnectionByUserId(userId: string): SocketConnection | undefined {
  return connections.get(userId);
}

/**
 * Get a connection by socketId.
 */
export function getConnectionBySocketId(socketId: string): SocketConnection | undefined {
  const userId = socketToUser.get(socketId);
  if (!userId) return undefined;
  return connections.get(userId);
}

/**
 * Get the userId for a socket ID.
 */
export function getUserIdBySocketId(socketId: string): string | undefined {
  return socketToUser.get(socketId);
}

/**
 * Get all active connections.
 */
export function getAllConnections(): ReadonlyMap<string, SocketConnection> {
  return connections;
}

/**
 * Get the total number of active connections.
 */
export function getConnectionCount(): number {
  return connections.size;
}

// ---------------------------------------------------------------------------
// Heartbeat Sweep
// ---------------------------------------------------------------------------

/**
 * Start the periodic heartbeat sweep.
 *
 * Checks all connections for staleness (no heartbeat or event for > 45 seconds).
 * Stale connections are forcefully disconnected, triggering the grace period flow.
 *
 * @param io - The Socket.IO server instance.
 */
export function startHeartbeatSweep(io: TypedSocketIOServer): void {
  if (sweepTimer) {
    return; // Already running
  }

  sweepTimer = setInterval(() => {
    const now = Date.now();
    const staleThreshold = now - STALE_CONNECTION_THRESHOLD_MS;

    for (const [userId, connection] of connections) {
      const lastPing = new Date(connection.lastPingAt).getTime();

      if (lastPing < staleThreshold) {
        logger.warn(
          {
            userId,
            socketId: connection.socketId,
            lastPingAt: connection.lastPingAt,
            silenceMs: now - lastPing,
          },
          'Stale connection detected, disconnecting',
        );

        const socket = io.sockets.sockets.get(connection.socketId);
        if (socket) {
          socket.disconnect(true);
        } else {
          // Socket already gone from Socket.IO, clean up our tracking
          void unregisterConnection(connection.socketId);
        }
      }
    }
  }, HEARTBEAT_SWEEP_INTERVAL_MS);

  logger.info(
    { intervalMs: HEARTBEAT_SWEEP_INTERVAL_MS, thresholdMs: STALE_CONNECTION_THRESHOLD_MS },
    'Heartbeat sweep started',
  );
}

/**
 * Stop the heartbeat sweep timer.
 */
export function stopHeartbeatSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = undefined;
    logger.info('Heartbeat sweep stopped');
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function removeConnectionFromRedis(socketId: string, userId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();
    pipeline.del(socketUserKey(userId));
    pipeline.del(connectionKey(socketId));
    await pipeline.exec();
  } catch (err) {
    logger.error({ err, socketId, userId }, 'Failed to clean up Redis connection keys');
  }
}

/**
 * Reset all connection state (for testing only).
 */
export function resetConnectionManager(): void {
  stopHeartbeatSweep();
  connections.clear();
  socketToUser.clear();
}

/**
 * Exported constants for testing.
 */
export const CONNECTION_CONSTANTS = {
  HEARTBEAT_SWEEP_INTERVAL_MS,
  STALE_CONNECTION_THRESHOLD_MS,
} as const;
