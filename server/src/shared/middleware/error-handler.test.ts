/**
 * Tests for global error handler middleware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
} from '../errors/index.js';

import { errorHandler } from './error-handler.js';

vi.mock('../logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../context.js', () => ({
  getContext: () => ({ requestId: 'req-123', userId: 'user-456' }),
}));

function createMockReq(): Request {
  return {} as Request;
}

function createMockRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 0,
    _json: null,
    _headers: {} as Record<string, string>,
    setHeader: vi.fn(),
    getHeader: vi.fn((name: string) => {
      if (name === 'X-Request-Id') return 'req-123';
      return undefined;
    }),
    status: vi.fn(function (this: typeof res, code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn(function (this: typeof res, body: unknown) {
      this._json = body;
      return this;
    }),
  } as unknown as Response & { _status: number; _json: unknown };
  return res;
}

describe('errorHandler', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  it('should handle ValidationError with 400 status', () => {
    const err = new ValidationError('Invalid input', {
      details: [{ field: 'email', message: 'required' }],
    });
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    expect(res._status).toBe(400);
    const body = res._json as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should handle AuthenticationError with 401 status', () => {
    const err = new AuthenticationError('Invalid token', {
      errorCode: 'AUTH_INVALID_TOKEN',
    });
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    expect(res._status).toBe(401);
    const body = res._json as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('should handle AuthorizationError with 403 status', () => {
    const err = new AuthorizationError('Forbidden');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    expect(res._status).toBe(403);
  });

  it('should handle NotFoundError with 404 status', () => {
    const err = new NotFoundError('Resource not found');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    expect(res._status).toBe(404);
  });

  it('should handle RateLimitError with 429 status', () => {
    const err = new RateLimitError('Too many requests');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    expect(res._status).toBe(429);
    const body = res._json as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('should include requestId in error response', () => {
    const err = new ValidationError('test');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    const body = res._json as { error: { requestId: string } };
    expect(body.error.requestId).toBe('req-123');
  });

  it('should include timestamp in error response', () => {
    const err = new ValidationError('test');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    const body = res._json as { error: { timestamp: string } };
    expect(body.error.timestamp).toBeDefined();
    expect(() => new Date(body.error.timestamp)).not.toThrow();
  });

  it('should include details from AppError', () => {
    const details = [{ field: 'name', message: 'required' }];
    const err = new ValidationError('test', { details });
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    const body = res._json as { error: { details: unknown } };
    expect(body.error.details).toEqual(details);
  });

  it('should handle unknown errors with 500 status', () => {
    const err = new Error('Something went wrong');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    expect(res._status).toBe(500);
    const body = res._json as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('should expose error message in development for unknown errors', () => {
    process.env['NODE_ENV'] = 'development';
    const err = new Error('Detailed internal message');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    const body = res._json as { error: { message: string } };
    expect(body.error.message).toBe('Detailed internal message');
  });

  it('should hide error message in production for unknown errors', () => {
    process.env['NODE_ENV'] = 'production';
    const err = new Error('Sensitive details');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    const body = res._json as { error: { message: string } };
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  it('should include stack trace in development for unknown errors', () => {
    process.env['NODE_ENV'] = 'development';
    const err = new Error('With stack');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    const body = res._json as { error: { details: { stack: string } } };
    expect(body.error.details).toBeDefined();
    expect((body.error.details as { stack: string }).stack).toContain('With stack');
  });

  it('should not include stack trace in production for unknown errors', () => {
    process.env['NODE_ENV'] = 'production';
    const err = new Error('No stack please');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    const body = res._json as { error: { details?: unknown } };
    expect(body.error.details).toBeUndefined();
  });

  it('should handle non-Error objects', () => {
    const err = 'string error';
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    expect(res._status).toBe(500);
    const body = res._json as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('should expose message for operational AppErrors even in production', () => {
    process.env['NODE_ENV'] = 'production';
    const err = new ValidationError('Email is required');
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(err, req, res, next);

    const body = res._json as { error: { message: string } };
    expect(body.error.message).toBe('Email is required');
  });
});
