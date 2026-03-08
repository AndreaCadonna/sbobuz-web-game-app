/**
 * Game event handlers for Socket.IO.
 *
 * Handles game:action events by relaying validated actions to the Game Engine
 * and broadcasting state updates to room members.
 *
 * State updates are per-player sanitized: each player receives only the
 * information they are allowed to see (no hidden cards from other players).
 *
 * @see docs/specs/realtime-module.md Section 4.1 (game:action)
 * @see docs/specs/realtime-module.md Section 4.3 (Per-Player State Sanitization)
 */

import { z } from 'zod/v4';

import type { TypedSocketIOServer } from '../../../infra/websocket/setup.js';
import type {
  TypedSocket,
  GameActionPayload,
  GameActionResponse,
} from '../../../infra/websocket/types.js';
import { checkEventRateLimit } from '../../../infra/websocket/rate-limiter.js';
import { createModuleLogger } from '../../../shared/logger.js';
import { getConnectionBySocketId } from '../connection-manager.js';

const logger = createModuleLogger('realtime');

// ---------------------------------------------------------------------------
// Zod schema for game action payload validation
// ---------------------------------------------------------------------------

const gameActionPayloadSchema = z.object({
  gameId: z.uuid(),
  action: z.object({
    type: z.string().min(1),
    playerId: z.string().min(1).optional(),
  }).passthrough(), // Allow additional fields for different action types
});

// ---------------------------------------------------------------------------
// Game state store interface (to be provided by Game Session Manager in later steps)
// ---------------------------------------------------------------------------

/**
 * Interface for the game session manager.
 * This is a minimal interface used by the event handler; the full game session
 * manager will be implemented in a later step.
 */
export interface GameSessionProvider {
  /**
   * Get the active game ID for a room.
   */
  getGameIdForRoom(roomId: string): string | undefined;

  /**
   * Process a game action and return the result.
   */
  processAction(
    gameId: string,
    action: Record<string, unknown>,
  ): Promise<
    | { accepted: true; broadcastToRoom: (io: TypedSocketIOServer, roomId: string) => Promise<void> }
    | { accepted: false; reason: string; actionType: string }
  >;
}

/**
 * Default no-op game session provider (until Game Session Manager is implemented).
 */
const defaultProvider: GameSessionProvider = {
  getGameIdForRoom: () => undefined,
  processAction: async () => ({
    accepted: false,
    reason: 'Game session not available',
    actionType: 'unknown',
  }),
};

/** The current game session provider. Set via `setGameSessionProvider`. */
let gameSessionProvider: GameSessionProvider = defaultProvider;

/**
 * Set the game session provider.
 * Called by the game session manager during initialization.
 */
export function setGameSessionProvider(provider: GameSessionProvider): void {
  gameSessionProvider = provider;
}

/**
 * Reset the game session provider to the default no-op (for testing).
 */
export function resetGameSessionProvider(): void {
  gameSessionProvider = defaultProvider;
}

// ---------------------------------------------------------------------------
// Event Handler
// ---------------------------------------------------------------------------

/**
 * Handle game:action event.
 *
 * Validates the payload, verifies the player is in a room with an active game,
 * relays the action to the Game Engine, and broadcasts the resulting state
 * update to all room members (sanitized per player).
 */
export function handleGameAction(
  socket: TypedSocket,
  io: TypedSocketIOServer,
) {
  return async (
    payload: GameActionPayload,
    callback: (response: GameActionResponse) => void,
  ): Promise<void> => {
    const userId = socket.data.userId;
    const socketId = socket.id;

    // Rate limit check
    if (!checkEventRateLimit(socketId, userId, 'game:action')) {
      socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many game actions' });
      callback({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many game actions' } });
      return;
    }

    // Validate payload
    const parsed = gameActionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      callback({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'Invalid game action payload' },
      });
      return;
    }

    const { gameId, action } = parsed.data;

    try {
      // Verify the socket is in a room
      const connection = getConnectionBySocketId(socketId);
      if (!connection?.roomId) {
        socket.emit('error', { code: 'NOT_IN_ROOM', message: 'You must join a room before sending game actions' });
        callback({
          success: false,
          error: { code: 'NOT_IN_ROOM', message: 'You must join a room before sending game actions' },
        });
        return;
      }

      const roomId = connection.roomId;

      // Verify the gameId matches the active game in the room
      const activeGameId = gameSessionProvider.getGameIdForRoom(roomId);
      if (!activeGameId) {
        callback({
          success: false,
          error: { code: 'GAME_NOT_FOUND', message: 'No active game in this room' },
        });
        return;
      }

      if (activeGameId !== gameId) {
        socket.emit('error', {
          code: 'GAME_NOT_FOUND',
          message: 'Game ID does not match active game in your room',
        });
        callback({
          success: false,
          error: { code: 'GAME_NOT_FOUND', message: 'Game ID does not match active game in your room' },
        });
        return;
      }

      // Relay action to Game Engine via the session provider
      const result = await gameSessionProvider.processAction(gameId, action as Record<string, unknown>);

      if (result.accepted) {
        callback({ success: true });

        // Broadcast state updates to room (per-player sanitized)
        await result.broadcastToRoom(io, roomId);

        logger.debug(
          { gameId, userId, actionType: (action as Record<string, unknown>)['type'] },
          'Game action accepted',
        );
      } else {
        // Action rejected — notify the sender only
        socket.emit('game:action_rejected', {
          reason: result.reason,
          actionType: result.actionType,
          gameId,
        });
        callback({
          success: false,
          error: { code: 'INVALID_ACTION', message: result.reason },
        });

        logger.debug(
          { gameId, userId, actionType: result.actionType, reason: result.reason },
          'Game action rejected',
        );
      }
    } catch (err) {
      logger.error({ err, userId, gameId }, 'Error handling game:action');
      callback({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to process game action' },
      });
    }
  };
}
