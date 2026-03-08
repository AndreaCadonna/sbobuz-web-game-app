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

  const body: ApiSuccessResponse<{ room: RoomState }> = {
    success: true,
    data: { room },
  };

  res.status(200).json(body);
}
