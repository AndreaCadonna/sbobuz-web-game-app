/**
 * Per-socket WebSocket event rate limiter.
 *
 * Uses in-memory sliding window counters per socket (not Redis) for performance.
 * Each event category has its own limit. Persistent violations trigger forced disconnect.
 *
 * @see docs/specs/realtime-module.md Section 5.8 (Rate Limiting)
 */

import { createModuleLogger } from '../../shared/logger.js';

const logger = createModuleLogger('realtime');

/**
 * Rate limit configuration for an event category.
 */
export interface RateLimitConfig {
  /** Maximum events allowed within the window. */
  readonly maxEvents: number;
  /** Window duration in milliseconds. */
  readonly windowMs: number;
}

/**
 * Default rate limit configurations per event category.
 * @see docs/specs/realtime-module.md Section 5.8
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'game:action': { maxEvents: 10, windowMs: 1000 },
  'room:join': { maxEvents: 5, windowMs: 10_000 },
  'room:leave': { maxEvents: 5, windowMs: 10_000 },
  'presence:heartbeat': { maxEvents: 2, windowMs: 1000 },
  default: { maxEvents: 20, windowMs: 1000 },
};

/**
 * Violation tracking for forced disconnect on persistent abuse.
 */
const VIOLATION_THRESHOLD = 10;
const VIOLATION_WINDOW_MS = 60_000;

/**
 * Tracks rate limit state for a single socket.
 */
export class SocketRateLimiter {
  private readonly buckets: Map<string, number[]> = new Map();
  private readonly violations: number[] = [];
  private readonly limits: Record<string, RateLimitConfig>;

  constructor(limits?: Record<string, RateLimitConfig> | undefined) {
    this.limits = limits ?? DEFAULT_RATE_LIMITS;
  }

  /**
   * Check if an event is allowed under the rate limit.
   *
   * @param eventName - The Socket.IO event name (e.g., 'game:action').
   * @returns true if allowed, false if rate limited.
   */
  checkLimit(eventName: string): boolean {
    const now = Date.now();
    const config = this.limits[eventName] ?? this.limits['default'];

    if (!config) {
      return true;
    }

    const key = eventName;
    let timestamps = this.buckets.get(key);

    if (!timestamps) {
      timestamps = [];
      this.buckets.set(key, timestamps);
    }

    // Remove timestamps outside the window
    const windowStart = now - config.windowMs;
    while (timestamps.length > 0 && timestamps[0]! < windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= config.maxEvents) {
      this.recordViolation(now);
      return false;
    }

    timestamps.push(now);
    return true;
  }

  /**
   * Record a rate limit violation and check if forced disconnect is needed.
   *
   * @returns true if the socket should be forcefully disconnected.
   */
  private recordViolation(now: number): void {
    this.violations.push(now);

    // Prune old violations
    const windowStart = now - VIOLATION_WINDOW_MS;
    while (this.violations.length > 0 && this.violations[0]! < windowStart) {
      this.violations.shift();
    }
  }

  /**
   * Check if the socket should be forcefully disconnected due to persistent abuse.
   *
   * @returns true if violations exceed the threshold.
   */
  shouldForceDisconnect(): boolean {
    const now = Date.now();
    const windowStart = now - VIOLATION_WINDOW_MS;

    // Prune old violations
    while (this.violations.length > 0 && this.violations[0]! < windowStart) {
      this.violations.shift();
    }

    return this.violations.length >= VIOLATION_THRESHOLD;
  }

  /**
   * Get the current violation count (for monitoring).
   */
  getViolationCount(): number {
    return this.violations.length;
  }

  /**
   * Clear all tracking state (for cleanup on disconnect).
   */
  clear(): void {
    this.buckets.clear();
    this.violations.length = 0;
  }
}

/**
 * Map of socket ID -> rate limiter instance.
 * Cleaned up on socket disconnect.
 */
const socketLimiters = new Map<string, SocketRateLimiter>();

/**
 * Get or create a rate limiter for a socket.
 *
 * @param socketId - The socket ID.
 * @param limits - Optional custom limits (for testing).
 * @returns The rate limiter for this socket.
 */
export function getSocketRateLimiter(
  socketId: string,
  limits?: Record<string, RateLimitConfig> | undefined,
): SocketRateLimiter {
  let limiter = socketLimiters.get(socketId);
  if (!limiter) {
    limiter = new SocketRateLimiter(limits);
    socketLimiters.set(socketId, limiter);
  }
  return limiter;
}

/**
 * Remove the rate limiter for a disconnected socket.
 *
 * @param socketId - The socket ID to clean up.
 */
export function removeSocketRateLimiter(socketId: string): void {
  const limiter = socketLimiters.get(socketId);
  if (limiter) {
    limiter.clear();
    socketLimiters.delete(socketId);
  }
}

/**
 * Create a Socket.IO middleware that enforces per-event rate limits.
 * Returns a function that wraps event handlers.
 *
 * @param socketId - The socket ID.
 * @param userId - The user ID (for logging).
 * @returns A function that checks rate limits for an event.
 */
export function checkEventRateLimit(
  socketId: string,
  userId: string,
  eventName: string,
): boolean {
  const limiter = getSocketRateLimiter(socketId);
  const allowed = limiter.checkLimit(eventName);

  if (!allowed) {
    logger.warn(
      { socketId, userId, eventName, violations: limiter.getViolationCount() },
      'WebSocket event rate limited',
    );
  }

  return allowed;
}

/**
 * Reset all socket rate limiters (for testing only).
 */
export function resetAllSocketRateLimiters(): void {
  for (const limiter of socketLimiters.values()) {
    limiter.clear();
  }
  socketLimiters.clear();
}
