/**
 * Tests for the per-socket WebSocket rate limiter.
 *
 * @see docs/specs/realtime-module.md Section 5.8 (Rate Limiting)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  SocketRateLimiter,
  getSocketRateLimiter,
  removeSocketRateLimiter,
  checkEventRateLimit,
  resetAllSocketRateLimiters,
  DEFAULT_RATE_LIMITS,
} from './rate-limiter.js';

// Mock the logger
vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('SocketRateLimiter', () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    limiter = new SocketRateLimiter();
  });

  describe('checkLimit', () => {
    it('should allow events within the limit', () => {
      // default limit is 20 per second
      for (let i = 0; i < 20; i++) {
        expect(limiter.checkLimit('some:event')).toBe(true);
      }
    });

    it('should reject events exceeding the limit', () => {
      // default limit is 20 per second
      for (let i = 0; i < 20; i++) {
        limiter.checkLimit('some:event');
      }
      expect(limiter.checkLimit('some:event')).toBe(false);
    });

    it('should use event-specific limits for known events', () => {
      // game:action limit is 10 per second
      for (let i = 0; i < 10; i++) {
        expect(limiter.checkLimit('game:action')).toBe(true);
      }
      expect(limiter.checkLimit('game:action')).toBe(false);
    });

    it('should use heartbeat limit for presence:heartbeat', () => {
      // presence:heartbeat limit is 2 per second
      expect(limiter.checkLimit('presence:heartbeat')).toBe(true);
      expect(limiter.checkLimit('presence:heartbeat')).toBe(true);
      expect(limiter.checkLimit('presence:heartbeat')).toBe(false);
    });

    it('should use room event limits', () => {
      // room:join limit is 5 per 10 seconds
      for (let i = 0; i < 5; i++) {
        expect(limiter.checkLimit('room:join')).toBe(true);
      }
      expect(limiter.checkLimit('room:join')).toBe(false);
    });

    it('should reset the window after the time passes', () => {
      vi.useFakeTimers();

      // Use a custom limiter with known limits
      const customLimiter = new SocketRateLimiter({
        'test:event': { maxEvents: 3, windowMs: 1000 },
      });

      // Hit the limit
      expect(customLimiter.checkLimit('test:event')).toBe(true);
      expect(customLimiter.checkLimit('test:event')).toBe(true);
      expect(customLimiter.checkLimit('test:event')).toBe(true);
      expect(customLimiter.checkLimit('test:event')).toBe(false);

      // Advance past the window
      vi.advanceTimersByTime(1100);

      // Should be allowed again
      expect(customLimiter.checkLimit('test:event')).toBe(true);

      vi.useRealTimers();
    });

    it('should track different events independently', () => {
      const customLimiter = new SocketRateLimiter({
        'event:a': { maxEvents: 2, windowMs: 1000 },
        'event:b': { maxEvents: 2, windowMs: 1000 },
      });

      expect(customLimiter.checkLimit('event:a')).toBe(true);
      expect(customLimiter.checkLimit('event:a')).toBe(true);
      expect(customLimiter.checkLimit('event:a')).toBe(false);

      // Event B should still be available
      expect(customLimiter.checkLimit('event:b')).toBe(true);
      expect(customLimiter.checkLimit('event:b')).toBe(true);
      expect(customLimiter.checkLimit('event:b')).toBe(false);
    });
  });

  describe('violation tracking', () => {
    it('should not force disconnect under the threshold', () => {
      const customLimiter = new SocketRateLimiter({
        'test:event': { maxEvents: 1, windowMs: 1000 },
      });

      // Hit rate limit 9 times (under threshold of 10)
      customLimiter.checkLimit('test:event'); // allowed
      for (let i = 0; i < 9; i++) {
        customLimiter.checkLimit('test:event'); // rejected = violation
      }

      expect(customLimiter.shouldForceDisconnect()).toBe(false);
    });

    it('should force disconnect after reaching the violation threshold', () => {
      const customLimiter = new SocketRateLimiter({
        'test:event': { maxEvents: 1, windowMs: 1000 },
      });

      // First event allowed
      customLimiter.checkLimit('test:event');

      // Next 10 events are violations (threshold is 10)
      for (let i = 0; i < 10; i++) {
        customLimiter.checkLimit('test:event');
      }

      expect(customLimiter.shouldForceDisconnect()).toBe(true);
    });

    it('should clear violations outside the window', () => {
      vi.useFakeTimers();

      const customLimiter = new SocketRateLimiter({
        'test:event': { maxEvents: 1, windowMs: 1000 },
      });

      // Accumulate violations
      customLimiter.checkLimit('test:event');
      for (let i = 0; i < 10; i++) {
        customLimiter.checkLimit('test:event');
      }
      expect(customLimiter.shouldForceDisconnect()).toBe(true);

      // Advance past the violation window (60 seconds)
      vi.advanceTimersByTime(61_000);

      expect(customLimiter.shouldForceDisconnect()).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('clear', () => {
    it('should reset all state', () => {
      const customLimiter = new SocketRateLimiter({
        'test:event': { maxEvents: 1, windowMs: 1000 },
      });

      customLimiter.checkLimit('test:event');
      customLimiter.checkLimit('test:event'); // violation
      expect(customLimiter.getViolationCount()).toBe(1);

      customLimiter.clear();

      expect(customLimiter.getViolationCount()).toBe(0);
      expect(customLimiter.checkLimit('test:event')).toBe(true); // reset
    });
  });
});

describe('Socket rate limiter registry', () => {
  beforeEach(() => {
    resetAllSocketRateLimiters();
  });

  afterEach(() => {
    resetAllSocketRateLimiters();
  });

  describe('getSocketRateLimiter', () => {
    it('should create a new limiter for unknown socket', () => {
      const limiter = getSocketRateLimiter('socket-1');
      expect(limiter).toBeInstanceOf(SocketRateLimiter);
    });

    it('should return the same limiter for the same socket', () => {
      const limiter1 = getSocketRateLimiter('socket-1');
      const limiter2 = getSocketRateLimiter('socket-1');
      expect(limiter1).toBe(limiter2);
    });

    it('should return different limiters for different sockets', () => {
      const limiter1 = getSocketRateLimiter('socket-1');
      const limiter2 = getSocketRateLimiter('socket-2');
      expect(limiter1).not.toBe(limiter2);
    });
  });

  describe('removeSocketRateLimiter', () => {
    it('should remove the limiter for a socket', () => {
      const limiter1 = getSocketRateLimiter('socket-1');
      removeSocketRateLimiter('socket-1');
      const limiter2 = getSocketRateLimiter('socket-1');
      expect(limiter1).not.toBe(limiter2);
    });

    it('should not throw for unknown socket', () => {
      expect(() => removeSocketRateLimiter('nonexistent')).not.toThrow();
    });
  });

  describe('checkEventRateLimit', () => {
    it('should allow events within limits', () => {
      expect(checkEventRateLimit('socket-1', 'user-1', 'game:action')).toBe(true);
    });

    it('should reject events exceeding limits', () => {
      for (let i = 0; i < 10; i++) {
        checkEventRateLimit('socket-1', 'user-1', 'game:action');
      }
      expect(checkEventRateLimit('socket-1', 'user-1', 'game:action')).toBe(false);
    });
  });
});

describe('DEFAULT_RATE_LIMITS', () => {
  it('should have limits for game:action', () => {
    expect(DEFAULT_RATE_LIMITS['game:action']).toEqual({
      maxEvents: 10,
      windowMs: 1000,
    });
  });

  it('should have limits for room:join', () => {
    expect(DEFAULT_RATE_LIMITS['room:join']).toEqual({
      maxEvents: 5,
      windowMs: 10_000,
    });
  });

  it('should have limits for presence:heartbeat', () => {
    expect(DEFAULT_RATE_LIMITS['presence:heartbeat']).toEqual({
      maxEvents: 2,
      windowMs: 1000,
    });
  });

  it('should have default limits', () => {
    expect(DEFAULT_RATE_LIMITS['default']).toEqual({
      maxEvents: 20,
      windowMs: 1000,
    });
  });
});
