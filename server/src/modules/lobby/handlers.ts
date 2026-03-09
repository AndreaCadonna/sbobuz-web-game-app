/**
 * Lobby module request handlers.
 *
 * Each handler extracts validated input, calls the room service,
 * and returns a typed API response. All errors are thrown as AppError
 * subclasses and caught by the global error handler.
 *
 * @see docs/specs/lobby-module.md Section 7 (Processing Logic)
 */

import type { Request, Response } from 'express';

import type { ApiSuccessResponse, RoomSettings, RoomState } from '@sbobuz/shared';

import { AuthenticationError } from '../../shared/errors/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import type { RoomListItem } from './lobby.types.js';
import type {
  CreateRoomInput,
  JoinRoomInput,
  SetReadyInput,
  AddAIPlayerInput,
} from './schemas.js';
import * as roomService from './room-service.js';

const logger = createModuleLogger('lobby');

/**
 * Broadcast room state update to all players in the room via Socket.IO.
 * Best-effort — failures are logged but do not affect the HTTP response.
 */
async function broadcastRoomState(roomId: string): Promise<void> {
  try {
    const { getSocketIOServer } = await import('../../infra/websocket/setup.js');
    const { buildRoomStatePayload } = await import('../realtime/handlers/room-events.js');
    const { getRoom: getRoomFromRepo } = await import('./room-repository.js');

    const io = getSocketIOServer();
    const fullRoom = await getRoomFromRepo(roomId);
    if (fullRoom) {
      const roomState = buildRoomStatePayload(fullRoom);
      io.to(roomId).emit('room:state_update', roomState);
    }
  } catch (err) {
    logger.warn({ err, roomId }, 'Failed to broadcast room state update');
  }
}

/**
 * Extract authenticated user from request. Throws if not authenticated.
 */
function requireAuth(req: Request): { userId: string; username: string; displayName: string } {
  if (!req.userId || !req.username) {
    throw new AuthenticationError('Authentication required', {
      errorCode: 'AUTH_REQUIRED',
    });
  }
  return {
    userId: req.userId,
    username: req.username,
    // displayName falls back to username if not available on request
    displayName: req.username,
  };
}

// --- POST /api/v1/lobby/rooms ---

export async function createRoom(req: Request, res: Response): Promise<void> {
  const user = requireAuth(req);
  const input = req.body as CreateRoomInput;

  const result = await roomService.createRoom({
    hostId: user.userId,
    hostUsername: user.username,
    hostDisplayName: user.displayName,
    name: input.name,
    settings: input.settings as Partial<RoomSettings> | undefined,
    isPrivate: input.isPrivate,
  });

  logger.info({ roomId: result.room.roomId, userId: user.userId }, 'Room created via API');

  const body: ApiSuccessResponse<{ room: RoomState; inviteCode: string }> = {
    success: true,
    data: result,
  };

  res.status(201).json(body);
}

// --- GET /api/v1/lobby/rooms ---

export async function listRooms(_req: Request, res: Response): Promise<void> {
  const rooms = await roomService.listRooms();

  const body: ApiSuccessResponse<{ rooms: RoomListItem[] }> = {
    success: true,
    data: { rooms },
  };

  res.status(200).json(body);
}

// --- GET /api/v1/lobby/rooms/:roomId ---

export async function getRoom(req: Request, res: Response): Promise<void> {
  const { roomId } = req.params as { roomId: string };

  const room = await roomService.getRoomDetails(roomId);

  const body: ApiSuccessResponse<{ room: RoomState }> = {
    success: true,
    data: { room },
  };

  res.status(200).json(body);
}

// --- POST /api/v1/lobby/rooms/join ---

export async function joinRoom(req: Request, res: Response): Promise<void> {
  const user = requireAuth(req);
  const input = req.body as JoinRoomInput;

  const room = await roomService.joinRoom(
    user.userId,
    user.username,
    user.displayName,
    input.roomId,
    input.inviteCode,
  );

  logger.info({ roomId: room.roomId, userId: user.userId }, 'Player joined room via API');

  await broadcastRoomState(room.roomId);

  const body: ApiSuccessResponse<{ room: RoomState }> = {
    success: true,
    data: { room },
  };

  res.status(200).json(body);
}

// --- POST /api/v1/lobby/rooms/:roomId/leave ---

export async function leaveRoom(req: Request, res: Response): Promise<void> {
  const user = requireAuth(req);
  const { roomId } = req.params as { roomId: string };

  const result = await roomService.leaveRoom(user.userId, roomId);

  logger.info({ roomId, userId: user.userId }, 'Player left room via API');

  if (result.room) {
    await broadcastRoomState(roomId);
  }

  const body: ApiSuccessResponse<{
    room: RoomState | null;
    hostTransferred: boolean;
    newHostId?: string | undefined;
  }> = {
    success: true,
    data: {
      room: result.room ?? null,
      hostTransferred: result.hostTransferred,
      newHostId: result.newHostId,
    },
  };

  res.status(200).json(body);
}

