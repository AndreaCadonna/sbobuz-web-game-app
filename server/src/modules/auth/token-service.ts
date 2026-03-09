/**
 * JWT token issuance and validation, refresh token management in Redis.
 *
 * Access tokens are JWTs signed with HS256 (short-lived, stateless).
 * Refresh tokens are opaque UUIDs stored in Redis (long-lived, stateful).
 *
 * @see docs/specs/auth-module.md Section 2.4 (Access Token Payload)
 * @see docs/specs/auth-module.md Section 2.5 (Refresh Token)
 * @see docs/specs/auth-module.md Section 7 (Security Considerations)
 */

import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { getRedisClient } from '../../infra/redis/index.js';
import { getConfig } from '../../shared/config/index.js';
import { AuthenticationError } from '../../shared/errors/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import type { RefreshToken } from './auth.types.js';

const logger = createModuleLogger('auth');

/**
 * Payload for generating an access token.
 */
export interface GenerateAccessTokenPayload {
  readonly userId: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly sessionId: string;
}

/**
 * Decoded access token payload.
 */
export interface DecodedAccessToken {
  readonly sub: string;
  readonly email: string;
  readonly username: string;
  readonly displayName?: string;
  readonly sessionId: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
  readonly type: 'access';
  readonly iss: string;
}

/**
 * Generate a signed JWT access token.
 *
 * @param payload - User identity claims.
 * @returns Signed JWT string.
 */
export function generateAccessToken(payload: GenerateAccessTokenPayload): string {
  const config = getConfig();

  const tokenPayload = {
    sub: payload.userId,
    email: payload.email,
    username: payload.username,
    displayName: payload.displayName,
    sessionId: payload.sessionId,
    type: 'access' as const,
    jti: randomUUID(),
  };

  return jwt.sign(tokenPayload, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.JWT_ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'sbobuz',
  });
}

/**
 * Verify and decode a JWT access token.
 *
 * @param token - The JWT string to verify.
 * @returns The decoded token payload.
 * @throws AuthenticationError if the token is invalid or expired.
 */
export function verifyAccessToken(token: string): DecodedAccessToken {
  try {
    const config = getConfig();

    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'sbobuz',
    }) as Record<string, unknown>;

    if (decoded['type'] !== 'access') {
      throw new AuthenticationError('Invalid token type', {
        errorCode: 'AUTH_INVALID_TOKEN',
      });
    }

    return decoded as unknown as DecodedAccessToken;
  } catch (err) {
    if (err instanceof AuthenticationError) throw err;

    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Access token expired', {
        errorCode: 'AUTH_TOKEN_EXPIRED',
      });
    }

    throw new AuthenticationError('Invalid access token', {
      errorCode: 'AUTH_INVALID_TOKEN',
    });
  }
}

/**
 * Generate a refresh token and store it in Redis.
 *
 * @param userId - The user who owns this token.
 * @param sessionId - The session this token is bound to.
 * @returns The refresh token data.
 */
export async function generateRefreshToken(
  userId: string,
  sessionId: string,
): Promise<RefreshToken> {
  const config = getConfig();
  const redis = getRedisClient();
  const tokenId = randomUUID();
  const ttlSeconds = config.JWT_REFRESH_TOKEN_TTL_SECONDS;

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const token: RefreshToken = {
    tokenId,
    userId,
    sessionId,
    expiresAt,
    isUsed: false,
  };

  const key = `refresh:${tokenId}`;
  await redis.set(key, JSON.stringify(token), 'EX', ttlSeconds);

  logger.debug({ tokenId, userId, sessionId }, 'Refresh token generated');

  return token;
}

/**
 * Verify a refresh token by looking it up in Redis.
 *
 * @param tokenId - The opaque token ID.
 * @returns The refresh token data.
 * @throws AuthenticationError if the token is not found, used, or expired.
 */
export async function verifyRefreshToken(tokenId: string): Promise<RefreshToken> {
  const redis = getRedisClient();
  const key = `refresh:${tokenId}`;
  const raw = await redis.get(key);

  if (!raw) {
    throw new AuthenticationError('Invalid refresh token', {
      errorCode: 'AUTH_REFRESH_INVALID',
    });
  }

  const token = JSON.parse(raw) as RefreshToken;

  if (token.isUsed) {
    logger.warn({ tokenId, userId: token.userId }, 'Refresh token reuse detected');
    throw new AuthenticationError('Token reuse detected', {
      errorCode: 'AUTH_REFRESH_INVALID',
    });
  }

  return token;
}

/**
 * Rotate a refresh token: mark old as used, create new.
 *
 * @param oldTokenId - The token to invalidate.
 * @param userId - The user ID.
 * @param sessionId - The session this token is bound to.
 * @returns The new refresh token.
 */
export async function rotateRefreshToken(
  oldTokenId: string,
  userId: string,
  sessionId: string,
): Promise<RefreshToken> {
  const redis = getRedisClient();
  const oldKey = `refresh:${oldTokenId}`;

  // Mark old token as used (keep it in Redis until TTL for reuse detection)
  const oldRaw = await redis.get(oldKey);
  if (oldRaw) {
    const oldToken = JSON.parse(oldRaw) as RefreshToken;
    const updatedOld: RefreshToken = { ...oldToken, isUsed: true };
    // Keep same TTL
    const ttl = await redis.ttl(oldKey);
    if (ttl > 0) {
      await redis.set(oldKey, JSON.stringify(updatedOld), 'EX', ttl);
    }
  }

  // Generate new token
  return generateRefreshToken(userId, sessionId);
}

/**
 * Revoke (delete) a refresh token from Redis.
 *
 * @param tokenId - The token to revoke.
 */
export async function revokeRefreshToken(tokenId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`refresh:${tokenId}`);
  logger.debug({ tokenId }, 'Refresh token revoked');
}

/**
 * Revoke all refresh tokens for a user.
 *
 * This requires scanning Redis keys which is expensive, so we use the
 * session-based approach: for each session, find and revoke its token.
 * The caller provides the session IDs.
 *
 * @param userId - The user ID (for logging).
 * @param sessionIds - List of session IDs to find refresh tokens for.
 */
export async function revokeAllRefreshTokensForUser(
  userId: string,
  sessionIds: readonly string[],
): Promise<void> {
  // This is a best-effort operation; individual refresh tokens are
  // stored with their sessionId, but we don't have an index from
  // session to refresh token. In practice, sessions and refresh tokens
  // share the same TTL, so expiring sessions also expires tokens.
  logger.info({ userId, sessionCount: sessionIds.length }, 'Revoking all refresh tokens for user');

  // Scan for refresh tokens by pattern (used sparingly)
  const redis = getRedisClient();
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      'refresh:*',
      'COUNT',
      100,
    );
    cursor = nextCursor;

    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        try {
          const token = JSON.parse(raw) as RefreshToken;
          if (token.userId === userId) {
            await redis.del(key);
          }
        } catch {
          // Skip malformed entries
        }
      }
    }
  } while (cursor !== '0');
}
