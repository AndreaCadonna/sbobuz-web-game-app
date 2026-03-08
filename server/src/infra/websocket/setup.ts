/**
 * Socket.IO server setup with Redis adapter.
 *
 * Creates and configures the Socket.IO server, attaches it to the HTTP server,
 * and wires the Redis adapter for multi-instance broadcasting.
 *
 * @see docs/specs/realtime-module.md Section 6 (Scaling Architecture)
 */

import type { Server as HttpServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Server as SocketIOServer } from 'socket.io';

import { getRedisClient, getRedisSubscriber } from '../../infra/redis/index.js';
import type { ServerConfig } from '../../shared/config/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import { socketAuthMiddleware } from './auth-middleware.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from './types.js';

const logger = createModuleLogger('realtime');

/**
 * The typed Socket.IO server type.
 */
export type TypedSocketIOServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Singleton Socket.IO server instance. */
let ioInstance: TypedSocketIOServer | undefined;

/**
 * Create and configure the Socket.IO server.
 *
 * - Attaches to the existing HTTP server (no separate port).
 * - Configures CORS from the server config.
 * - Wires the Redis adapter for multi-instance pub/sub.
 * - Registers the JWT authentication middleware.
 * - Sets payload size limits.
 *
 * @param httpServer - The Node.js HTTP server to attach to.
 * @param config - Validated server configuration.
 * @returns The configured Socket.IO server instance.
 */
export function createSocketIOServer(
  httpServer: HttpServer,
  config: ServerConfig,
): TypedSocketIOServer {
  if (ioInstance) {
    throw new Error('Socket.IO server already exists. Call closeSocketIOServer() first.');
  }

  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: config.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
      credentials: true,
    },
    pingInterval: config.WS_PING_INTERVAL_MS,
    pingTimeout: config.WS_PING_TIMEOUT_MS,
    maxHttpBufferSize: config.WS_MAX_PAYLOAD_BYTES,
    transports: ['websocket', 'polling'],
    connectionStateRecovery: {
      maxDisconnectionDuration: 0, // We handle reconnection ourselves
    },
  });

  // Attach Redis adapter for multi-instance broadcasting
  try {
    const pubClient = getRedisClient();
    const subClient = getRedisSubscriber();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter attached');
  } catch (err) {
    logger.warn(
      { err },
      'Failed to attach Redis adapter — running in single-instance mode',
    );
  }

  // Register JWT authentication middleware
  io.use(socketAuthMiddleware);

  ioInstance = io;

  logger.info(
    {
      pingInterval: config.WS_PING_INTERVAL_MS,
      pingTimeout: config.WS_PING_TIMEOUT_MS,
      maxPayload: config.WS_MAX_PAYLOAD_BYTES,
    },
    'Socket.IO server created',
  );

  return io;
}

/**
 * Get the Socket.IO server singleton.
 *
 * @returns The Socket.IO server instance.
 * @throws Error if the server has not been created.
 */
export function getSocketIOServer(): TypedSocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO server not initialized. Call createSocketIOServer() first.');
  }
  return ioInstance;
}

/**
 * Close the Socket.IO server gracefully.
 *
 * Disconnects all clients and releases resources.
 */
export async function closeSocketIOServer(): Promise<void> {
  if (!ioInstance) {
    return;
  }

  logger.info('Closing Socket.IO server...');

  await new Promise<void>((resolve) => {
    ioInstance!.close(() => {
      logger.info('Socket.IO server closed');
      resolve();
    });
  });

  ioInstance = undefined;
}

/**
 * Reset the Socket.IO server singleton (for testing only).
 */
export function resetSocketIOServer(): void {
  ioInstance = undefined;
}
