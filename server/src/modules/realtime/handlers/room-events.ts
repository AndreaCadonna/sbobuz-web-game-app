/**
 * Room event handlers for Socket.IO.
 *
 * Handles room:join and room:leave events. Verifies room membership via
 * the Lobby module and manages Socket.IO room subscriptions.
 *
 * @see docs/specs/realtime-module.md Section 4.1 (Client -> Server Events)
 * @see docs/specs/realtime-module.md Section 5.3 (Room Membership)
 */

import { z } from 'zod/v4';

import type { TypedSocketIOServer } from '../../../infra/websocket/setup.js';
import type {
  TypedSocket,
  RoomJoinPayload,
  RoomJoinResponse,
  RoomLeavePayload,
  AckResponse,
  RoomStateUpdatePayload,
} from '../../../infra/websocket/types.js';
import { checkEventRateLimit, getSocketRateLimiter } from '../../../infra/websocket/rate-limiter.js';
import { createModuleLogger } from '../../../shared/logger.js';
import { updateConnectionRoom, getConnectionBySocketId } from '../connection-manager.js';
import { setOnline, removePresence, handleReconnection, getRoomPresence, isInGracePeriod } from '../presence-manager.js';
import { getRoom } from '../../lobby/room-repository.js';
import type { Room } from '../../lobby/lobby.types.js';

const logger = createModuleLogger('realtime');

// ---------------------------------------------------------------------------
// Zod schemas for event payload validation
// ---------------------------------------------------------------------------

const roomJoinSchema = z.object({
  roomId: z.uuid(),
});

const roomLeaveSchema = z.object({
  roomId: z.uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a RoomStateUpdatePayload from a Room and presence data.
 */
export function buildRoomStatePayload(
  room: Room,
  connectedUserIds?: ReadonlySet<string> | undefined,
): RoomStateUpdatePayload {
  return {
    roomId: room.roomId,
    players: room.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      isReady: p.isReady,
      isConnected: p.isAI ? true : (connectedUserIds?.has(p.userId) ?? p.connectionStatus === 'connected'),
      isHost: p.userId === room.hostId,
      isAI: p.isAI,
      ...(p.aiDifficulty ? { aiDifficulty: p.aiDifficulty } : {}),
    })),
    hostUserId: room.hostId,
    status: room.status,
  };
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

/**
 * Handle room:join event.
 *
 * Validates the payload, checks that the user is a member of the room
 * (via Lobby module), joins the Socket.IO room, sets presence to ONLINE,
 * and notifies other room members.
 */
export function handleRoomJoin(
  socket: TypedSocket,
  io: TypedSocketIOServer,
) {
  return async (
    payload: RoomJoinPayload,
    callback: (response: RoomJoinResponse) => void,
  ): Promise<void> => {
    const userId = socket.data.userId;
    const username = socket.data.username;
    const socketId = socket.id;

    // Rate limit check
    if (!checkEventRateLimit(socketId, userId, 'room:join')) {
      socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many join requests' });
      callback({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many join requests' } });
      return;
    }

    // Validate payload
    const parsed = roomJoinSchema.safeParse(payload);
    if (!parsed.success) {
      callback({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'Invalid room join payload' },
      });
      return;
    }

    const { roomId } = parsed.data;

    try {
      // Check if this is a reconnection within grace period
      const inGrace = await isInGracePeriod(roomId, userId);

      // Fetch room from repository to verify membership
      const room = await getRoom(roomId);
      if (!room) {
        callback({
          success: false,
          error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' },
        });
        return;
      }

      // Verify user is a member of this room
      const isMember = room.players.some((p) => p.userId === userId);
      if (!isMember) {
        callback({
          success: false,
          error: { code: 'ROOM_NOT_FOUND', message: 'You are not a member of this room' },
        });
        return;
      }

      // If already in a different room, leave it first
      const currentConnection = getConnectionBySocketId(socketId);
      if (currentConnection?.roomId && currentConnection.roomId !== roomId) {
        socket.leave(currentConnection.roomId);
        await removePresence(currentConnection.roomId, userId);

        // Notify old room
        socket.to(currentConnection.roomId).emit('presence:player_left', {
          userId,
          reason: 'voluntary',
        });
      }

      // Join the Socket.IO room
      await socket.join(roomId);
      updateConnectionRoom(socketId, roomId);

      // Handle reconnection within grace period
      if (inGrace) {
        const reconnected = await handleReconnection(roomId, userId);
        if (reconnected) {
          // Notify room of reconnection
          socket.to(roomId).emit('presence:player_reconnected', { userId });

          // Build room state for full sync
          const presence = await getRoomPresence(roomId);
          const connectedIds = new Set(
            presence.filter((p) => p.status === 'ONLINE').map((p) => p.userId),
          );
          const roomState = buildRoomStatePayload(room, connectedIds);

          // Send full state sync to reconnecting player
          socket.emit('state:full_sync', {
            roomState,
            gameState: null, // Game session manager will handle this in Phase 5
            presence,
          });

          callback({ success: true, roomState });

          logger.info({ roomId, userId }, 'Player reconnected to room');
          return;
        }
      }

      // Normal join: set presence to ONLINE
      await setOnline(roomId, userId);

      // Build room state
      const presence = await getRoomPresence(roomId);
      const connectedIds = new Set(
        presence.filter((p) => p.status === 'ONLINE').map((p) => p.userId),
      );
      const roomState = buildRoomStatePayload(room, connectedIds);

      // Notify other room members
      socket.to(roomId).emit('presence:player_joined', { userId, username });

      // Send room state update to all members
      io.to(roomId).emit('room:state_update', roomState);

      // Respond to the joining player
      callback({ success: true, roomState });

      logger.info({ roomId, userId }, 'Player joined room via WebSocket');
    } catch (err) {
      logger.error({ err, roomId, userId }, 'Error handling room:join');
      callback({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to join room' },
      });
    }
  };
}

/**
 * Handle room:leave event.
 *
 * Removes the socket from the Socket.IO room, clears presence,
 * and notifies other room members.
 */
export function handleRoomLeave(
  socket: TypedSocket,
  io: TypedSocketIOServer,
) {
  return async (
    payload: RoomLeavePayload,
    callback: (response: AckResponse) => void,
  ): Promise<void> => {
    const userId = socket.data.userId;
    const socketId = socket.id;

    // Rate limit check
    if (!checkEventRateLimit(socketId, userId, 'room:leave')) {
      socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many leave requests' });
      callback({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many leave requests' } });
      return;
    }

    // Validate payload
    const parsed = roomLeaveSchema.safeParse(payload);
    if (!parsed.success) {
      callback({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'Invalid room leave payload' },
      });
      return;
    }

    const { roomId } = parsed.data;

    try {
      // Verify the socket is in this room
      const connection = getConnectionBySocketId(socketId);
      if (!connection || connection.roomId !== roomId) {
        callback({
          success: false,
          error: { code: 'NOT_IN_ROOM', message: 'You are not in this room' },
        });
        return;
      }

      // Leave the Socket.IO room
      socket.leave(roomId);
      updateConnectionRoom(socketId, null);

      // Remove presence
      await removePresence(roomId, userId);

      // Notify other room members
      socket.to(roomId).emit('presence:player_left', {
        userId,
        reason: 'voluntary',
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

      callback({ success: true });

      logger.info({ roomId, userId }, 'Player left room via WebSocket');
    } catch (err) {
      logger.error({ err, roomId: payload.roomId, userId }, 'Error handling room:leave');
      callback({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to leave room' },
      });
    }
  };
}
