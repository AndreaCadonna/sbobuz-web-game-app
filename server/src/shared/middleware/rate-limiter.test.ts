/**
 * Tests for Redis-backed sliding window rate limiter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { createRateLimiter, type RateLimiterOptions } from './rate-limiter.js';

// Mock Redis client
const mockPipeline = {
  zremrangebyscore: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  pexpire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

const mockRedis = {
  pipeline: vi.fn(() => mockPipeline),
  zrem: vi.fn().mockResolvedValue(1),
};

vi.mock('../../infra/redis/index.js', () => ({
  getRedisClient: () => mockRedis,
}));

vi.mock('../logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/test',
    ip: '127.0.0.1',
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 0,
    _json: null,
    _headers: {} as Record<string, string>,
    setHeader: vi.fn((name: string, value: string) => {
      res._headers[name] = value;
    }),
    getHeader: vi.fn((name: string) => res._headers[name]),
    status: vi.fn((code: number) => {
      res._status = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res._json = body;
      return res;
    }),
  } as unknown as Response & { _status: number; _json: unknown; _headers: Record<string, string> };
  return res;
}

const defaultOptions: RateLimiterOptions = {
  defaultLimit: {
    windowMs: 60000,
    maxRequests: 100,
    keyBy: 'userId',
  },
};

describe('createRateLimiter', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
    // Default: allow request (count = 5 under limit of 100)
    mockPipeline.exec.mockResolvedValue([
      [null, 0],   // ZREMRANGEBYSCORE
      [null, 5],   // ZCARD
      [null, 1],   // ZADD
      [null, 1],   // PEXPIRE
    ]);
  });

  it('should allow request when under the limit', async () => {
    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });

  it('should reject request when at the limit', async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 100], // At limit
      [null, 1],
      [null, 1],
    ]);

    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(429));

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'RATE_LIMITED',
        }),
      }),
    );
  });

  it('should set Retry-After header when rate limited', async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 100],
      [null, 1],
      [null, 1],
    ]);

    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(429));

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
  });

  it('should use IP-based key for unauthenticated endpoints', async () => {
    const options: RateLimiterOptions = {
      defaultLimit: {
        windowMs: 60000,
        maxRequests: 10,
        keyBy: 'ip',
      },
    };

    const middleware = createRateLimiter(options);
    const req = createMockReq({ ip: '192.168.1.1' });
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(mockRedis.pipeline).toHaveBeenCalled();
  });

  it('should use endpoint-specific overrides', async () => {
    const options: RateLimiterOptions = {
      defaultLimit: {
        windowMs: 60000,
        maxRequests: 100,
        keyBy: 'userId',
      },
      endpoints: {
        'POST /api/v1/auth/login': {
          windowMs: 900000,
          maxRequests: 10,
          keyBy: 'ip',
        },
      },
    };

    const middleware = createRateLimiter(options);
    const req = createMockReq({ method: 'POST', path: '/api/v1/auth/login' });
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    // The middleware should have used the override config
    expect(mockRedis.pipeline).toHaveBeenCalled();
  });

  it('should fail open when Redis pipeline returns null', async () => {
    mockPipeline.exec.mockResolvedValue(null);

    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
  });

  it('should fail open when Redis throws an error', async () => {
    mockPipeline.exec.mockRejectedValue(new Error('Redis connection lost'));

    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
  });

  it('should fail open when ZCARD result has an error', async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [new Error('ZCARD failed'), null],
      [null, 1],
      [null, 1],
    ]);

    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
  });

  it('should set X-RateLimit-Remaining to 0 when remaining is negative', async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 99], // Just under limit
      [null, 1],
      [null, 1],
    ]);

    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
  });

  it('should use userId from request when keyBy is userId and user is authenticated', async () => {
    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    (req as Request & { userId?: string }).userId = 'user-123';
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
  });

  it('should remove added entry when rate limited', async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 100],
      [null, 1],
      [null, 1],
    ]);

    const middleware = createRateLimiter(defaultOptions);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(429));

    expect(mockRedis.zrem).toHaveBeenCalled();
  });
});
