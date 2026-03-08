/**
 * Tests for JWT authentication middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { createAuthMiddleware, optionalAuth } from './auth-middleware.js';

vi.mock('../logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../context.js', () => ({
  getContext: () => ({}),
  runWithContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

const JWT_SECRET = 'a'.repeat(32);

function createValidToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      type: 'access',
      jti: 'jti-123',
      ...overrides,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: 900,
      issuer: 'sbobuz',
    },
  );
}

function createMockReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['authorization'] = authHeader;
  }
  return {
    headers,
  } as unknown as Request;
}

function createMockRes(): Response {
  return {} as Response;
}

describe('createAuthMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it('should call next with AuthenticationError when Authorization header is missing', () => {
    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_REQUIRED',
        statusCode: 401,
      }),
    );
  });

  it('should call next with AuthenticationError when header format is wrong', () => {
    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq('Basic abc123');
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_REQUIRED',
      }),
    );
  });

  it('should call next with AuthenticationError when Bearer token is empty', () => {
    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq('Bearer');
    const res = createMockRes();

    middleware(req, res, next);

    // "Bearer" without a space+token -> split gives ["Bearer"], length 1, not 2
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_REQUIRED',
      }),
    );
  });

  it('should attach userId, username, and email to request on valid token', () => {
    const token = createValidToken();
    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();

    middleware(req, res, next);

    expect(req.userId).toBe('user-123');
    expect(req.username).toBe('testuser');
    expect(req.userEmail).toBe('test@example.com');
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next with AUTH_TOKEN_EXPIRED for expired tokens', () => {
    const token = jwt.sign(
      { sub: 'user-123', email: 'test@example.com', username: 'testuser', type: 'access', jti: 'jti-1' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -10, issuer: 'sbobuz' },
    );

    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_TOKEN_EXPIRED',
      }),
    );
  });

  it('should call next with AUTH_INVALID_TOKEN for wrong signature', () => {
    const token = jwt.sign(
      { sub: 'user-123', type: 'access' },
      'wrong-secret-that-is-long-enough',
      { algorithm: 'HS256', expiresIn: 900, issuer: 'sbobuz' },
    );

    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_INVALID_TOKEN',
      }),
    );
  });

  it('should call next with AUTH_INVALID_TOKEN for refresh token used as access', () => {
    const token = jwt.sign(
      { sub: 'user-123', type: 'refresh', jti: 'jti-1' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: 900, issuer: 'sbobuz' },
    );

    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_INVALID_TOKEN',
      }),
    );
  });

  it('should call next with AUTH_INVALID_TOKEN for wrong issuer', () => {
    const token = jwt.sign(
      { sub: 'user-123', type: 'access' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: 900, issuer: 'wrong-issuer' },
    );

    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_INVALID_TOKEN',
      }),
    );
  });

  it('should call next with AUTH_INVALID_TOKEN for malformed JWT', () => {
    const middleware = createAuthMiddleware(JWT_SECRET);
    const req = createMockReq('Bearer not.a.valid.jwt');
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'AUTH_INVALID_TOKEN',
      }),
    );
  });
});

describe('optionalAuth', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it('should call next without error when no Authorization header', () => {
    const middleware = optionalAuth(JWT_SECRET);
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.userId).toBeUndefined();
  });

  it('should attach user info when valid token is present', () => {
    const token = createValidToken();
    const middleware = optionalAuth(JWT_SECRET);
    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();

    middleware(req, res, next);

    expect(req.userId).toBe('user-123');
    expect(req.username).toBe('testuser');
    expect(next).toHaveBeenCalledWith();
  });

  it('should proceed without user info when token is invalid', () => {
    const middleware = optionalAuth(JWT_SECRET);
    const req = createMockReq('Bearer invalid-token');
    const res = createMockRes();

    middleware(req, res, next);

    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('should proceed without user info when token is expired', () => {
    const token = jwt.sign(
      { sub: 'user-123', type: 'access' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -10, issuer: 'sbobuz' },
    );

    const middleware = optionalAuth(JWT_SECRET);
    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();

    middleware(req, res, next);

    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
