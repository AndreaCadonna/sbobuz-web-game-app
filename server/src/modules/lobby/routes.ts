/**
 * Lobby module Express router.
 *
 * Mounts all lobby endpoints at /api/v1/lobby with authentication
 * and validation middleware.
 *
 * @see docs/specs/lobby-module.md Section 8 (REST Endpoints)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';

import { getConfig } from '../../shared/config/index.js';
import { createAuthMiddleware } from '../../shared/middleware/auth-middleware.js';
import { createRateLimiter } from '../../shared/middleware/rate-limiter.js';
import { validateBody, validateParams } from '../../shared/middleware/validation.js';

import {
  createRoom,
  listRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  setReady,
  startGame,
  addAIPlayer,
  removePlayer,
  updateSettings,
} from './handlers.js';
import {
  createRoomSchema,
  joinRoomSchema,
  setReadySchema,
  addAIPlayerSchema,
  updateSettingsSchema,
  roomIdParamsSchema,
  removePlayerParamsSchema,
} from './schemas.js';

/**
 * Async handler wrapper that catches promise rejections and forwards
 * them to the Express error handler.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Create the lobby router with all middleware applied.
 *
 * @returns Configured Express Router for lobby endpoints.
 */
export function createLobbyRouter(): Router {
  const router = Router();
  const config = getConfig();
  const authMiddleware = createAuthMiddleware(config.JWT_SECRET);

  // Rate limiter for room creation (prevent spam)
  const createRoomLimiter = createRateLimiter({
    defaultLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 5,
      keyBy: 'userId',
    },
    failClosed: config.RATE_LIMIT_FAIL_CLOSED,
  });

  // General lobby rate limiter
  const lobbyLimiter = createRateLimiter({
    defaultLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60,
      keyBy: 'userId',
    },
    failClosed: config.RATE_LIMIT_FAIL_CLOSED,
  });

  // POST /rooms — create room (auth required)
  router.post(
    '/rooms',
    authMiddleware,
    createRoomLimiter,
    validateBody(createRoomSchema),
    asyncHandler(createRoom),
  );

  // GET /rooms — list public rooms (no auth required)
  router.get(
    '/rooms',
    lobbyLimiter,
    asyncHandler(listRooms),
  );

  // GET /rooms/:roomId — get room details (no auth required)
  router.get(
    '/rooms/:roomId',
    lobbyLimiter,
    validateParams(roomIdParamsSchema),
    asyncHandler(getRoom),
  );

  // POST /rooms/join — join room (auth required)
  router.post(
    '/rooms/join',
    authMiddleware,
    lobbyLimiter,
    validateBody(joinRoomSchema),
    asyncHandler(joinRoom),
  );

  // POST /rooms/:roomId/leave — leave room (auth required)
  router.post(
    '/rooms/:roomId/leave',
    authMiddleware,
    lobbyLimiter,
    validateParams(roomIdParamsSchema),
    asyncHandler(leaveRoom),
  );

  // POST /rooms/:roomId/ready — toggle ready (auth required)
  router.post(
    '/rooms/:roomId/ready',
    authMiddleware,
    lobbyLimiter,
    validateParams(roomIdParamsSchema),
    validateBody(setReadySchema),
    asyncHandler(setReady),
  );

  // POST /rooms/:roomId/start — start game (auth required)
  router.post(
    '/rooms/:roomId/start',
    authMiddleware,
    lobbyLimiter,
    validateParams(roomIdParamsSchema),
    asyncHandler(startGame),
  );

  // POST /rooms/:roomId/ai — add AI player (auth required)
  router.post(
    '/rooms/:roomId/ai',
    authMiddleware,
    lobbyLimiter,
    validateParams(roomIdParamsSchema),
    validateBody(addAIPlayerSchema),
    asyncHandler(addAIPlayer),
  );

  // DELETE /rooms/:roomId/players/:userId — kick player (auth required)
  router.delete(
    '/rooms/:roomId/players/:userId',
    authMiddleware,
    lobbyLimiter,
    validateParams(removePlayerParamsSchema),
    asyncHandler(removePlayer),
  );

  // PATCH /rooms/:roomId/settings — update settings (auth required)
  router.patch(
    '/rooms/:roomId/settings',
    authMiddleware,
    lobbyLimiter,
    validateParams(roomIdParamsSchema),
    validateBody(updateSettingsSchema),
    asyncHandler(updateSettings),
  );

  return router;
}
