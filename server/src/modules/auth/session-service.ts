/**
 * Redis-backed session tracking.
 *
 * Sessions are stored as JSON in Redis with TTL matching the refresh token
 * lifetime (7 days). A Redis SET per user tracks active session IDs.
 *
 * @see docs/specs/auth-module.md Section 2.3 (Session)
 */

import { randomUUID } from 'node:crypto';

import { getRedisClient } from '../../infra/redis/index.js';
import { getConfig } from '../../shared/config/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import type { Session, DeviceInfo } from './auth.types.js';

const logger = createModuleLogger('auth');

/**
 * Derive platform from User-Agent string.
 */
function derivePlatform(userAgent: string): 'web' | 'mobile' | 'unknown' {
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'mobile';
  }
  if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox')) {
    return 'web';
  }
  return 'unknown';
}

/**
 * Create a new session in Redis.
 *
 * Stores session data and adds the sessionId to the user's session set.
 *
 * @param userId - The authenticated user's ID.
 * @param deviceInfo - Device metadata from the request.
 * @returns The created session ID.
 */
export async function createSession(
  userId: string,
  deviceInfo: { userAgent: string; ipAddress: string },
): Promise<string> {
  const config = getConfig();
  const redis = getRedisClient();
  const sessionId = randomUUID();
  const ttlSeconds = config.JWT_REFRESH_TOKEN_TTL_SECONDS;

  const fullDeviceInfo: DeviceInfo = {
    userAgent: deviceInfo.userAgent.slice(0, 512),
    ipAddress: deviceInfo.ipAddress,
    platform: derivePlatform(deviceInfo.userAgent),
  };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const session: Session = {
    sessionId,
    userId,
    deviceInfo: fullDeviceInfo,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isRevoked: false,
  };

  const sessionKey = `session:${sessionId}`;
  const userSessionsKey = `user_sessions:${userId}`;

  // Store session and add to user's session set
  await redis.set(sessionKey, JSON.stringify(session), 'EX', ttlSeconds);
  await redis.sadd(userSessionsKey, sessionId);
  // Set TTL on the user sessions set too (cleanup)
  await redis.expire(userSessionsKey, ttlSeconds);

  logger.info({ sessionId, userId, platform: fullDeviceInfo.platform }, 'Session created');

  return sessionId;
}

/**
 * Get a session by ID.
 *
 * @param sessionId - The session UUID.
 * @returns The Session or undefined if not found/expired.
 */
export async function getSession(sessionId: string): Promise<Session | undefined> {
  const redis = getRedisClient();
  const raw = await redis.get(`session:${sessionId}`);

  if (!raw) return undefined;

  return JSON.parse(raw) as Session;
}

/**
 * Revoke a session (set isRevoked = true, keep in Redis for audit).
 *
 * @param sessionId - The session to revoke.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `session:${sessionId}`;
  const raw = await redis.get(key);

  if (!raw) {
    logger.debug({ sessionId }, 'Session not found for revocation (may have expired)');
    return;
  }

  const session = JSON.parse(raw) as Session;
  const revoked: Session = { ...session, isRevoked: true };

  // Keep same TTL
  const ttl = await redis.ttl(key);
  if (ttl > 0) {
    await redis.set(key, JSON.stringify(revoked), 'EX', ttl);
  }

  // Remove from user's session set
  await redis.srem(`user_sessions:${session.userId}`, sessionId);

  logger.info({ sessionId, userId: session.userId }, 'Session revoked');
}

/**
 * Revoke all sessions for a user.
 *
 * @param userId - The user whose sessions should be revoked.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  const redis = getRedisClient();
  const userSessionsKey = `user_sessions:${userId}`;

  const sessionIds = await redis.smembers(userSessionsKey);

  for (const sessionId of sessionIds) {
    const key = `session:${sessionId}`;
    const raw = await redis.get(key);
    if (raw) {
      const session = JSON.parse(raw) as Session;
      const revoked: Session = { ...session, isRevoked: true };
      const ttl = await redis.ttl(key);
      if (ttl > 0) {
        await redis.set(key, JSON.stringify(revoked), 'EX', ttl);
      }
    }
  }

  // Clear the user's session set
  await redis.del(userSessionsKey);

  logger.info({ userId, sessionCount: sessionIds.length }, 'All sessions revoked');
}

/**
 * Get all session IDs for a user.
 *
 * @param userId - The user ID.
 * @returns Array of session IDs.
 */
export async function getUserSessionIds(userId: string): Promise<string[]> {
  const redis = getRedisClient();
  return redis.smembers(`user_sessions:${userId}`);
}

/**
 * Check if a session is valid (exists and not revoked).
 *
 * @param sessionId - The session ID to check.
 * @returns true if the session exists and is not revoked.
 */
export async function isSessionValid(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  return session !== undefined && !session.isRevoked;
}
