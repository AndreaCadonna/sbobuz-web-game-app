/**
 * Realtime Module — Socket.IO event wiring and lifecycle management.
 *
 * This is the entry point for the realtime module. It registers all event
 * handlers on Socket.IO connections and manages the connection lifecycle.
 *
 * @see docs/specs/realtime-module.md
 */

import type { TypedSocketIOServer } from '../../infra/websocket/setup.js';
import type { TypedSocket } from '../../infra/websocket/types.js';
import { removeSocketRateLimiter } from '../../infra/websocket/rate-limiter.js';
import { createModuleLogger } from '../../shared/logger.js';
import { runWithContext, generateTraceId, generateSpanId } from '../../shared/context.js';

import {
  registerConnection,
  startHeartbeatSweep,
  stopHeartbeatSweep,
  resetConnectionManager,
} from './connection-manager.js';
import { resetPresenceManager } from './presence-manager.js';
import { handleRoomJoin, handleRoomLeave } from './handlers/room-events.js';
import { handleGameAction } from './handlers/game-events.js';
import { handleHeartbeat, handleDisconnect } from './handlers/presence-events.js';

const logger = createModuleLogger('realtime');

/**
 * Initialize the realtime module by registering event handlers on the
 * Socket.IO server and starting background processes.
 *
 * @param io - The typed Socket.IO server instance.
 */
export function initializeRealtimeModule(io: TypedSocketIOServer): void {
  // Start the heartbeat sweep to detect dead connections
  startHeartbeatSweep(io);

  // Handle new connections
  io.on('connection', (socket: TypedSocket) => {
    const userId = socket.data.userId;
    const username = socket.data.username;
    const socketId = socket.id;

    // Run all socket event handling within a context
    const context = {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      userId,
      socketId,
    };

    runWithContext(context, () => {
      logger.info(
        { socketId, userId, username },
        'Client connected',
      );

      // Register the connection (enforces one-per-user)
      void registerConnection(socket, io).catch((err) => {
        logger.error({ err, socketId, userId }, 'Failed to register connection');
      });

      // --- Register event handlers ---

      // Room events
      socket.on('room:join', handleRoomJoin(socket, io));
      socket.on('room:leave', handleRoomLeave(socket, io));

      // Game events
      socket.on('game:action', handleGameAction(socket, io));

      // Presence events
      socket.on('presence:heartbeat', handleHeartbeat(socket));

      // Disconnect handler
      socket.on('disconnect', handleDisconnect(socket, io));
    });
  });

  // Handle inter-server events (for multi-instance coordination)
  io.on('user:force_disconnect' as never, ((payload: { userId: string; reason: string }) => {
    logger.info(
      { userId: payload.userId, reason: payload.reason },
      'Inter-server force disconnect request',
    );

    // Find and disconnect the socket for this user on this instance
    for (const [, connectedSocket] of io.sockets.sockets) {
      if ((connectedSocket as TypedSocket).data.userId === payload.userId) {
        (connectedSocket as TypedSocket).emit('error', {
          code: 'AUTH_FAILED',
          message: payload.reason,
        });
        connectedSocket.disconnect(true);
        break;
      }
    }
  }) as never);

  logger.info('Realtime module initialized');
}

/**
 * Gracefully shut down the realtime module.
 *
 * Emits server:draining to all connected clients, stops background
 * processes, and cleans up state.
 *
 * @param io - The Socket.IO server instance.
 */
export function shutdownRealtimeModule(io: TypedSocketIOServer): void {
  logger.info('Shutting down realtime module');

  // Notify all connected clients
  io.emit('server:draining', {
    reason: 'Server is shutting down for maintenance',
    reconnectAfterMs: 5000,
  });

  // Stop background processes
  stopHeartbeatSweep();

  logger.info('Realtime module shut down complete');
}

/**
 * Reset all realtime module state (for testing only).
 */
export function resetRealtimeModule(): void {
  resetConnectionManager();
  resetPresenceManager();
}

// Re-export key types and functions for external use
export { registerConnection, unregisterConnection, getConnectionByUserId, getConnectionBySocketId, getConnectionCount } from './connection-manager.js';
export { setOnline, setDisconnected, handleReconnection, getRoomPresence, getPlayerPresence, GRACE_PERIOD_MS } from './presence-manager.js';
export { buildRoomStatePayload } from './handlers/room-events.js';
export { setGameSessionProvider, resetGameSessionProvider } from './handlers/game-events.js';
