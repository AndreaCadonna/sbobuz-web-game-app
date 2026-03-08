/**
 * Tests for auth module handlers.
 *
 * Mocks: repository, token-service, session-service, bcryptjs, Redis, config.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ---- Mock config ----
const mockConfig = {
  JWT_SECRET: 'a'.repeat(32),
  JWT_ACCESS_TOKEN_TTL_SECONDS: 900,
  JWT_REFRESH_TOKEN_TTL_SECONDS: 604800,
  BCRYPT_COST_FACTOR: 12,
  NODE_ENV: 'development',
};

vi.mock('../../shared/config/index.js', () => ({
  getConfig: () => mockConfig,
}));

// ---- Mock logger ----
vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---- Mock Redis ----
const mockRedisStore: Record<string, string> = {};
const mockRedis = {
  pipeline: vi.fn(() => ({
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => [
      [null, 0],  // zremrangebyscore
      [null, 0],  // zcard - 0 attempts
      [null, 1],  // zadd
      [null, 1],  // pexpire
    ]),
  })),
  zadd: vi.fn(async () => 1),
  pexpire: vi.fn(async () => 1),
  del: vi.fn(async () => 1),
  get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
  set: vi.fn(async (key: string, value: string) => {
    mockRedisStore[key] = value;
    return 'OK';
  }),
};

vi.mock('../../infra/redis/index.js', () => ({
  getRedisClient: () => mockRedis,
}));

// ---- Mock bcryptjs ----
const mockBcrypt = {
  hash: vi.fn(async () => '$2a$12$hashedpassword'),
  compare: vi.fn(async () => true),
};

vi.mock('bcryptjs', () => ({
  default: {
    hash: (...args: unknown[]) => mockBcrypt.hash(...args),
    compare: (...args: unknown[]) => mockBcrypt.compare(...args),
  },
}));

// ---- Mock repository ----
const mockRepo = {
  createUser: vi.fn(),
  findUserById: vi.fn(),
  findUserWithCredentials: vi.fn(),
  userExistsByEmail: vi.fn(),
  userExistsByUsername: vi.fn(),
};

vi.mock('./repository.js', () => ({
  createUser: (...args: unknown[]) => mockRepo.createUser(...args),
  findUserById: (...args: unknown[]) => mockRepo.findUserById(...args),
  findUserWithCredentials: (...args: unknown[]) => mockRepo.findUserWithCredentials(...args),
  userExistsByEmail: (...args: unknown[]) => mockRepo.userExistsByEmail(...args),
  userExistsByUsername: (...args: unknown[]) => mockRepo.userExistsByUsername(...args),
}));

// ---- Mock token service ----
const mockTokenService = {
  generateAccessToken: vi.fn(() => 'mock-access-token'),
  generateRefreshToken: vi.fn(async () => ({
    tokenId: 'mock-refresh-token-id',
    userId: 'user-1',
    sessionId: 'session-1',
    expiresAt: new Date(Date.now() + 604800000).toISOString(),
    isUsed: false,
  })),
  verifyRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(async () => ({
    tokenId: 'new-refresh-token-id',
    userId: 'user-1',
    sessionId: 'session-1',
    expiresAt: new Date(Date.now() + 604800000).toISOString(),
    isUsed: false,
  })),
  revokeRefreshToken: vi.fn(async () => undefined),
  revokeAllRefreshTokensForUser: vi.fn(async () => undefined),
};

vi.mock('./token-service.js', () => ({
  generateAccessToken: (...args: unknown[]) => mockTokenService.generateAccessToken(...args),
  generateRefreshToken: (...args: unknown[]) => mockTokenService.generateRefreshToken(...args),
  verifyRefreshToken: (...args: unknown[]) => mockTokenService.verifyRefreshToken(...args),
  rotateRefreshToken: (...args: unknown[]) => mockTokenService.rotateRefreshToken(...args),
  revokeRefreshToken: (...args: unknown[]) => mockTokenService.revokeRefreshToken(...args),
  revokeAllRefreshTokensForUser: (...args: unknown[]) => mockTokenService.revokeAllRefreshTokensForUser(...args),
}));

// ---- Mock session service ----
const mockSessionService = {
  createSession: vi.fn(async () => 'session-1'),
  getSession: vi.fn(),
  revokeSession: vi.fn(async () => undefined),
  revokeAllSessions: vi.fn(async () => undefined),
};

vi.mock('./session-service.js', () => ({
  createSession: (...args: unknown[]) => mockSessionService.createSession(...args),
  getSession: (...args: unknown[]) => mockSessionService.getSession(...args),
  revokeSession: (...args: unknown[]) => mockSessionService.revokeSession(...args),
  revokeAllSessions: (...args: unknown[]) => mockSessionService.revokeAllSessions(...args),
}));

// ---- Import handlers and schemas after mocks ----
const { register, login, refresh, logout, me } = await import('./handlers.js');
const { registerSchema, loginSchema } = await import('./schemas.js');

// ---- Helper: create mock request ----
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

// ---- Helper: create mock response ----
function createMockResponse(): Response & {
  _status: number;
  _json: unknown;
  _cookies: Record<string, { value: string; options: Record<string, unknown> }>;
  _clearedCookies: string[];
  _ended: boolean;
} {
  const res = {
    _status: 200,
    _json: undefined as unknown,
    _cookies: {} as Record<string, { value: string; options: Record<string, unknown> }>,
    _clearedCookies: [] as string[],
    _ended: false,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    cookie(name: string, value: string, options: Record<string, unknown>) {
      res._cookies[name] = { value, options };
      return res;
    },
    clearCookie(name: string, _options: Record<string, unknown>) {
      res._clearedCookies.push(name);
      return res;
    },
    end() {
      res._ended = true;
      return res;
    },
    getHeader: vi.fn(() => 'test-request-id'),
  };
  return res as unknown as Response & typeof res;
}

// ---- Default test user ----
const testUser = {
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  displayName: 'testuser',
  avatarUrl: null,
  status: 'active' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const testUserWithCreds = {
  ...testUser,
  passwordHash: '$2a$12$realhash',
};

// ---- Reset mocks ----
beforeEach(() => {
  vi.clearAllMocks();

  // Clear Redis store
  for (const key of Object.keys(mockRedisStore)) {
    delete mockRedisStore[key];
  }

  // Reset pipeline to return 0 attempts by default
  mockRedis.pipeline.mockReturnValue({
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => [
      [null, 0],
      [null, 0],
      [null, 1],
      [null, 1],
    ]),
  });
});

// =========================================================================
// REGISTER
// =========================================================================

describe('register handler', () => {
  it('creates a user and returns 201 with tokens', async () => {
    mockRepo.userExistsByEmail.mockResolvedValue(false);
    mockRepo.userExistsByUsername.mockResolvedValue(false);
    mockRepo.createUser.mockResolvedValue(testUser);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1', username: 'testuser' },
    });
    const res = createMockResponse();

    await register(req, res);

    expect(res._status).toBe(201);
    expect(res._json).toEqual({
      success: true,
      data: {
        accessToken: 'mock-access-token',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          username: 'testuser',
          displayName: 'testuser',
        },
      },
    });

    // Refresh cookie set
    expect(res._cookies['refreshToken']).toBeDefined();
    expect(res._cookies['refreshToken'].options['httpOnly']).toBe(true);
    expect(res._cookies['refreshToken'].options['sameSite']).toBe('strict');
  });

  it('stores username lowercase, displayName preserves case', async () => {
    mockRepo.userExistsByEmail.mockResolvedValue(false);
    mockRepo.userExistsByUsername.mockResolvedValue(false);
    mockRepo.createUser.mockResolvedValue(testUser);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1', username: 'TestUser' },
    });
    const res = createMockResponse();

    await register(req, res);

    // createUser called with lowercase username, original displayName
    expect(mockRepo.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'testuser',
        displayName: 'TestUser',
      }),
    );
  });

  it('hashes password with configured cost factor', async () => {
    mockRepo.userExistsByEmail.mockResolvedValue(false);
    mockRepo.userExistsByUsername.mockResolvedValue(false);
    mockRepo.createUser.mockResolvedValue(testUser);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1', username: 'testuser' },
    });
    const res = createMockResponse();

    await register(req, res);

    expect(mockBcrypt.hash).toHaveBeenCalledWith('Password1', 12);
  });

  it('throws ConflictError for duplicate email', async () => {
    mockRepo.userExistsByEmail.mockResolvedValue(true);
    mockRepo.userExistsByUsername.mockResolvedValue(false);

    const req = createMockRequest({
      body: { email: 'taken@example.com', password: 'Password1', username: 'newuser' },
    });
    const res = createMockResponse();

    await expect(register(req, res)).rejects.toThrow('Email is already registered');
  });

  it('throws ConflictError for duplicate username', async () => {
    mockRepo.userExistsByEmail.mockResolvedValue(false);
    mockRepo.userExistsByUsername.mockResolvedValue(true);

    const req = createMockRequest({
      body: { email: 'new@example.com', password: 'Password1', username: 'taken' },
    });
    const res = createMockResponse();

    await expect(register(req, res)).rejects.toThrow('Username is already taken');
  });

  it('creates a session with device info', async () => {
    mockRepo.userExistsByEmail.mockResolvedValue(false);
    mockRepo.userExistsByUsername.mockResolvedValue(false);
    mockRepo.createUser.mockResolvedValue(testUser);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1', username: 'testuser' },
      headers: { 'user-agent': 'Mozilla/5.0' },
      ip: '10.0.0.1',
    });
    const res = createMockResponse();

    await register(req, res);

    expect(mockSessionService.createSession).toHaveBeenCalledWith(
      'user-1',
      { userAgent: 'Mozilla/5.0', ipAddress: '10.0.0.1' },
    );
  });

  it('includes sessionId in access token payload', async () => {
    mockRepo.userExistsByEmail.mockResolvedValue(false);
    mockRepo.userExistsByUsername.mockResolvedValue(false);
    mockRepo.createUser.mockResolvedValue(testUser);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1', username: 'testuser' },
    });
    const res = createMockResponse();

    await register(req, res);

    expect(mockTokenService.generateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
      }),
    );
  });
});

// =========================================================================
// LOGIN
// =========================================================================

describe('login handler', () => {
  it('authenticates a valid user and returns 200 with tokens', async () => {
    mockRepo.findUserWithCredentials.mockResolvedValue(testUserWithCreds);
    mockBcrypt.compare.mockResolvedValue(true);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1' },
    });
    const res = createMockResponse();

    await login(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({
      success: true,
      data: {
        accessToken: 'mock-access-token',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          username: 'testuser',
          displayName: 'testuser',
        },
      },
    });
    expect(res._cookies['refreshToken']).toBeDefined();
  });

  it('throws AuthenticationError for nonexistent email', async () => {
    mockRepo.findUserWithCredentials.mockResolvedValue(undefined);
    mockBcrypt.compare.mockResolvedValue(false); // dummy hash compare

    const req = createMockRequest({
      body: { email: 'nonexistent@example.com', password: 'Password1' },
    });
    const res = createMockResponse();

    await expect(login(req, res)).rejects.toThrow('Invalid credentials');

    // Should still do a bcrypt compare (constant-time)
    expect(mockBcrypt.compare).toHaveBeenCalled();
    // Should record failed attempt
    expect(mockRedis.zadd).toHaveBeenCalled();
  });

  it('throws AuthenticationError for wrong password', async () => {
    mockRepo.findUserWithCredentials.mockResolvedValue(testUserWithCreds);
    mockBcrypt.compare.mockResolvedValue(false);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'WrongPassword1' },
    });
    const res = createMockResponse();

    await expect(login(req, res)).rejects.toThrow('Invalid credentials');
    expect(mockRedis.zadd).toHaveBeenCalled();
  });

  it('throws AuthorizationError for banned user', async () => {
    const bannedUser = { ...testUserWithCreds, status: 'banned' as const };
    mockRepo.findUserWithCredentials.mockResolvedValue(bannedUser);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1' },
    });
    const res = createMockResponse();

    await expect(login(req, res)).rejects.toThrow('Account has been banned');
  });

  it('throws AuthorizationError for suspended user', async () => {
    const suspendedUser = { ...testUserWithCreds, status: 'suspended' as const };
    mockRepo.findUserWithCredentials.mockResolvedValue(suspendedUser);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1' },
    });
    const res = createMockResponse();

    await expect(login(req, res)).rejects.toThrow('Account has been suspended');
  });

  it('clears login rate limit on success', async () => {
    mockRepo.findUserWithCredentials.mockResolvedValue(testUserWithCreds);
    mockBcrypt.compare.mockResolvedValue(true);

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1' },
    });
    const res = createMockResponse();

    await login(req, res);

    expect(mockRedis.del).toHaveBeenCalledWith('login_attempts:test@example.com');
  });

  it('throws when login rate limit is exceeded', async () => {
    // Mock pipeline to return 5+ attempts
    mockRedis.pipeline.mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => [
        [null, 0],
        [null, 5],  // 5 attempts = at limit
        [null, 1],
        [null, 1],
      ]),
    });

    const req = createMockRequest({
      body: { email: 'test@example.com', password: 'Password1' },
    });
    const res = createMockResponse();

    await expect(login(req, res)).rejects.toThrow('Too many login attempts');
  });

  it('performs constant-time comparison when user not found', async () => {
    mockRepo.findUserWithCredentials.mockResolvedValue(undefined);
    mockBcrypt.compare.mockResolvedValue(false);

    const req = createMockRequest({
      body: { email: 'ghost@example.com', password: 'Password1' },
    });
    const res = createMockResponse();

    await expect(login(req, res)).rejects.toThrow('Invalid credentials');

    // bcrypt.compare should be called even when user not found
    expect(mockBcrypt.compare).toHaveBeenCalledWith(
      'Password1',
      expect.stringContaining('$2a$12$'),
    );
  });
});

// =========================================================================
// REFRESH
// =========================================================================

describe('refresh handler', () => {
  it('rotates token and returns new access token', async () => {
    const existingToken = {
      tokenId: 'old-token-id',
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isUsed: false,
    };

    mockTokenService.verifyRefreshToken.mockResolvedValue(existingToken);
    mockSessionService.getSession.mockResolvedValue({
      sessionId: 'session-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isRevoked: false,
    });
    mockRepo.findUserById.mockResolvedValue(testUser);

    const req = createMockRequest({
      cookies: { refreshToken: 'old-token-id' },
    });
    const res = createMockResponse();

    await refresh(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({
      success: true,
      data: {
        accessToken: 'mock-access-token',
      },
    });
    expect(res._cookies['refreshToken']).toBeDefined();
    expect(res._cookies['refreshToken'].value).toBe('new-refresh-token-id');
  });

  it('throws when refresh token cookie is missing', async () => {
    const req = createMockRequest({ cookies: {} });
    const res = createMockResponse();

    await expect(refresh(req, res)).rejects.toThrow('Refresh token required');
  });

  it('throws when refresh token is invalid', async () => {
    const { AuthenticationError } = await import('../../shared/errors/index.js');
    mockTokenService.verifyRefreshToken.mockRejectedValue(
      new AuthenticationError('Invalid refresh token', { errorCode: 'AUTH_REFRESH_INVALID' }),
    );

    const req = createMockRequest({
      cookies: { refreshToken: 'invalid-token' },
    });
    const res = createMockResponse();

    await expect(refresh(req, res)).rejects.toThrow('Invalid refresh token');
  });

  it('revokes all sessions on token reuse detection', async () => {
    const { AuthenticationError } = await import('../../shared/errors/index.js');
    mockTokenService.verifyRefreshToken.mockRejectedValue(
      new AuthenticationError('Token reuse detected', { errorCode: 'AUTH_REFRESH_INVALID' }),
    );

    // Store the used token in mock Redis so the handler can extract userId
    mockRedisStore['refresh:reused-token'] = JSON.stringify({
      tokenId: 'reused-token',
      userId: 'user-1',
      sessionId: 'session-1',
      isUsed: true,
    });
    mockRedis.get.mockImplementation(async (key: string) => mockRedisStore[key] ?? null);

    const req = createMockRequest({
      cookies: { refreshToken: 'reused-token' },
    });
    const res = createMockResponse();

    await expect(refresh(req, res)).rejects.toThrow('Token reuse detected');

    expect(mockSessionService.revokeAllSessions).toHaveBeenCalledWith('user-1');
    expect(mockTokenService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith('user-1', []);
  });

  it('throws when session is revoked', async () => {
    const existingToken = {
      tokenId: 'old-token-id',
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isUsed: false,
    };

    mockTokenService.verifyRefreshToken.mockResolvedValue(existingToken);
    mockSessionService.getSession.mockResolvedValue({
      sessionId: 'session-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isRevoked: true,
    });

    const req = createMockRequest({
      cookies: { refreshToken: 'old-token-id' },
    });
    const res = createMockResponse();

    await expect(refresh(req, res)).rejects.toThrow('Session expired or revoked');
  });

  it('throws when session is not found', async () => {
    const existingToken = {
      tokenId: 'old-token-id',
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isUsed: false,
    };

    mockTokenService.verifyRefreshToken.mockResolvedValue(existingToken);
    mockSessionService.getSession.mockResolvedValue(undefined);

    const req = createMockRequest({
      cookies: { refreshToken: 'old-token-id' },
    });
    const res = createMockResponse();

    await expect(refresh(req, res)).rejects.toThrow('Session expired or revoked');
  });

  it('throws when user is not active', async () => {
    const existingToken = {
      tokenId: 'old-token-id',
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isUsed: false,
    };

    mockTokenService.verifyRefreshToken.mockResolvedValue(existingToken);
    mockSessionService.getSession.mockResolvedValue({
      sessionId: 'session-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isRevoked: false,
    });
    mockRepo.findUserById.mockResolvedValue({ ...testUser, status: 'banned' });

    const req = createMockRequest({
      cookies: { refreshToken: 'old-token-id' },
    });
    const res = createMockResponse();

    await expect(refresh(req, res)).rejects.toThrow('Account is not active');
  });

  it('throws when user is not found', async () => {
    const existingToken = {
      tokenId: 'old-token-id',
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isUsed: false,
    };

    mockTokenService.verifyRefreshToken.mockResolvedValue(existingToken);
    mockSessionService.getSession.mockResolvedValue({
      sessionId: 'session-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      isRevoked: false,
    });
    mockRepo.findUserById.mockResolvedValue(undefined);

    const req = createMockRequest({
      cookies: { refreshToken: 'old-token-id' },
    });
    const res = createMockResponse();

    await expect(refresh(req, res)).rejects.toThrow('Account is not active');
  });
});

// =========================================================================
// LOGOUT
// =========================================================================

describe('logout handler', () => {
  it('revokes session, clears cookie, returns 204', async () => {
    const req = createMockRequest({
      userId: 'user-1',
      sessionId: 'session-1',
      cookies: { refreshToken: 'token-id' },
    } as unknown as Partial<Request>);
    const res = createMockResponse();

    await logout(req, res);

    expect(res._status).toBe(204);
    expect(res._ended).toBe(true);
    expect(mockSessionService.revokeSession).toHaveBeenCalledWith('session-1');
    expect(mockTokenService.revokeRefreshToken).toHaveBeenCalledWith('token-id');
    expect(res._clearedCookies).toContain('refreshToken');
  });

  it('throws AuthenticationError when not authenticated', async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await expect(logout(req, res)).rejects.toThrow('Authentication required');
  });

  it('handles missing refresh cookie gracefully', async () => {
    const req = createMockRequest({
      userId: 'user-1',
      sessionId: 'session-1',
      cookies: {},
    } as unknown as Partial<Request>);
    const res = createMockResponse();

    await logout(req, res);

    expect(res._status).toBe(204);
    expect(mockTokenService.revokeRefreshToken).not.toHaveBeenCalled();
  });
});

// =========================================================================
// ME
// =========================================================================

describe('me handler', () => {
  it('returns the authenticated user profile', async () => {
    mockRepo.findUserById.mockResolvedValue(testUser);

    const req = createMockRequest({
      userId: 'user-1',
    } as unknown as Partial<Request>);
    const res = createMockResponse();

    await me(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({
      success: true,
      data: {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'testuser',
      },
    });
  });

  it('throws AuthenticationError when not authenticated', async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await expect(me(req, res)).rejects.toThrow('Authentication required');
  });

  it('throws NotFoundError when user not in database', async () => {
    mockRepo.findUserById.mockResolvedValue(undefined);

    const req = createMockRequest({
      userId: 'deleted-user',
    } as unknown as Partial<Request>);
    const res = createMockResponse();

    await expect(me(req, res)).rejects.toThrow('User not found');
  });
});

// =========================================================================
// SCHEMAS
// =========================================================================

describe('auth schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid input', () => {
      const result = registerSchema.safeParse({
        email: 'Test@Example.COM',
        username: 'valid_user1',
        password: 'Password1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com'); // lowercased
      }
    });

    it('rejects invalid email', () => {
      const result = registerSchema.safeParse({
        email: 'not-an-email',
        username: 'validuser',
        password: 'Password1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short username', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'ab',
        password: 'Password1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects username with special characters', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'user name!',
        password: 'Password1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects reserved username', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'Admin',
        password: 'Password1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects reserved username case-insensitive', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'SYSTEM',
        password: 'Password1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects password without uppercase', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'validuser',
        password: 'password1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects password without lowercase', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'validuser',
        password: 'PASSWORD1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects password without digit', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'validuser',
        password: 'PasswordOnly',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'validuser',
        password: 'Pass1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects email exceeding 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@b.com';
      const result = registerSchema.safeParse({
        email: longEmail,
        username: 'validuser',
        password: 'Password1',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('accepts valid input', () => {
      const result = loginSchema.safeParse({
        email: 'Test@Example.COM',
        password: 'anything',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-email',
        password: 'anything',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty password', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
