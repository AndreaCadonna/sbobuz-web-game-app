/**
 * Auth module Express router.
 *
 * Mounts all auth endpoints at /api/v1/auth with appropriate middleware:
 * validation, rate limiting, and JWT authentication.
 *
 * @see docs/specs/auth-module.md Section 3 (API Endpoints)
 * @see docs/specs/api-gateway.md Section 5.1 (Rate Limiting)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';

import { getConfig } from '../../shared/config/index.js';
import { createAuthMiddleware } from '../../shared/middleware/auth-middleware.js';
import { createRateLimiter } from '../../shared/middleware/rate-limiter.js';
import { validateBody } from '../../shared/middleware/validation.js';

import { register, login, guestLogin, refresh, logout, me } from './handlers.js';
import { registerSchema, loginSchema, guestLoginSchema } from './schemas.js';

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
 * Create the auth router with all middleware applied.
 *
 * @returns Configured Express Router for auth endpoints.
 */
export function createAuthRouter(): Router {
  const router = Router();
  const config = getConfig();
  const authMiddleware = createAuthMiddleware(config.JWT_SECRET);

  // Rate limiters for auth endpoints (stricter limits)
  const registerLimiter = createRateLimiter({
    defaultLimit: {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 50,
      keyBy: 'ip',
    },
    failClosed: config.RATE_LIMIT_FAIL_CLOSED,
  });

  const loginLimiter = createRateLimiter({
    defaultLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10,
      keyBy: 'ip',
    },
    failClosed: config.RATE_LIMIT_FAIL_CLOSED,
  });

  const refreshLimiter = createRateLimiter({
    defaultLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10,
      keyBy: 'ip',
    },
    failClosed: config.RATE_LIMIT_FAIL_CLOSED,
  });

  // POST /api/v1/auth/register
  router.post(
    '/register',
    registerLimiter,
    validateBody(registerSchema),
    asyncHandler(register),
  );

  // POST /api/v1/auth/login
  router.post(
    '/login',
    loginLimiter,
    validateBody(loginSchema),
    asyncHandler(login),
  );

  // Guest login rate limiter (more permissive than register, but still bounded)
  const guestLimiter = createRateLimiter({
    defaultLimit: {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 100,
      keyBy: 'ip',
    },
    failClosed: config.RATE_LIMIT_FAIL_CLOSED,
  });

  // POST /api/v1/auth/guest
  router.post(
    '/guest',
    guestLimiter,
    validateBody(guestLoginSchema),
    asyncHandler(guestLogin),
  );

  // POST /api/v1/auth/refresh
  router.post(
    '/refresh',
    refreshLimiter,
    asyncHandler(refresh),
  );

  // POST /api/v1/auth/logout
  router.post(
    '/logout',
    authMiddleware,
    asyncHandler(logout),
  );

  // GET /api/v1/auth/me
  router.get(
    '/me',
    authMiddleware,
    asyncHandler(me),
  );

  return router;
}
