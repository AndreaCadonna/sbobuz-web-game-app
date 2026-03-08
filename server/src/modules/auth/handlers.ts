/**
 * Auth module request handlers.
 *
 * Each handler follows the pattern: extract validated input, call services,
 * return typed response envelope. All errors are thrown as AppError subclasses
 * and caught by the global error handler.
 *
 * @see docs/specs/auth-module.md Section 3 (API Endpoints)
 */

import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';

import type { ApiSuccessResponse } from '@sbobuz/shared';

import { getRedisClient } from '../../infra/redis/index.js';
import { getConfig } from '../../shared/config/index.js';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import type { User } from './auth.types.js';
import {
  createUser,
  findUserById,
  findUserWithCredentials,
  userExistsByEmail,
  userExistsByUsername,
} from './repository.js';
import type { RegisterInput, LoginInput } from './schemas.js';
import {
  createSession,
  getSession,
  revokeSession,
  revokeAllSessions,
} from './session-service.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
} from './token-service.js';

const logger = createModuleLogger('auth');

/**
 * Cookie settings for the refresh token.
 */
const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Login rate limiting constants.
 */
const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Dummy bcrypt hash for constant-time comparison when user is not found.
 * Generated with cost factor 12, so timing is consistent with real comparisons.
 */
const DUMMY_HASH = '$2a$12$LJ3m4ys3Lg4B4/MdBRyKn.NBW3FKtU.LQgSM1/2vbnVYGqBLx5S1K';

/**
 * Strip sensitive fields from a User for API response.
 */
function toUserResponse(user: User): {
  id: string;
  email: string;
  username: string;
  displayName: string;
} {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
  };
}

/**
 * Set the refresh token as an httpOnly cookie.
 */
function setRefreshCookie(res: Response, tokenId: string): void {
  const config = getConfig();
  const isProduction = config.NODE_ENV === 'production';

  res.cookie(REFRESH_COOKIE_NAME, tokenId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

/**
 * Clear the refresh token cookie.
 */
function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
  });
}

/**
 * Get device info from the request for session tracking.
 */
function getDeviceInfo(req: Request): { userAgent: string; ipAddress: string } {
  return {
    userAgent: (req.headers['user-agent'] as string | undefined) ?? 'unknown',
    ipAddress: req.ip ?? req.socket.remoteAddress ?? 'unknown',
  };
}

// --- Login rate limiting helpers ---

/**
 * Check login attempts for an email and throw if rate limited.
 */
async function checkLoginRateLimit(email: string): Promise<void> {
  const redis = getRedisClient();
  const key = `login_attempts:${email}`;
  const now = Date.now();
  const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;

  // Remove old entries and count current
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcard(key);
  const results = await pipeline.exec();

  if (!results) return;

  const zcardResult = results[1];
  if (!zcardResult) return;

  const [zcardErr, count] = zcardResult;
  if (zcardErr) return;

  if ((count as number) >= LOGIN_RATE_LIMIT_MAX) {
    throw new AuthenticationError('Too many login attempts. Please try again later.', {
      errorCode: 'AUTH_INVALID_CREDENTIALS',
    });
  }
}

/**
 * Record a failed login attempt.
 */
async function recordFailedLogin(email: string): Promise<void> {
  const redis = getRedisClient();
  const key = `login_attempts:${email}`;
  const now = Date.now();

  await redis.zadd(key, now.toString(), now.toString());
  await redis.pexpire(key, LOGIN_RATE_LIMIT_WINDOW_MS);
}

/**
 * Clear login attempts on successful login.
 */
async function clearLoginAttempts(email: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`login_attempts:${email}`);
}

// --- Handlers ---

