/**
 * Presence event handlers for Socket.IO.
 *
 * Handles presence:heartbeat events and socket disconnect events.
 * Manages the transition from connected to disconnected state and the
 * 30-second grace period flow.
 *
 * @see docs/specs/realtime-module.md Section 5.4 (Heartbeat and Timeout)
 * @see docs/specs/realtime-module.md Section 5.5 (Disconnect and Grace Period)
 */

import type { TypedSocketIOServer } from '../../../infra/websocket/setup.js';
import type { TypedSocket } from '../../../infra/websocket/types.js';
import { checkEventRateLimit } from '../../../infra/websocket/rate-limiter.js';
import { createModuleLogger } from '../../../shared/logger.js';
import {
  updateHeartbeat,
  unregisterConnection,
  getConnectionBySocketId,
} from '../connection-manager.js';
import {
  setDisconnected,
  removePresence,
  updateLastSeen,
  getRoomPresence,
  GRACE_PERIOD_MS,
} from '../presence-manager.js';
import { getRoom } from '../../lobby/room-repository.js';
import { buildRoomStatePayload } from './room-events.js';

const logger = createModuleLogger('realtime');

// ---------------------------------------------------------------------------
// Heartbeat Handler
// ---------------------------------------------------------------------------

/**
 * Handle presence:heartbeat event.
 *
 * Updates the lastPingAt on the connection record and lastSeen on presence.
 * Must be sent by the client every 15 seconds.
 */
export function handleHeartbeat(socket: TypedSocket) {
  return (): void => {
    const userId = socket.data.userId;
    const socketId = socket.id;

    // Rate limit check (2 per second max)
    if (!checkEventRateLimit(socketId, userId, 'presence:heartbeat')) {
      // Silently drop — no error emission for heartbeat spam
      return;
    }

    // Update connection record
    updateHeartbeat(socketId);

    // Update presence lastSeen if in a room
    const connection = getConnectionBySocketId(socketId);
    if (connection?.roomId) {
      // Fire and forget — don't await for a heartbeat
      void updateLastSeen(connection.roomId, userId);
    }
  };
}

// ---------------------------------------------------------------------------
// Disconnect Handler
// ---------------------------------------------------------------------------

/**
 * Handle socket disconnect event.
 *
 * When a socket disconnects:
 * 1. If the socket was in a room, start the 30-second grace period.
 * 2. Notify room members of the disconnection.
 * 3. If the grace period expires, remove the player from the room and
 *    potentially cancel the game.
 * 4. Clean up connection tracking.
 */
export function handleDisconnect(
  socket: TypedSocket,
  io: TypedSocketIOServer,
) {
  return async (reason: string): Promise<void> => {
    const userId = socket.data.userId;
    const socketId = socket.id;

    logger.info(
      { socketId, userId, reason },
      'Socket disconnected',
    );

    // Get the connection before unregistering (so we know which room)
    const connection = getConnectionBySocketId(socketId);
    const roomId = connection?.roomId;

    // Unregister the connection
    await unregisterConnection(socketId);

    // If the socket was in a room, start grace period
    if (roomId) {
      await setDisconnected(roomId, userId, (expiredRoomId, expiredUserId) => {
        void handleGracePeriodExpired(expiredRoomId, expiredUserId, io);
      });

      // Notify room members
      socket.to(roomId).emit('presence:player_disconnected', {
        userId,
        gracePeriodMs: GRACE_PERIOD_MS,
      });

      // Update room state to reflect disconnected status
      const room = await getRoom(roomId);
      if (room) {
        const presence = await getRoomPresence(roomId);
        const connectedIds = new Set(
          presence.filter((p) => p.status === 'ONLINE').map((p) => p.userId),
        );
        const roomState = buildRoomStatePayload(room, connectedIds);
        io.to(roomId).emit('room:state_update', roomState);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Grace Period Expiration
// ---------------------------------------------------------------------------

/**
 * Handle grace period expiration for a disconnected player.
 *
 * Called when the 30-second grace period timer fires without the player
 * reconnecting. Removes their presence, notifies the room, and signals
 * the Game Engine to handle the absent player.
 */
async function handleGracePeriodExpired(
  roomId: string,
  userId: string,
  io: TypedSocketIOServer,
): Promise<void> {
  logger.info({ roomId, userId }, 'Grace period expired, removing player');

  // Remove presence from the room
  await removePresence(roomId, userId);

  // Remove the player from the room's player list AND clear room membership
  // so the user can join/create rooms again.
  try {
    const { leaveRoom } = await import('../../lobby/room-service.js');
    await leaveRoom(userId, roomId);
  } catch (err) {
    // If leaveRoom fails (e.g. room already deleted), fall back to just
    // clearing the user's current-room pointer.
    logger.warn({ err, roomId, userId }, 'Failed to remove player from room on grace period expiry, clearing room pointer');
    try {
      const { clearUserCurrentRoom } = await import('../../lobby/room-repository.js');
      await clearUserCurrentRoom(userId);
    } catch {
      logger.warn({ roomId, userId }, 'Failed to clear room membership on grace period expiry');
    }
  }

  // Notify remaining room members
  io.to(roomId).emit('presence:player_left', {
    userId,
    reason: 'disconnect_timeout',
  });

  // Update room state for remaining members
  const room = await getRoom(roomId);
  if (room) {
    const presence = await getRoomPresence(roomId);
    const connectedIds = new Set(
      presence.filter((p) => p.status === 'ONLINE').map((p) => p.userId),
    );
    const roomState = buildRoomStatePayload(room, connectedIds);
    io.to(roomId).emit('room:state_update', roomState);
  }

  // Cancel the game if one is active in this room
  try {
    const { handlePlayerDisconnectTimeout, getGameIdForRoom, getSanitizedState } = await import(
      '../../game-engine/session-manager.js'
    );
    const gameId = getGameIdForRoom(roomId);
    if (gameId) {
      const result = handlePlayerDisconnectTimeout(roomId, userId);
      if (result?.accepted) {
        // Broadcast game:ended to the room
        const { sanitizeStateForPlayer } = await import('../../game-engine/index.js');
        const finalState = getSanitizedState(gameId, userId);
        if (finalState) {
          io.to(roomId).emit('game:ended', {
            gameId,
            result: {
              winnerId: '',
              reason: 'cancelled',
              finalState,
            },
          });
        }
        logger.info({ roomId, userId, gameId }, 'Game cancelled due to disconnect timeout');
      }
    }
  } catch (err) {
    logger.warn({ err, roomId, userId }, 'Failed to cancel game on disconnect timeout');
  }
}
