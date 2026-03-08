/**
 * Tests for Redis-backed session service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../../shared/config/index.js', () => ({
  getConfig: () => ({
    JWT_REFRESH_TOKEN_TTL_SECONDS: 604800,
  }),
}));

// Mock Redis
const mockRedisStore: Record<string, string> = {};
const mockRedisTtl: Record<string, number> = {};
const mockRedisSets: Record<string, Set<string>> = {};

const mockRedis = {
  set: vi.fn(async (key: string, value: string, _mode?: string, ttl?: number) => {
    mockRedisStore[key] = value;
    if (ttl) mockRedisTtl[key] = ttl;
    return 'OK';
  }),
  get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
  del: vi.fn(async (key: string) => {
    delete mockRedisStore[key];
    delete mockRedisSets[key];
    return 1;
  }),
  ttl: vi.fn(async (key: string) => mockRedisTtl[key] ?? -1),
  sadd: vi.fn(async (key: string, ...members: string[]) => {
    if (!mockRedisSets[key]) mockRedisSets[key] = new Set();
    for (const m of members) mockRedisSets[key]!.add(m);
    return members.length;
  }),
  srem: vi.fn(async (key: string, ...members: string[]) => {
    if (!mockRedisSets[key]) return 0;
    for (const m of members) mockRedisSets[key]!.delete(m);
    return members.length;
  }),
  smembers: vi.fn(async (key: string) => {
    return mockRedisSets[key] ? Array.from(mockRedisSets[key]!) : [];
  }),
  expire: vi.fn(async () => 1),
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
  createSession,
  getSession,
  revokeSession,
  revokeAllSessions,
  getUserSessionIds,
  isSessionValid,
} = await import('./session-service.js');

function clearStore(): void {
  for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
  for (const key of Object.keys(mockRedisTtl)) delete mockRedisTtl[key];
  for (const key of Object.keys(mockRedisSets)) delete mockRedisSets[key];
}

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore();
  });

  it('should create a session in Redis', async () => {
    const sessionId = await createSession('user-1', {
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
    });

    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');

    expect(mockRedis.set).toHaveBeenCalledWith(
      `session:${sessionId}`,
      expect.any(String),
      'EX',
      604800,
    );
  });

  it('should add sessionId to user sessions set', async () => {
    const sessionId = await createSession('user-1', {
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
    });

    expect(mockRedis.sadd).toHaveBeenCalledWith('user_sessions:user-1', sessionId);
  });

  it('should derive web platform from Chrome user agent', async () => {
    await createSession('user-1', {
      userAgent: 'Mozilla/5.0 (X11; Linux) Chrome/120.0',
      ipAddress: '10.0.0.1',
    });

    const setCall = mockRedis.set.mock.calls[0];
    const session = JSON.parse(setCall![1] as string) as { deviceInfo: { platform: string } };
    expect(session.deviceInfo.platform).toBe('web');
  });

  it('should derive mobile platform from mobile user agent', async () => {
    await createSession('user-1', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS) Mobile',
      ipAddress: '10.0.0.1',
    });

    const setCall = mockRedis.set.mock.calls[0];
    const session = JSON.parse(setCall![1] as string) as { deviceInfo: { platform: string } };
    expect(session.deviceInfo.platform).toBe('mobile');
  });

  it('should truncate user agent to 512 chars', async () => {
    const longUA = 'x'.repeat(600);
    await createSession('user-1', {
      userAgent: longUA,
      ipAddress: '10.0.0.1',
    });

    const setCall = mockRedis.set.mock.calls[0];
    const session = JSON.parse(setCall![1] as string) as { deviceInfo: { userAgent: string } };
    expect(session.deviceInfo.userAgent.length).toBe(512);
  });

  it('should set TTL on user sessions set', async () => {
    await createSession('user-1', {
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
    });

    expect(mockRedis.expire).toHaveBeenCalledWith('user_sessions:user-1', 604800);
  });

  it('should store isRevoked as false', async () => {
    const sessionId = await createSession('user-1', {
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
    });

    const setCall = mockRedis.set.mock.calls[0];
    const session = JSON.parse(setCall![1] as string) as { isRevoked: boolean };
    expect(session.isRevoked).toBe(false);
  });
});

describe('getSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore();
  });

  it('should return session when found', async () => {
    const sessionData = {
      sessionId: 'sess-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isRevoked: false,
    };
    mockRedisStore['session:sess-1'] = JSON.stringify(sessionData);

    const session = await getSession('sess-1');

    expect(session).toBeDefined();
    expect(session?.sessionId).toBe('sess-1');
    expect(session?.userId).toBe('user-1');
    expect(session?.isRevoked).toBe(false);
  });

  it('should return undefined when not found', async () => {
    const session = await getSession('nonexistent');
    expect(session).toBeUndefined();
  });
});

describe('revokeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore();
  });

  it('should set isRevoked to true', async () => {
    const sessionData = {
      sessionId: 'sess-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isRevoked: false,
    };
    mockRedisStore['session:sess-1'] = JSON.stringify(sessionData);
    mockRedisTtl['session:sess-1'] = 604800;

    await revokeSession('sess-1');

    const setCall = mockRedis.set.mock.calls[0];
    const updated = JSON.parse(setCall![1] as string) as { isRevoked: boolean };
    expect(updated.isRevoked).toBe(true);
  });

  it('should remove sessionId from user sessions set', async () => {
    const sessionData = {
      sessionId: 'sess-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isRevoked: false,
    };
    mockRedisStore['session:sess-1'] = JSON.stringify(sessionData);
    mockRedisTtl['session:sess-1'] = 604800;

    await revokeSession('sess-1');

    expect(mockRedis.srem).toHaveBeenCalledWith('user_sessions:user-1', 'sess-1');
  });

  it('should handle already-expired session gracefully', async () => {
    // Session not in Redis (expired)
    await revokeSession('expired-session');

    // Should not throw
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});

describe('revokeAllSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore();
  });

  it('should revoke all sessions for a user', async () => {
    const sess1 = {
      sessionId: 'sess-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isRevoked: false,
    };
    const sess2 = {
      ...sess1,
      sessionId: 'sess-2',
    };

    mockRedisStore['session:sess-1'] = JSON.stringify(sess1);
    mockRedisStore['session:sess-2'] = JSON.stringify(sess2);
    mockRedisTtl['session:sess-1'] = 604800;
    mockRedisTtl['session:sess-2'] = 604800;
    mockRedisSets['user_sessions:user-1'] = new Set(['sess-1', 'sess-2']);

    await revokeAllSessions('user-1');

    // Both sessions should be revoked
    const setCalls = mockRedis.set.mock.calls;
    expect(setCalls.length).toBe(2);

    for (const call of setCalls) {
      const stored = JSON.parse(call[1] as string) as { isRevoked: boolean };
      expect(stored.isRevoked).toBe(true);
    }

    // User sessions set should be deleted
    expect(mockRedis.del).toHaveBeenCalledWith('user_sessions:user-1');
  });
});

describe('getUserSessionIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore();
  });

  it('should return session IDs for user', async () => {
    mockRedisSets['user_sessions:user-1'] = new Set(['sess-1', 'sess-2']);

    const ids = await getUserSessionIds('user-1');

    expect(ids).toHaveLength(2);
    expect(ids).toContain('sess-1');
    expect(ids).toContain('sess-2');
  });

  it('should return empty array when user has no sessions', async () => {
    const ids = await getUserSessionIds('user-no-sessions');
    expect(ids).toHaveLength(0);
  });
});

describe('isSessionValid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore();
  });

  it('should return true for valid non-revoked session', async () => {
    const sessionData = {
      sessionId: 'sess-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isRevoked: false,
    };
    mockRedisStore['session:sess-1'] = JSON.stringify(sessionData);

    const valid = await isSessionValid('sess-1');
    expect(valid).toBe(true);
  });

  it('should return false for revoked session', async () => {
    const sessionData = {
      sessionId: 'sess-1',
      userId: 'user-1',
      deviceInfo: { userAgent: 'test', ipAddress: '127.0.0.1', platform: 'web' },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isRevoked: true,
    };
    mockRedisStore['session:sess-1'] = JSON.stringify(sessionData);

    const valid = await isSessionValid('sess-1');
    expect(valid).toBe(false);
  });

  it('should return false for nonexistent session', async () => {
    const valid = await isSessionValid('nonexistent');
    expect(valid).toBe(false);
  });
});
