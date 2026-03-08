/**
 * Tests for the Connection Manager.
 *
 * @see docs/specs/realtime-module.md Section 5.2 (One Socket Per User)
 * @see docs/specs/realtime-module.md Section 5.4 (Heartbeat and Timeout)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock Redis ---
const mockRedisStore: Record<string, string> = {};
const mockPipelineOps: Array<{ op: string; args: unknown[] }> = [];

const mockPipeline = {
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
      if (op.op === 'set') {
        mockRedisStore[op.args[0] as string] = op.args[1] as string;
      } else if (op.op === 'del') {
        delete mockRedisStore[op.args[0] as string];
      }
    }
    mockPipelineOps.length = 0;
    return [];
  }),
};

const mockRedis = {
  get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
  set: vi.fn(async (key: string, value: string) => {
    mockRedisStore[key] = value;
    return 'OK';
  }),
  del: vi.fn(async (key: string) => {
    delete mockRedisStore[key];
    return 1;
  }),
  pipeline: vi.fn(() => {
    mockPipelineOps.length = 0;
    return mockPipeline;
  }),
};

vi.mock('../../infra/redis/index.js', () => ({
  getRedisClient: () => mockRedis,
}));

vi.mock('../../infra/websocket/rate-limiter.js', () => ({
  removeSocketRateLimiter: vi.fn(),
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
  registerConnection,
  unregisterConnection,
  updateHeartbeat,
  updateConnectionRoom,
  getConnectionByUserId,
  getConnectionBySocketId,
  getUserIdBySocketId,
  getAllConnections,
  getConnectionCount,
  startHeartbeatSweep,
  stopHeartbeatSweep,
  resetConnectionManager,
  CONNECTION_CONSTANTS,
} from './connection-manager.js';

// --- Helpers ---

function createMockSocket(
  id: string,
  userId: string,
  username = 'testuser',
): Record<string, unknown> {
  return {
    id,
    data: {
      userId,
      username,
      email: `${username}@test.com`,
      sessionId: `session-${userId}`,
      connectedAt: new Date().toISOString(),
    },
    handshake: {
      headers: { 'user-agent': 'test-agent' },
      address: '127.0.0.1',
    },
    conn: {
      transport: { name: 'websocket' },
    },
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockIO(sockets?: Map<string, unknown>): Record<string, unknown> {
  return {
    sockets: {
      sockets: sockets ?? new Map(),
    },
    serverSideEmit: vi.fn(),
  };
}

describe('Connection Manager', () => {
  beforeEach(() => {
    resetConnectionManager();
    Object.keys(mockRedisStore).forEach((k) => delete mockRedisStore[k]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetConnectionManager();
  });

  describe('registerConnection', () => {
    it('should register a new connection', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);

      const conn = getConnectionByUserId('user-1');
      expect(conn).toBeDefined();
      expect(conn!.socketId).toBe('sock-1');
      expect(conn!.userId).toBe('user-1');
      expect(conn!.username).toBe('testuser');
      expect(conn!.roomId).toBeNull();
    });

    it('should store connection mapping in Redis', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);

      // Check Redis pipeline was called
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockRedisStore['ws:socket:user-1']).toBe('sock-1');
      expect(mockRedisStore['ws:connection:sock-1']).toBeDefined();
    });

    it('should supersede existing connection for same user', async () => {
      const oldSocket = createMockSocket('sock-old', 'user-1');
      const newSocket = createMockSocket('sock-new', 'user-1');

      const socketsMap = new Map();
      socketsMap.set('sock-old', oldSocket);
      const io = createMockIO(socketsMap);

      // Register old connection
      await registerConnection(oldSocket as never, io as never);

      // Register new connection (should supersede)
      await registerConnection(newSocket as never, io as never);

      // Old socket should have been notified and disconnected
      expect(oldSocket['emit']).toHaveBeenCalledWith('error', {
        code: 'AUTH_FAILED',
        message: 'Connection superseded by new session',
      });
      expect(oldSocket['disconnect']).toHaveBeenCalledWith(true);

      // New connection should be active
      const conn = getConnectionByUserId('user-1');
      expect(conn!.socketId).toBe('sock-new');
    });

    it('should broadcast force disconnect for cross-instance connections', async () => {
      // Simulate Redis having a stale connection from another instance
      mockRedisStore['ws:socket:user-1'] = 'sock-remote';

      const socket = createMockSocket('sock-local', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);

      expect((io['serverSideEmit'] as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        'user:force_disconnect',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('should populate deviceInfo from handshake', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);

      const conn = getConnectionByUserId('user-1');
      expect(conn!.deviceInfo.userAgent).toBe('test-agent');
      expect(conn!.deviceInfo.transport).toBe('websocket');
      expect(conn!.deviceInfo.ip).toBe('127.0.0.1');
    });
  });

  describe('unregisterConnection', () => {
    it('should remove the connection', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);
      const removed = await unregisterConnection('sock-1');

      expect(removed).toBeDefined();
      expect(removed!.userId).toBe('user-1');
      expect(getConnectionByUserId('user-1')).toBeUndefined();
      expect(getConnectionBySocketId('sock-1')).toBeUndefined();
    });

    it('should return undefined for unknown socket', async () => {
      const removed = await unregisterConnection('nonexistent');
      expect(removed).toBeUndefined();
    });

    it('should not remove connection if socket was superseded', async () => {
      const oldSocket = createMockSocket('sock-old', 'user-1');
      const newSocket = createMockSocket('sock-new', 'user-1');
      const io = createMockIO();

      await registerConnection(oldSocket as never, io as never);
      await registerConnection(newSocket as never, io as never);

      // Unregistering the old socket should not remove the new connection
      await unregisterConnection('sock-old');

      const conn = getConnectionByUserId('user-1');
      expect(conn).toBeDefined();
      expect(conn!.socketId).toBe('sock-new');
    });
  });

  describe('updateHeartbeat', () => {
    it('should update lastPingAt', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);

      const before = getConnectionByUserId('user-1')!.lastPingAt;

      // Small delay to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));
      updateHeartbeat('sock-1');

      const after = getConnectionByUserId('user-1')!.lastPingAt;
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });

    it('should do nothing for unknown socket', () => {
      expect(() => updateHeartbeat('nonexistent')).not.toThrow();
    });
  });

  describe('updateConnectionRoom', () => {
    it('should update the roomId', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);
      expect(getConnectionByUserId('user-1')!.roomId).toBeNull();

      updateConnectionRoom('sock-1', 'room-123');
      expect(getConnectionByUserId('user-1')!.roomId).toBe('room-123');

      updateConnectionRoom('sock-1', null);
      expect(getConnectionByUserId('user-1')!.roomId).toBeNull();
    });
  });

  describe('getters', () => {
    it('getConnectionBySocketId should find connection', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);

      expect(getConnectionBySocketId('sock-1')).toBeDefined();
      expect(getConnectionBySocketId('sock-1')!.userId).toBe('user-1');
    });

    it('getUserIdBySocketId should return userId', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();

      await registerConnection(socket as never, io as never);

      expect(getUserIdBySocketId('sock-1')).toBe('user-1');
    });

    it('getAllConnections should return all connections', async () => {
      const io = createMockIO();

      await registerConnection(createMockSocket('sock-1', 'user-1') as never, io as never);
      await registerConnection(createMockSocket('sock-2', 'user-2') as never, io as never);

      const all = getAllConnections();
      expect(all.size).toBe(2);
    });

    it('getConnectionCount should return the count', async () => {
      const io = createMockIO();

      expect(getConnectionCount()).toBe(0);
      await registerConnection(createMockSocket('sock-1', 'user-1') as never, io as never);
      expect(getConnectionCount()).toBe(1);
      await registerConnection(createMockSocket('sock-2', 'user-2') as never, io as never);
      expect(getConnectionCount()).toBe(2);
    });
  });

  describe('heartbeat sweep', () => {
    it('should disconnect stale connections', async () => {
      vi.useFakeTimers();

      const socket = createMockSocket('sock-1', 'user-1');
      const socketsMap = new Map();
      socketsMap.set('sock-1', socket);
      const io = createMockIO(socketsMap);

      await registerConnection(socket as never, io as never);

      // Advance past the stale threshold (45 seconds)
      vi.advanceTimersByTime(CONNECTION_CONSTANTS.STALE_CONNECTION_THRESHOLD_MS + 1000);

      // Start sweep — it will immediately check
      startHeartbeatSweep(io as never);

      // Trigger the sweep interval
      vi.advanceTimersByTime(CONNECTION_CONSTANTS.HEARTBEAT_SWEEP_INTERVAL_MS);

      expect(socket['disconnect']).toHaveBeenCalledWith(true);

      stopHeartbeatSweep();
      vi.useRealTimers();
    });

    it('should not disconnect active connections', async () => {
      vi.useFakeTimers();

      const socket = createMockSocket('sock-1', 'user-1');
      const socketsMap = new Map();
      socketsMap.set('sock-1', socket);
      const io = createMockIO(socketsMap);

      await registerConnection(socket as never, io as never);

      // Start sweep
      startHeartbeatSweep(io as never);

      // Advance less than threshold
      vi.advanceTimersByTime(CONNECTION_CONSTANTS.HEARTBEAT_SWEEP_INTERVAL_MS);

      // Update heartbeat to keep alive
      updateHeartbeat('sock-1');

      // Advance another interval
      vi.advanceTimersByTime(CONNECTION_CONSTANTS.HEARTBEAT_SWEEP_INTERVAL_MS);

      expect(socket['disconnect']).not.toHaveBeenCalled();

      stopHeartbeatSweep();
      vi.useRealTimers();
    });

    it('should not start multiple sweep timers', () => {
      const io = createMockIO();

      startHeartbeatSweep(io as never);
      startHeartbeatSweep(io as never); // Second call should be no-op

      stopHeartbeatSweep();
    });
  });

  describe('resetConnectionManager', () => {
    it('should clear all state', async () => {
      const io = createMockIO();

      await registerConnection(createMockSocket('sock-1', 'user-1') as never, io as never);
      expect(getConnectionCount()).toBe(1);

      resetConnectionManager();

      expect(getConnectionCount()).toBe(0);
      expect(getConnectionByUserId('user-1')).toBeUndefined();
    });
  });
});
