/**
 * Leaderboard REST API routes.
 *
 * Exposes leaderboard data through authenticated endpoints:
 * - GET  /api/v1/leaderboard       — top players
 * - GET  /api/v1/leaderboard/me    — current user's rank
 * - GET  /api/v1/leaderboard/nearby — players near current user's rank
 * - GET  /api/v1/leaderboard/history — current user's match history
 */

import { Router, type Request, type Response, type NextFunction } from 'express';

import { getConfig } from '../../shared/config/index.js';
import { createAuthMiddleware } from '../../shared/middleware/auth-middleware.js';
import { createModuleLogger } from '../../shared/logger.js';

import {
  getLeaderboard,
  getPlayerLeaderboardEntry,
  getNearbyLeaderboard,
  getPlayerMatchHistory,
} from './leaderboard-service.js';

const logger = createModuleLogger('leaderboard');

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
 * Create the leaderboard router.
 *
 * @returns The Express router for leaderboard endpoints.
 */
export function createLeaderboardRouter(): Router {
  const router = Router();
  const config = getConfig();
  const authMiddleware = createAuthMiddleware(config.JWT_SECRET);

  // All leaderboard routes require authentication
  router.use(authMiddleware);

  // GET /api/v1/leaderboard — top players
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const limit = Math.min(parseInt(req.query['limit'] as string, 10) || 50, 100);
      const offset = Math.max(parseInt(req.query['offset'] as string, 10) || 0, 0);

      const entries = await getLeaderboard(limit, offset);

      res.json({
        success: true,
        data: {
          entries,
          limit,
          offset,
        },
      });
    }),
  );

  // GET /api/v1/leaderboard/me — current user's rank
  router.get(
    '/me',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = req.userId!;

      const entry = await getPlayerLeaderboardEntry(userId);

      if (!entry) {
        res.json({
          success: true,
          data: {
            entry: null,
            message: 'No rated games played yet',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: { entry },
      });
    }),
  );

  // GET /api/v1/leaderboard/nearby — players near current user
  router.get(
    '/nearby',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = req.userId!;
      const range = Math.min(parseInt(req.query['range'] as string, 10) || 5, 20);

      const entries = await getNearbyLeaderboard(userId, range);

      res.json({
        success: true,
        data: { entries },
      });
    }),
  );

  // GET /api/v1/leaderboard/history — current user's match history
  router.get(
    '/history',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = req.userId!;
      const limit = Math.min(parseInt(req.query['limit'] as string, 10) || 20, 50);

      const history = await getPlayerMatchHistory(userId, limit);

      res.json({
        success: true,
        data: { history },
      });
    }),
  );

  return router;
}