// --- POST /api/v1/lobby/rooms/:roomId/ready ---

export async function setReady(req: Request, res: Response): Promise<void> {
  const user = requireAuth(req);
  const { roomId } = req.params as { roomId: string };
  const input = req.body as SetReadyInput;

  const room = await roomService.setReady(user.userId, roomId, input.isReady);

  await broadcastRoomState(roomId);

  const body: ApiSuccessResponse<{ room: RoomState }> = {
    success: true,
    data: { room },
  };

  res.status(200).json(body);
}

// --- POST /api/v1/lobby/rooms/:roomId/start ---

export async function startGame(req: Request, res: Response): Promise<void> {
  const user = requireAuth(req);
  const { roomId } = req.params as { roomId: string };

  const result = await roomService.startGame(user.userId, roomId);

  // Create the actual game session and broadcast to players
  try {
    const { createGameSession, broadcastGameStarted } = await import(
      '../game-engine/session-manager.js'
    );
    const { getSocketIOServer } = await import(
      '../../infra/websocket/setup.js'
    );

    const gameConfig = {
      turnTimerSeconds: result.room.settings.turnTimerSeconds,
      disconnectGraceSeconds: result.room.settings.disconnectGraceSeconds,
      maxPlayers: 5 as const,
      minPlayers: 2 as const,
    };

    const playerIds = result.room.players.map((p: { userId: string }) => p.userId);

    await createGameSession(roomId, playerIds, gameConfig, undefined, result.gameId);

    const io = getSocketIOServer();
    await broadcastGameStarted(io, result.gameId, roomId);

    // Broadcast room state update (status = IN_GAME) to all players
    await broadcastRoomState(roomId);

    // Notify AI controller about game start so AI players can make moves
    try {
      const { onGameStarted } = await import('../ai/controller.js');
      const { mapLobbyDifficulty } = await import('../ai/ai-player.js');
      const { getGameState } = await import('../game-engine/session-manager.js');

      const aiDifficulties = new Map<string, import('../ai/ai.types.js').AIDifficulty>();
      for (const p of result.room.players) {
        if (p.isAI && p.aiDifficulty) {
          aiDifficulties.set(p.userId, mapLobbyDifficulty(p.aiDifficulty));
        }
      }

      const initialState = getGameState(result.gameId);
      if (initialState && aiDifficulties.size > 0) {
        onGameStarted(result.gameId, playerIds, aiDifficulties, initialState);
        logger.info({ roomId, gameId: result.gameId, aiCount: aiDifficulties.size }, 'AI controller notified of game start');
      }
    } catch (aiErr) {
      logger.warn({ err: aiErr, roomId, gameId: result.gameId }, 'Failed to notify AI controller');
    }

    logger.info({ roomId, gameId: result.gameId }, 'Game session created and broadcast');
  } catch (err) {
    logger.error({ err, roomId, gameId: result.gameId }, 'Failed to create game session');
  }

  logger.info({ roomId, gameId: result.gameId }, 'Game started via API');

  const body: ApiSuccessResponse<{ gameId: string; room: RoomState }> = {
    success: true,
    data: result,
  };

  res.status(200).json(body);
}

// --- POST /api/v1/lobby/rooms/:roomId/ai ---

export async function addAIPlayer(req: Request, res: Response): Promise<void> {
  const user = requireAuth(req);
  const { roomId } = req.params as { roomId: string };
  const input = req.body as AddAIPlayerInput;

  const room = await roomService.addAIPlayer(user.userId, roomId, input.difficulty);

  logger.info({ roomId, userId: user.userId, difficulty: input.difficulty }, 'AI player added via API');

  await broadcastRoomState(roomId);

  const body: ApiSuccessResponse<{ room: RoomState }> = {
    success: true,
    data: { room },
  };

  res.status(201).json(body);
}

// --- DELETE /api/v1/lobby/rooms/:roomId/players/:userId ---

export async function removePlayer(req: Request, res: Response): Promise<void> {
  const user = requireAuth(req);
  const { roomId, userId: targetUserId } = req.params as { roomId: string; userId: string };

  const room = await roomService.removePlayer(user.userId, roomId, targetUserId);

  logger.info({ roomId, targetUserId, kickedBy: user.userId }, 'Player removed via API');

  await broadcastRoomState(roomId);

  const body: ApiSuccessResponse<{ room: RoomState }> = {
    success: true,
    data: { room },
  };

  res.status(200).json(body);
}

// --- PATCH /api/v1/lobby/rooms/:roomId/settings ---

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const user = requireAuth(req);
  const { roomId } = req.params as { roomId: string };
  const input = req.body as Partial<RoomSettings>;
  const room = await roomService.updateSettings(user.userId, roomId, input);

  logger.info({ roomId, userId: user.userId }, 'Settings updated via API');

  await broadcastRoomState(roomId);

  const body: ApiSuccessResponse<{ room: RoomState }> = {
    success: true,
    data: { room },
  };

  res.status(200).json(body);
}
