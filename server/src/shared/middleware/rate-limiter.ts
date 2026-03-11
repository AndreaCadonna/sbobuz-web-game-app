/**
 * Redis-backed sliding window log rate limiter.
 *
 * Uses sorted sets for accurate per-endpoint rate limiting.
 * Fails open if Redis is unavailable (logs warning, allows request).
 *
 * @see docs/specs/api-gateway.md Section 5.1 (Sliding Window Algorithm)
 */

import type { Request, Response, NextFunction } from 'express';

import { getRedisClient } from '../../infra/redis/index.js';
import { createModuleLogger } from '../logger.js';

const logger = createModuleLogger('gateway');

/**
 * Rate limit configuration for a specific endpoint or default.
 */
export interface RateLimitConfig {
  /** Sliding window duration in milliseconds. */
  readonly windowMs: number;
  /** Maximum requests allowed in the window. */
  readonly maxRequests: number;
  /** Key extraction strategy. */
  readonly keyBy: 'ip' | 'userId';
}

/**
 * Per-endpoint rate limit overrides.
 */
export interface RateLimiterOptions {
  /** Default rate limit applied when no endpoint override matches. */
  readonly defaultLimit: RateLimitConfig;
  /** Endpoint-specific overrides keyed by "METHOD /path". */
  readonly endpoints?: Readonly<Record<string, RateLimitConfig>> | undefined;
  /**
   * When true, return 503 Service Unavailable if Redis is unreachable.
   * When false (default), fail open and allow requests through.
   * Recommended: true in production to prevent abuse during Redis outages.
   */
  readonly failClosed?: boolean;
}

/**
 * Augment Express Request to include optional userId from auth middleware.
 */
interface AuthenticatedRequest extends Request {
  userId?: string | undefined;
}

/**
 * Build the Redis key for rate limiting.
 */
function buildKey(config: RateLimitConfig, req: AuthenticatedRequest, endpoint: string): string {
  const identifier =
    config.keyBy === 'userId' && (req as AuthenticatedRequest).userId
      ? (req as AuthenticatedRequest).userId
      : req.ip ?? 'unknown';
  return `ratelimit:${identifier}:${endpoint}`;
}

/**
 * Resolve which rate limit config applies for a given request.
 */
function resolveConfig(
  options: RateLimiterOptions,
  method: string,
  path: string,
): RateLimitConfig {
  if (options.endpoints) {
    // Try exact match first
    const endpointKey = `${method.toUpperCase()} ${path}`;
    const override = options.endpoints[endpointKey];
    if (override) return override;

    // Try matching path patterns (strip route params)
    for (const [key, config] of Object.entries(options.endpoints)) {
      const [keyMethod, keyPath] = key.split(' ') as [string, string];
      if (keyMethod === method.toUpperCase() && keyPath === path) {
        return config;
      }
    }
  }
  return options.defaultLimit;
}

/**
 * Create a rate limiter middleware factory.
 *
 * @param options - Rate limiting configuration with defaults and overrides.
 * @returns Express middleware that enforces rate limits.
 */
export function createRateLimiter(
  options: RateLimiterOptions,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const limitConfig = resolveConfig(options, req.method, req.path);
    const endpoint = `${req.method.toUpperCase()} ${req.path}`;
    const key = buildKey(limitConfig, req as AuthenticatedRequest, endpoint);

    checkRateLimit(key, limitConfig, res)
      .then((allowed) => {
        if (allowed) {
          next();
        }
        // If not allowed, response already sent
      })
      .catch((err: unknown) => {
        if (options.failClosed) {
          logger.error({ err, key, endpoint }, 'Rate limiter Redis error — failing closed (503)');
          res.status(503).json({
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Service temporarily unavailable. Please try again later.',
              requestId: (res.getHeader('X-Request-Id') as string | undefined) ?? '',
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          logger.warn({ err, key, endpoint }, 'Rate limiter Redis error — failing open');
          next();
        }
      });
  };
}

/**
 * Check and enforce the sliding window rate limit.
 *
 * @returns true if the request is allowed, false if rate limited (response already sent).
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  res: Response,
): Promise<boolean> {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Pipeline: remove old entries, count remaining, add new entry, set TTL
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcard(key);
  pipeline.zadd(key, now.toString(), now.toString());
  pipeline.pexpire(key, config.windowMs);

  const results = await pipeline.exec();
  if (!results) {
    // Pipeline returned null — fail open
    return true;
  }

  // results[1] is the ZCARD result: [error, count]
  const zcardResult = results[1];
  if (!zcardResult) return true;

  const [zcardErr, count] = zcardResult;
  if (zcardErr) {
    logger.warn({ err: zcardErr, key }, 'Rate limiter ZCARD error');
    return true;
  }

  const currentCount = count as number;

  if (currentCount >= config.maxRequests) {
    // Rate limited — remove the entry we just added
    await redis.zrem(key, now.toString()).catch(() => {
      // Best effort cleanup
    });

    const retryAfterMs = config.windowMs;
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', (now + config.windowMs).toString());

    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
        requestId: (res.getHeader('X-Request-Id') as string | undefined) ?? '',
        timestamp: new Date().toISOString(),
      },
    });

    logger.warn({ key, count: currentCount, limit: config.maxRequests }, 'Rate limit exceeded');

    return false;
  }

  // Set remaining count header
  const remaining = config.maxRequests - currentCount - 1;
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  res.setHeader('X-RateLimit-Reset', (now + config.windowMs).toString());

  return true;
}
