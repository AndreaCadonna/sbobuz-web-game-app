/**
 * Tests for the Presence Manager.
 *
 * @see docs/specs/realtime-module.md Section 5.5 (Disconnect and Grace Period)
 * @see docs/specs/realtime-module.md Section 5.6 (State Rehydration on Reconnect)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock Redis ---
const mockRedisStore: Record<string, string> = {};
const mockRedisHashes: Record<string, Record<string, string>> = {};

const mockPipelineOps: Array<{ op: string; args: unknown[] }> = [];

const mockPipeline = {
  hset: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'hset', args });
    return mockPipeline;
  }),
  hdel: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'hdel', args });
    return mockPipeline;
  }),
  set: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'set', args });
    return mockPipeline;
  }),
  del: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'del', args });
    return mockPipeline;
  }),
  exec: vi.fn(async () => {
    for (const op of mockPipelineOps) {
      if (op.op === 'hset') {
        const key = op.args[0] as string;
        const field = op.args[1] as string;
        const value = op.args[2] as string;
        if (!mockRedisHashes[key]) mockRedisHashes[key] = {};
        mockRedisHashes[key]![field] = value;
      } else if (op.op === 'hdel') {
        const key = op.args[0] as string;
        const field = op.args[1] as string;
        if (mockRedisHashes[key]) delete mockRedisHashes[key]![field];
      } else if (op.op === 'set') {
        mockRedisStore[op.args[0] as string] = op.args[1] as string;
      } else if (op.op === 'del') {
        delete mockRedisStore[op.args[0] as string];
        delete mockRedisHashes[op.args[0] as string];
      }
    }
    mockPipelineOps.length = 0;
    return [];
  }),
};

const mockRedis = {
  hset: vi.fn(async (key: string, field: string, value: string) => {
    if (!mockRedisHashes[key]) mockRedisHashes[key] = {};
    mockRedisHashes[key]![field] = value;
    return 1;
  }),
  hget: vi.fn(async (key: string, field: string) => {
    return mockRedisHashes[key]?.[field] ?? null;
  }),
  hgetall: vi.fn(async (key: string) => {
    return mockRedisHashes[key] ?? {};
  }),
  hdel: vi.fn(async (key: string, field: string) => {
    if (mockRedisHashes[key]) delete mockRedisHashes[key]![field];
    return 1;
  }),
  set: vi.fn(async (key: string, value: string) => {
    mockRedisStore[key] = value;
    return 'OK';
  }),
  get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
  del: vi.fn(async (key: string) => {
    delete mockRedisStore[key];
    delete mockRedisHashes[key];
    return 1;
  }),
  exists: vi.fn(async (key: string) => (mockRedisStore[key] !== undefined ? 1 : 0)),
  pipeline: vi.fn(() => {
    mockPipelineOps.length = 0;
    return mockPipeline;
  }),
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

import {
  setOnline,
  setDisconnected,
  checkGracePeriod,
  isInGracePeriod,
  handleReconnection,
  removePresence,
  getRoomPresence,
  getPlayerPresence,
  updateLastSeen,
  cleanupRoomPresence,
  resetPresenceManager,
  getGraceTimerCount,
  GRACE_PERIOD_MS,
} from './presence-manager.js';

function clearMockRedis(): void {
  Object.keys(mockRedisStore).forEach((k) => delete mockRedisStore[k]);
  Object.keys(mockRedisHashes).forEach((k) => delete mockRedisHashes[k]);
}

describe('Presence Manager', () => {
  beforeEach(() => {
    resetPresenceManager();
    clearMockRedis();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPresenceManager();
  });

  describe('GRACE_PERIOD_MS', () => {
    it('should be 30 seconds', () => {
      expect(GRACE_PERIOD_MS).toBe(30_000);
    });
  });

  describe('setOnline', () => {
    it('should set presence to ONLINE in Redis', async () => {
      await setOnline('room-1', 'user-1');

      const raw = mockRedisHashes['ws:room:room-1:presence']?.['user-1'];
      expect(raw).toBeDefined();

      const presence = JSON.parse(raw!);
      expect(presence.userId).toBe('user-1');
      expect(presence.status).toBe('ONLINE');
      expect(presence.gracePeriodEndsAt).toBeNull();
      expect(presence.lastSeen).toBeDefined();
    });

    it('should clear any existing grace period', async () => {
      // Set a grace period first
      mockRedisStore['presence:user-1:grace'] = '1';

      await setOnline('room-1', 'user-1');

      expect(mockRedis.del).toHaveBeenCalledWith('presence:user-1:grace');
    });
  });

  describe('setDisconnected', () => {
    it('should set presence to DISCONNECTED', async () => {
      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);

      // Check pipeline was used
      expect(mockRedis.pipeline).toHaveBeenCalled();

      // Verify presence was set
      const raw = mockRedisHashes['ws:room:room-1:presence']?.['user-1'];
      expect(raw).toBeDefined();

      const presence = JSON.parse(raw!);
      expect(presence.status).toBe('DISCONNECTED');
      expect(presence.gracePeriodEndsAt).toBeDefined();
    });

    it('should set grace period key in Redis', async () => {
      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);

      expect(mockRedisStore['presence:user-1:grace']).toBe('1');
    });

    it('should start a grace timer', async () => {
      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);

      expect(getGraceTimerCount()).toBe(1);
    });

    it('should call onExpired when grace period fires', async () => {
      vi.useFakeTimers();

      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);

      // Advance past grace period
      vi.advanceTimersByTime(GRACE_PERIOD_MS + 100);

      expect(onExpired).toHaveBeenCalledWith('room-1', 'user-1');
      expect(getGraceTimerCount()).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('checkGracePeriod', () => {
    it('should return null when no grace period exists', async () => {
      const result = await checkGracePeriod('user-1');
      expect(result).toBeNull();
    });

    it('should return the roomId when in grace period', async () => {
      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);

      const result = await checkGracePeriod('user-1');
      expect(result).toBe('room-1');
    });
  });

  describe('isInGracePeriod', () => {
    it('should return false when no presence or grace key', async () => {
      const result = await isInGracePeriod('room-1', 'user-1');
      expect(result).toBe(false);
    });

    it('should return true when disconnected with grace key', async () => {
      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);

      const result = await isInGracePeriod('room-1', 'user-1');
      expect(result).toBe(true);
    });

    it('should return false when online (no grace key)', async () => {
      await setOnline('room-1', 'user-1');

      const result = await isInGracePeriod('room-1', 'user-1');
      expect(result).toBe(false);
    });
  });

  describe('handleReconnection', () => {
    it('should return true and restore ONLINE when within grace', async () => {
      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);

      const result = await handleReconnection('room-1', 'user-1');
      expect(result).toBe(true);

      // Should be ONLINE now
      const raw = mockRedisHashes['ws:room:room-1:presence']?.['user-1'];
      const presence = JSON.parse(raw!);
      expect(presence.status).toBe('ONLINE');

      // Grace timer should be cleared
      expect(getGraceTimerCount()).toBe(0);
    });

    it('should return false when grace period has expired', async () => {
      // No grace key in Redis = expired
      const result = await handleReconnection('room-1', 'user-1');
      expect(result).toBe(false);
    });
  });

  describe('removePresence', () => {
    it('should remove presence from Redis', async () => {
      await setOnline('room-1', 'user-1');

      await removePresence('room-1', 'user-1');

      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('should clear any grace timer', async () => {
      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);
      expect(getGraceTimerCount()).toBe(1);

      await removePresence('room-1', 'user-1');
      expect(getGraceTimerCount()).toBe(0);
    });
  });

  describe('getRoomPresence', () => {
    it('should return empty array for empty room', async () => {
      const result = await getRoomPresence('room-1');
      expect(result).toEqual([]);
    });

    it('should return all presence states', async () => {
      await setOnline('room-1', 'user-1');
      await setOnline('room-1', 'user-2');

      const result = await getRoomPresence('room-1');
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.userId).sort()).toEqual(['user-1', 'user-2']);
    });
  });

  describe('getPlayerPresence', () => {
    it('should return null for unknown player', async () => {
      const result = await getPlayerPresence('room-1', 'user-1');
      expect(result).toBeNull();
    });

    it('should return presence for known player', async () => {
      await setOnline('room-1', 'user-1');

      const result = await getPlayerPresence('room-1', 'user-1');
      expect(result).toBeDefined();
      expect(result!.userId).toBe('user-1');
      expect(result!.status).toBe('ONLINE');
    });
  });

  describe('updateLastSeen', () => {
    it('should update the lastSeen timestamp', async () => {
      await setOnline('room-1', 'user-1');

      const before = JSON.parse(
        mockRedisHashes['ws:room:room-1:presence']!['user-1']!,
      ).lastSeen;

      await new Promise((r) => setTimeout(r, 10));
      await updateLastSeen('room-1', 'user-1');

      const after = JSON.parse(
        mockRedisHashes['ws:room:room-1:presence']!['user-1']!,
      ).lastSeen;

      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });

    it('should do nothing for unknown player', async () => {
      await expect(updateLastSeen('room-1', 'user-1')).resolves.not.toThrow();
    });
  });

  describe('cleanupRoomPresence', () => {
    it('should remove all presence data for a room', async () => {
      await setOnline('room-1', 'user-1');
      await setOnline('room-1', 'user-2');

      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);

      await cleanupRoomPresence('room-1');

      expect(getGraceTimerCount()).toBe(0);
    });

    it('should handle empty room cleanup', async () => {
      await expect(cleanupRoomPresence('room-1')).resolves.not.toThrow();
    });
  });

  describe('grace timer management', () => {
    it('should replace timer when setDisconnected called twice', async () => {
      const onExpired1 = vi.fn();
      const onExpired2 = vi.fn();

      await setDisconnected('room-1', 'user-1', onExpired1);
      expect(getGraceTimerCount()).toBe(1);

      await setDisconnected('room-1', 'user-1', onExpired2);
      expect(getGraceTimerCount()).toBe(1);
    });

    it('should track multiple users in the same room', async () => {
      const onExpired = vi.fn();

      await setDisconnected('room-1', 'user-1', onExpired);
      await setDisconnected('room-1', 'user-2', onExpired);

      expect(getGraceTimerCount()).toBe(2);
    });

    it('should track users across different rooms', async () => {
      const onExpired = vi.fn();

      await setDisconnected('room-1', 'user-1', onExpired);
      await setDisconnected('room-2', 'user-2', onExpired);

      expect(getGraceTimerCount()).toBe(2);
    });
  });

  describe('resetPresenceManager', () => {
    it('should clear all grace timers', async () => {
      const onExpired = vi.fn();
      await setDisconnected('room-1', 'user-1', onExpired);
      await setDisconnected('room-1', 'user-2', onExpired);

      expect(getGraceTimerCount()).toBe(2);

      resetPresenceManager();

      expect(getGraceTimerCount()).toBe(0);
    });
  });
});