/**
 * POST /api/v1/auth/register
 *
 * Create a new user account.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, username } = req.body as RegisterInput;
  const config = getConfig();

  // Check uniqueness
  const [emailExists, usernameExists] = await Promise.all([
    userExistsByEmail(email),
    userExistsByUsername(username),
  ]);

  if (emailExists) {
    throw new ConflictError('Email is already registered', {
      errorCode: 'AUTH_DUPLICATE_EMAIL',
    });
  }

  if (usernameExists) {
    throw new ConflictError('Username is already taken', {
      errorCode: 'AUTH_DUPLICATE_USERNAME',
    });
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, config.BCRYPT_COST_FACTOR);

  // Create user (displayName preserves original case of username)
  const user = await createUser({
    email,
    username: username.toLowerCase(),
    displayName: username,
    passwordHash,
  });

  // Create session
  const deviceInfo = getDeviceInfo(req);
  const sessionId = await createSession(user.id, deviceInfo);

  // Issue tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    username: user.username,
    sessionId,
  });
  const refreshToken = await generateRefreshToken(user.id, sessionId);

  // Set refresh cookie
  setRefreshCookie(res, refreshToken.tokenId);

  logger.info({ userId: user.id, email: user.email }, 'User registered');

  const body: ApiSuccessResponse<{ accessToken: string; user: ReturnType<typeof toUserResponse> }> = {
    success: true,
    data: {
      accessToken,
      user: toUserResponse(user),
    },
  };

  res.status(201).json(body);
}

/**
 * POST /api/v1/auth/login
 *
 * Authenticate with email and password.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  // Check login rate limit
  await checkLoginRateLimit(email);

  // Find user with credentials
  const userWithCreds = await findUserWithCredentials(email);

  if (!userWithCreds) {
    // Constant-time comparison against dummy hash to prevent timing attacks
    await bcrypt.compare(password, DUMMY_HASH);
    await recordFailedLogin(email);
    throw new AuthenticationError('Invalid credentials', {
      errorCode: 'AUTH_INVALID_CREDENTIALS',
    });
  }

  // Check account status
  if (userWithCreds.status === 'banned') {
    throw new AuthorizationError('Account has been banned', {
      errorCode: 'AUTH_ACCOUNT_BANNED',
    });
  }

  if (userWithCreds.status === 'suspended') {
    throw new AuthorizationError('Account has been suspended', {
      errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS',
    });
  }

  // Verify password
  const passwordValid = await bcrypt.compare(password, userWithCreds.passwordHash);

  if (!passwordValid) {
    await recordFailedLogin(email);
    throw new AuthenticationError('Invalid credentials', {
      errorCode: 'AUTH_INVALID_CREDENTIALS',
    });
  }

  // Clear rate limit on success
  await clearLoginAttempts(email);

  // Create session
  const deviceInfo = getDeviceInfo(req);
  const sessionId = await createSession(userWithCreds.id, deviceInfo);

  // Issue tokens
  const accessToken = generateAccessToken({
    userId: userWithCreds.id,
    email: userWithCreds.email,
    username: userWithCreds.username,
    sessionId,
  });
  const refreshToken = await generateRefreshToken(userWithCreds.id, sessionId);

  // Set refresh cookie
  setRefreshCookie(res, refreshToken.tokenId);

  logger.info({ userId: userWithCreds.id }, 'User logged in');

  const body: ApiSuccessResponse<{ accessToken: string; user: ReturnType<typeof toUserResponse> }> = {
    success: true,
    data: {
      accessToken,
      user: toUserResponse(userWithCreds),
    },
  };

  res.status(200).json(body);
}

/**
 * POST /api/v1/auth/refresh
 *
 * Rotate the refresh token and issue a new access token.
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  // Extract refresh token from cookie
  const tokenId = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

  if (!tokenId) {
    throw new AuthenticationError('Refresh token required', {
      errorCode: 'AUTH_REFRESH_INVALID',
    });
  }

  // Verify refresh token (throws if invalid or expired)
  let refreshTokenData;
  try {
    refreshTokenData = await verifyRefreshToken(tokenId);
  } catch (err) {
    // Check if this is a token reuse scenario
    if (err instanceof AuthenticationError && err.message === 'Token reuse detected') {
      // SECURITY: Revoke all sessions and tokens for this user
      // We need to find the userId from the used token in Redis
      const redis = getRedisClient();
      const raw = await redis.get(`refresh:${tokenId}`);
      if (raw) {
        const tokenData = JSON.parse(raw) as { userId: string };
        logger.warn(
          { tokenId, userId: tokenData.userId },
          'SECURITY: Refresh token reuse detected, revoking all sessions',
        );
        await revokeAllSessions(tokenData.userId);
        await revokeAllRefreshTokensForUser(tokenData.userId, []);
      }
    }
    throw err;
  }

  // Verify session is still valid
  const session = await getSession(refreshTokenData.sessionId);
  if (!session || session.isRevoked) {
    throw new AuthenticationError('Session expired or revoked', {
      errorCode: 'AUTH_REFRESH_INVALID',
    });
  }

  // Check user status
  const user = await findUserById(refreshTokenData.userId);
  if (!user || user.status !== 'active') {
    throw new AuthenticationError('Account is not active', {
      errorCode: 'AUTH_REFRESH_INVALID',
    });
  }

  // Rotate refresh token
  const newRefreshToken = await rotateRefreshToken(
    tokenId,
    refreshTokenData.userId,
    refreshTokenData.sessionId,
  );

  // Issue new access token
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    username: user.username,
    sessionId: refreshTokenData.sessionId,
  });

  // Set new refresh cookie
  setRefreshCookie(res, newRefreshToken.tokenId);

  logger.debug({ userId: user.id, sessionId: refreshTokenData.sessionId }, 'Token refreshed');

  const body: ApiSuccessResponse<{ accessToken: string }> = {
    success: true,
    data: {
      accessToken,
    },
  };

  res.status(200).json(body);
}

/**
 * POST /api/v1/auth/logout
 *
 * Revoke the current session and its refresh token.
 * Requires authentication.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  const sessionId = req.sessionId;

  if (!userId || !sessionId) {
    throw new AuthenticationError('Authentication required', {
      errorCode: 'AUTH_REQUIRED',
    });
  }

  // Revoke session
  await revokeSession(sessionId);

  // Revoke any refresh token bound to this session
  // We look up the cookie to get the tokenId for direct revocation
  const tokenId = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (tokenId) {
    await revokeRefreshToken(tokenId);
  }

  // Clear refresh cookie
  clearRefreshCookie(res);

  logger.info({ userId, sessionId }, 'User logged out');

  res.status(204).end();
}

/**
 * GET /api/v1/auth/me
 *
 * Get the current authenticated user's profile.
 * Requires authentication.
 */
export async function me(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    throw new AuthenticationError('Authentication required', {
      errorCode: 'AUTH_REQUIRED',
    });
  }

  const user = await findUserById(userId);

  if (!user) {
    throw new NotFoundError('User not found', {
      errorCode: 'NOT_FOUND',
    });
  }

  const body: ApiSuccessResponse<ReturnType<typeof toUserResponse>> = {
    success: true,
    data: toUserResponse(user),
  };

  res.status(200).json(body);
}
