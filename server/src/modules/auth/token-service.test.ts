/**
 * Tests for JWT token service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock config
const mockConfig = {
  JWT_SECRET: 'a'.repeat(32),
  JWT_ACCESS_TOKEN_TTL_SECONDS: 900,
  JWT_REFRESH_TOKEN_TTL_SECONDS: 604800,
};

vi.mock('../../shared/config/index.js', () => ({
  getConfig: () => mockConfig,
}));

// Mock Redis
const mockRedisStore: Record<string, string> = {};
const mockRedisTtl: Record<string, number> = {};

const mockRedis = {
  set: vi.fn(async (key: string, value: string, _mode?: string, ttl?: number) => {
    mockRedisStore[key] = value;
    if (ttl) mockRedisTtl[key] = ttl;
    return 'OK';
  }),
  get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
  del: vi.fn(async (key: string) => {
    delete mockRedisStore[key];
    return 1;
  }),
  ttl: vi.fn(async (key: string) => mockRedisTtl[key] ?? -1),
  scan: vi.fn(async () => ['0', []]),
};

vi.mock('../../infra/redis/index.js', () => ({
  getRedisClient: () => mockRedis,
}));

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
} = await import('./token-service.js');

describe('generateAccessToken', () => {
  it('should return a JWT string', () => {
    const token = generateAccessToken({
      userId: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      sessionId: 'session-1',
    });

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('should include correct claims', () => {
    const token = generateAccessToken({
      userId: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      sessionId: 'session-1',
    });

    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded['sub']).toBe('user-1');
    expect(decoded['email']).toBe('test@example.com');
    expect(decoded['username']).toBe('testuser');
    expect(decoded['type']).toBe('access');
    expect(decoded['jti']).toBeDefined();
    expect(decoded['iss']).toBe('sbobuz');
    expect(decoded['exp']).toBeDefined();
    expect(decoded['iat']).toBeDefined();
  });

  it('should set correct expiration (15 minutes from now)', () => {
    const token = generateAccessToken({
      userId: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      sessionId: 'session-1',
    });

    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(900);
  });

  it('should generate unique jti for each token', () => {
    const token1 = generateAccessToken({ userId: 'u1', email: 'a@b.com', username: 'u', sessionId: 's1' });
    const token2 = generateAccessToken({ userId: 'u1', email: 'a@b.com', username: 'u', sessionId: 's1' });

    const d1 = jwt.decode(token1) as { jti: string };
    const d2 = jwt.decode(token2) as { jti: string };
    expect(d1.jti).not.toBe(d2.jti);
  });
});

describe('verifyAccessToken', () => {
  it('should verify and return decoded payload', () => {
    const token = generateAccessToken({
      userId: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      sessionId: 'session-1',
    });

    const decoded = verifyAccessToken(token);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.username).toBe('testuser');
    expect(decoded.type).toBe('access');
  });

  it('should throw AUTH_TOKEN_EXPIRED for expired tokens', () => {
    const token = jwt.sign(
      { sub: 'user-1', type: 'access' },
      mockConfig.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -10, issuer: 'sbobuz' },
    );

    expect(() => verifyAccessToken(token)).toThrow(
      expect.objectContaining({ errorCode: 'AUTH_TOKEN_EXPIRED' }),
    );
  });

  it('should throw AUTH_INVALID_TOKEN for wrong secret', () => {
    const token = jwt.sign(
      { sub: 'user-1', type: 'access' },
      'wrong-secret-that-is-long-enough',
      { algorithm: 'HS256', expiresIn: 900, issuer: 'sbobuz' },
    );

    expect(() => verifyAccessToken(token)).toThrow(
      expect.objectContaining({ errorCode: 'AUTH_INVALID_TOKEN' }),
    );
  });

  it('should throw AUTH_INVALID_TOKEN for refresh token type', () => {
    const token = jwt.sign(
      { sub: 'user-1', type: 'refresh' },
      mockConfig.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: 900, issuer: 'sbobuz' },
    );

    expect(() => verifyAccessToken(token)).toThrow(
      expect.objectContaining({ errorCode: 'AUTH_INVALID_TOKEN' }),
    );
  });

  it('should throw AUTH_INVALID_TOKEN for malformed JWT', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow(
      expect.objectContaining({ errorCode: 'AUTH_INVALID_TOKEN' }),
    );
  });
});

describe('generateRefreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
    for (const key of Object.keys(mockRedisTtl)) delete mockRedisTtl[key];
  });

  it('should create a refresh token and store in Redis', async () => {
    const token = await generateRefreshToken('user-1', 'session-1');

    expect(token.tokenId).toBeDefined();
    expect(token.userId).toBe('user-1');
    expect(token.sessionId).toBe('session-1');
    expect(token.isUsed).toBe(false);
    expect(token.expiresAt).toBeDefined();

    expect(mockRedis.set).toHaveBeenCalledWith(
      `refresh:${token.tokenId}`,
      expect.any(String),
      'EX',
      604800,
    );
  });

  it('should generate unique token IDs', async () => {
    const t1 = await generateRefreshToken('user-1', 'session-1');
    const t2 = await generateRefreshToken('user-1', 'session-1');

    expect(t1.tokenId).not.toBe(t2.tokenId);
  });
});

describe('verifyRefreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
  });

  it('should return token when valid', async () => {
    const storedToken = {
      tokenId: 'tok-1',
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isUsed: false,
    };
    mockRedisStore['refresh:tok-1'] = JSON.stringify(storedToken);

    const result = await verifyRefreshToken('tok-1');

    expect(result.tokenId).toBe('tok-1');
    expect(result.isUsed).toBe(false);
  });

  it('should throw AUTH_REFRESH_INVALID when token not found', async () => {
    await expect(verifyRefreshToken('nonexistent')).rejects.toThrow(
      expect.objectContaining({ errorCode: 'AUTH_REFRESH_INVALID' }),
    );
  });

  it('should throw AUTH_REFRESH_INVALID when token is already used', async () => {
    const storedToken = {
      tokenId: 'tok-1',
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isUsed: true,
    };
    mockRedisStore['refresh:tok-1'] = JSON.stringify(storedToken);

    await expect(verifyRefreshToken('tok-1')).rejects.toThrow(
      expect.objectContaining({ errorCode: 'AUTH_REFRESH_INVALID' }),
    );
  });
});

describe('rotateRefreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
    for (const key of Object.keys(mockRedisTtl)) delete mockRedisTtl[key];
  });

  it('should mark old token as used and create new token', async () => {
    const oldToken = {
      tokenId: 'old-tok',
      userId: 'user-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isUsed: false,
    };
    mockRedisStore['refresh:old-tok'] = JSON.stringify(oldToken);
    mockRedisTtl['refresh:old-tok'] = 600000;

    const newToken = await rotateRefreshToken('old-tok', 'user-1', 'session-1');

    expect(newToken.tokenId).not.toBe('old-tok');
    expect(newToken.userId).toBe('user-1');
    expect(newToken.sessionId).toBe('session-1');
    expect(newToken.isUsed).toBe(false);

    // Old token should be marked as used
    const setCall = mockRedis.set.mock.calls.find(
      (call) => call[0] === 'refresh:old-tok',
    );
    expect(setCall).toBeDefined();
    const stored = JSON.parse(setCall![1] as string) as { isUsed: boolean };
    expect(stored.isUsed).toBe(true);
  });
});

describe('revokeRefreshToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should delete the token from Redis', async () => {
    await revokeRefreshToken('tok-1');

    expect(mockRedis.del).toHaveBeenCalledWith('refresh:tok-1');
  });
});

describe('revokeAllRefreshTokensForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
  });

  it('should scan and delete all refresh tokens for the user', async () => {
    const token1 = {
      tokenId: 'tok-1',
      userId: 'user-1',
      sessionId: 's-1',
      expiresAt: '',
      isUsed: false,
    };
    const token2 = {
      tokenId: 'tok-2',
      userId: 'user-2',
      sessionId: 's-2',
      expiresAt: '',
      isUsed: false,
    };

    mockRedisStore['refresh:tok-1'] = JSON.stringify(token1);
    mockRedisStore['refresh:tok-2'] = JSON.stringify(token2);

    mockRedis.scan.mockResolvedValueOnce(['0', ['refresh:tok-1', 'refresh:tok-2']]);

    await revokeAllRefreshTokensForUser('user-1', ['s-1']);

    expect(mockRedis.del).toHaveBeenCalledWith('refresh:tok-1');
    // Should NOT delete user-2's token
    expect(mockRedis.del).not.toHaveBeenCalledWith('refresh:tok-2');
  });
});
