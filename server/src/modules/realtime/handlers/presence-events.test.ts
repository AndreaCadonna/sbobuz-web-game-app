/**
 * Tests for presence event handlers.
 *
 * @see docs/specs/realtime-module.md Section 5.4 (Heartbeat)
 * @see docs/specs/realtime-module.md Section 5.5 (Disconnect and Grace Period)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---
const mockRedisStore: Record<string, string> = {};
const mockRedisHashes: Record<string, Record<string, string>> = {};

vi.mock('../../../infra/redis/index.js', () => ({
  getRedisClient: () => ({
    hset: vi.fn(async (key: string, field: string, value: string) => {
      if (!mockRedisHashes[key]) mockRedisHashes[key] = {};
      mockRedisHashes[key]![field] = value;
      return 1;
    }),
    hget: vi.fn(async (key: string, field: string) => mockRedisHashes[key]?.[field] ?? null),
    hgetall: vi.fn(async (key: string) => mockRedisHashes[key] ?? {}),
    del: vi.fn(async (key: string) => {
      delete mockRedisStore[key];
      delete mockRedisHashes[key];
      return 1;
    }),
    exists: vi.fn(async (key: string) => (mockRedisStore[key] !== undefined ? 1 : 0)),
    pipeline: vi.fn(() => ({
      hset: vi.fn().mockReturnThis(),
      hdel: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
  }),
}));

vi.mock('../../../infra/websocket/rate-limiter.js', () => ({
  checkEventRateLimit: vi.fn(() => true),
}));

const mockUpdateHeartbeat = vi.fn();
const mockUnregisterConnection = vi.fn(async () => undefined);
const mockGetConnectionBySocketId = vi.fn();

vi.mock('../connection-manager.js', () => ({
  updateHeartbeat: (...args: unknown[]) => mockUpdateHeartbeat(...args),
  unregisterConnection: (...args: unknown[]) => mockUnregisterConnection(...args),
  getConnectionBySocketId: (...args: unknown[]) => mockGetConnectionBySocketId(...args),
}));

const mockSetDisconnected = vi.fn(async () => undefined);
const mockRemovePresence = vi.fn(async () => undefined);
const mockUpdateLastSeen = vi.fn(async () => undefined);
const mockGetRoomPresence = vi.fn(async () => []);

vi.mock('../presence-manager.js', () => ({
  setDisconnected: (...args: unknown[]) => mockSetDisconnected(...args),
  removePresence: (...args: unknown[]) => mockRemovePresence(...args),
  updateLastSeen: (...args: unknown[]) => mockUpdateLastSeen(...args),
  getRoomPresence: (...args: unknown[]) => mockGetRoomPresence(...args),
  GRACE_PERIOD_MS: 30_000,
}));

vi.mock('../../lobby/room-repository.js', () => ({
  getRoom: vi.fn(async () => null),
}));

vi.mock('../../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { handleHeartbeat, handleDisconnect } from './presence-events.js';
import { checkEventRateLimit } from '../../../infra/websocket/rate-limiter.js';

// --- Helpers ---

function createMockSocket(id: string, userId: string): Record<string, unknown> {
  return {
    id,
    data: { userId, username: 'testuser' },
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
  };
}

function createMockIO(): Record<string, unknown> {
  return {
    to: vi.fn(() => ({ emit: vi.fn() })),
    emit: vi.fn(),
    sockets: { sockets: new Map() },
  };
}

describe('Presence Event Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockRedisStore).forEach((k) => delete mockRedisStore[k]);
    Object.keys(mockRedisHashes).forEach((k) => delete mockRedisHashes[k]);
  });

  describe('handleHeartbeat', () => {
    it('should update heartbeat on the connection', () => {
      const socket = createMockSocket('sock-1', 'user-1');
      mockGetConnectionBySocketId.mockReturnValue({ socketId: 'sock-1', userId: 'user-1', roomId: null });

      const handler = handleHeartbeat(socket as never);
      handler();

      expect(mockUpdateHeartbeat).toHaveBeenCalledWith('sock-1');
    });

    it('should update lastSeen when in a room', () => {
      const socket = createMockSocket('sock-1', 'user-1');
      mockGetConnectionBySocketId.mockReturnValue({
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: 'room-1',
      });

      const handler = handleHeartbeat(socket as never);
      handler();

      expect(mockUpdateHeartbeat).toHaveBeenCalledWith('sock-1');
      expect(mockUpdateLastSeen).toHaveBeenCalledWith('room-1', 'user-1');
    });

    it('should not update lastSeen when not in a room', () => {
      const socket = createMockSocket('sock-1', 'user-1');
      mockGetConnectionBySocketId.mockReturnValue({
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: null,
      });

      const handler = handleHeartbeat(socket as never);
      handler();

      expect(mockUpdateLastSeen).not.toHaveBeenCalled();
    });

    it('should silently drop when rate limited', () => {
      vi.mocked(checkEventRateLimit).mockReturnValueOnce(false);

      const socket = createMockSocket('sock-1', 'user-1');
      const handler = handleHeartbeat(socket as never);
      handler();

      expect(mockUpdateHeartbeat).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should unregister the connection', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      mockGetConnectionBySocketId.mockReturnValue({
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: null,
      });

      const io = createMockIO();
      const handler = handleDisconnect(socket as never, io as never);
      await handler('transport close');

      expect(mockUnregisterConnection).toHaveBeenCalledWith('sock-1');
    });

    it('should start grace period when in a room', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      mockGetConnectionBySocketId.mockReturnValue({
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: 'room-1',
      });

      const toEmit = vi.fn();
      const io = {
        to: vi.fn(() => ({ emit: toEmit })),
        emit: vi.fn(),
        sockets: { sockets: new Map() },
      };

      const handler = handleDisconnect(socket as never, io as never);
      await handler('transport close');

      expect(mockSetDisconnected).toHaveBeenCalledWith(
        'room-1',
        'user-1',
        expect.any(Function),
      );
    });

    it('should notify room members of disconnection', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const toEmit = vi.fn();
      mockGetConnectionBySocketId.mockReturnValue({
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: 'room-1',
      });

      // socket.to(roomId).emit(...)
      const socketToReturn = { emit: toEmit };
      (socket['to'] as ReturnType<typeof vi.fn>).mockReturnValue(socketToReturn);

      const io = {
        to: vi.fn(() => ({ emit: vi.fn() })),
        emit: vi.fn(),
        sockets: { sockets: new Map() },
      };

      const handler = handleDisconnect(socket as never, io as never);
      await handler('transport close');

      expect(socket['to']).toHaveBeenCalledWith('room-1');
      expect(toEmit).toHaveBeenCalledWith('presence:player_disconnected', {
        userId: 'user-1',
        gracePeriodMs: 30_000,
      });
    });

    it('should not start grace period when not in a room', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      mockGetConnectionBySocketId.mockReturnValue({
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: null,
      });

      const io = createMockIO();
      const handler = handleDisconnect(socket as never, io as never);
      await handler('transport close');

      expect(mockSetDisconnected).not.toHaveBeenCalled();
    });

    it('should handle unknown connection gracefully', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      mockGetConnectionBySocketId.mockReturnValue(undefined);

      const io = createMockIO();
      const handler = handleDisconnect(socket as never, io as never);

      await expect(handler('transport close')).resolves.not.toThrow();
    });
  });
});
