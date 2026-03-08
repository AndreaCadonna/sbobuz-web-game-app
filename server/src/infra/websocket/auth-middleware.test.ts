/**
 * Tests for the Socket.IO authentication middleware.
 *
 * @see docs/specs/realtime-module.md Section 5.1 (Authentication)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyAccessToken = vi.fn();

vi.mock('../../modules/auth/token-service.js', () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
}));

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { socketAuthMiddleware } from './auth-middleware.js';

function createMockSocket(auth?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'socket-123',
    handshake: {
      auth: auth ?? {},
      address: '127.0.0.1',
      headers: {},
    },
    data: {} as Record<string, unknown>,
  };
}

describe('socketAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject connection when no token is provided', () => {
    const socket = createMockSocket();
    const next = vi.fn();

    socketAuthMiddleware(socket as never, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]![0] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Authentication required');
    expect((err as Record<string, unknown>)['data']).toEqual({
      code: 'AUTH_FAILED',
      message: 'Authentication required',
    });
  });

  it('should reject connection when token is empty string', () => {
    const socket = createMockSocket({ token: '' });
    const next = vi.fn();

    socketAuthMiddleware(socket as never, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]![0] as Error;
    expect(err).toBeInstanceOf(Error);
  });

  it('should authenticate and attach user data on valid token', () => {
    mockVerifyAccessToken.mockReturnValue({
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      sessionId: 'session-456',
      iat: 1000,
      exp: 2000,
      type: 'access',
      jti: 'jti-789',
      iss: 'sbobuz',
    });

    const socket = createMockSocket({ token: 'valid-jwt-token' });
    const next = vi.fn();

    socketAuthMiddleware(socket as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockVerifyAccessToken).toHaveBeenCalledWith('valid-jwt-token');

    const data = (socket as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['userId']).toBe('user-123');
    expect(data['username']).toBe('testuser');
    expect(data['email']).toBe('test@example.com');
    expect(data['sessionId']).toBe('session-456');
    expect(data['connectedAt']).toBeDefined();
  });

  it('should reject connection when token verification fails', () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error('Invalid access token');
    });

    const socket = createMockSocket({ token: 'invalid-token' });
    const next = vi.fn();

    socketAuthMiddleware(socket as never, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]![0] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Invalid access token');
    expect((err as Record<string, unknown>)['data']).toEqual({
      code: 'AUTH_FAILED',
      message: 'Invalid access token',
    });
  });

  it('should reject connection when token is expired', () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error('Access token expired');
    });

    const socket = createMockSocket({ token: 'expired-token' });
    const next = vi.fn();

    socketAuthMiddleware(socket as never, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]![0] as Error;
    expect((err as Record<string, unknown>)['data']).toEqual({
      code: 'AUTH_FAILED',
      message: 'Access token expired',
    });
  });

  it('should set connectedAt to ISO timestamp', () => {
    const before = Date.now();

    mockVerifyAccessToken.mockReturnValue({
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      sessionId: 'session-456',
      iat: 1000,
      exp: 2000,
      type: 'access',
      jti: 'jti-789',
      iss: 'sbobuz',
    });

    const socket = createMockSocket({ token: 'valid-token' });
    const next = vi.fn();

    socketAuthMiddleware(socket as never, next);

    const data = (socket as Record<string, unknown>)['data'] as Record<string, unknown>;
    const connectedAt = new Date(data['connectedAt'] as string).getTime();
    expect(connectedAt).toBeGreaterThanOrEqual(before);
    expect(connectedAt).toBeLessThanOrEqual(Date.now());
  });

  it('should handle non-Error exceptions gracefully', () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw 'string error'; // eslint-disable-line no-throw-literal
    });

    const socket = createMockSocket({ token: 'bad-token' });
    const next = vi.fn();

    socketAuthMiddleware(socket as never, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]![0] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Authentication failed');
  });
});
