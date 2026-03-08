/**
 * Tests for room event handlers.
 *
 * @see docs/specs/realtime-module.md Section 4.1 (room:join, room:leave)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock Redis (needed by presence-manager) ---
const mockRedisStore: Record<string, string> = {};
const mockRedisHashes: Record<string, Record<string, string>> = {};

const mockPipeline = {
  hset: vi.fn(() => mockPipeline),
  hdel: vi.fn(() => mockPipeline),
  set: vi.fn(() => mockPipeline),
  del: vi.fn(() => mockPipeline),
  exec: vi.fn(async () => []),
};

vi.mock('../../../infra/redis/index.js', () => ({
  getRedisClient: () => ({
    hset: vi.fn(async (key: string, field: string, value: string) => {
      if (!mockRedisHashes[key]) mockRedisHashes[key] = {};
      mockRedisHashes[key]![field] = value;
      return 1;
    }),
    hget: vi.fn(async (key: string, field: string) => mockRedisHashes[key]?.[field] ?? null),
    hgetall: vi.fn(async (key: string) => mockRedisHashes[key] ?? {}),
    hdel: vi.fn(async (key: string, field: string) => {
      if (mockRedisHashes[key]) delete mockRedisHashes[key]![field];
      return 1;
    }),
    set: vi.fn(async (key: string, value: string) => {
      mockRedisStore[key] = value;
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      delete mockRedisStore[key];
      delete mockRedisHashes[key];
      return 1;
    }),
    exists: vi.fn(async (key: string) => (mockRedisStore[key] !== undefined ? 1 : 0)),
    pipeline: vi.fn(() => mockPipeline),
  }),
}));

// --- Mock rate limiter ---
vi.mock('../../../infra/websocket/rate-limiter.js', () => ({
  checkEventRateLimit: vi.fn(() => true),
  getSocketRateLimiter: vi.fn(() => ({
    checkLimit: vi.fn(() => true),
    shouldForceDisconnect: vi.fn(() => false),
    getViolationCount: vi.fn(() => 0),
  })),
}));

// --- Mock connection manager ---
const mockConnections = new Map<string, Record<string, unknown>>();

vi.mock('../connection-manager.js', () => ({
  updateConnectionRoom: vi.fn((socketId: string, roomId: string | null) => {
    const conn = mockConnections.get(socketId);
    if (conn) conn['roomId'] = roomId;
  }),
  getConnectionBySocketId: vi.fn((socketId: string) => mockConnections.get(socketId) ?? undefined),
}));

// --- Mock presence manager ---
vi.mock('../presence-manager.js', () => ({
  setOnline: vi.fn(async () => undefined),
  removePresence: vi.fn(async () => undefined),
  handleReconnection: vi.fn(async () => false),
  getRoomPresence: vi.fn(async () => []),
  isInGracePeriod: vi.fn(async () => false),
  GRACE_PERIOD_MS: 30_000,
}));

// --- Mock room repository ---
const mockRooms = new Map<string, Record<string, unknown>>();

vi.mock('../../lobby/room-repository.js', () => ({
  getRoom: vi.fn(async (roomId: string) => mockRooms.get(roomId) ?? null),
}));

vi.mock('../../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { randomUUID } from 'node:crypto';

import { handleRoomJoin, handleRoomLeave, buildRoomStatePayload } from './room-events.js';

// --- Helpers ---

function createMockSocket(
  id: string,
  userId: string,
  username = 'testuser',
): Record<string, unknown> {
  const socket = {
    id,
    data: { userId, username },
    join: vi.fn(async () => undefined),
    leave: vi.fn(),
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
  };
  return socket;
}

function createMockIO(): Record<string, unknown> {
  return {
    to: vi.fn(() => ({ emit: vi.fn() })),
    sockets: { sockets: new Map() },
  };
}

function createMockRoom(roomId: string, players: Array<{ userId: string; username: string; isReady?: boolean; isHost?: boolean; isAI?: boolean }>): Record<string, unknown> {
  return {
    roomId,
    hostId: players[0]?.userId ?? 'host',
    name: 'Test Room',
    status: 'WAITING',
    players: players.map((p, i) => ({
      userId: p.userId,
      username: p.username,
      displayName: p.username,
      isReady: p.isReady ?? false,
      isHost: p.isHost ?? i === 0,
      isAI: p.isAI ?? false,
      joinedAt: new Date().toISOString(),
      connectionStatus: 'connected',
    })),
    settings: { maxPlayers: 4, turnTimerSeconds: 60, allowAI: true, disconnectGraceSeconds: 30 },
    maxPlayers: 4,
    minPlayers: 2,
  };
}

describe('Room Event Handlers', () => {
  beforeEach(() => {
    mockConnections.clear();
    mockRooms.clear();
    Object.keys(mockRedisStore).forEach((k) => delete mockRedisStore[k]);
    Object.keys(mockRedisHashes).forEach((k) => delete mockRedisHashes[k]);
    vi.clearAllMocks();
  });

  describe('handleRoomJoin', () => {
    it('should reject invalid payload', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleRoomJoin(socket as never, io as never);
      await handler({ roomId: 'not-a-uuid' } as never, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_ACTION' }),
        }),
      );
    });

    it('should reject when room not found', async () => {
      const roomId = randomUUID();
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();
      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: null });

      const handler = handleRoomJoin(socket as never, io as never);
      await handler({ roomId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
        }),
      );
    });

    it('should reject when user is not a room member', async () => {
      const roomId = randomUUID();
      mockRooms.set(roomId, createMockRoom(roomId, [
        { userId: 'other-user', username: 'other' },
      ]));
      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: null });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleRoomJoin(socket as never, io as never);
      await handler({ roomId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
        }),
      );
    });

    it('should successfully join a room', async () => {
      const roomId = randomUUID();
      mockRooms.set(roomId, createMockRoom(roomId, [
        { userId: 'user-1', username: 'testuser' },
        { userId: 'user-2', username: 'other' },
      ]));
      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: null });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleRoomJoin(socket as never, io as never);
      await handler({ roomId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          roomState: expect.objectContaining({
            roomId,
            hostUserId: 'user-1',
          }),
        }),
      );

      // Should have joined the Socket.IO room
      expect(socket['join']).toHaveBeenCalledWith(roomId);

      // Should have notified other members
      expect(socket['to']).toHaveBeenCalledWith(roomId);
    });
  });

  describe('handleRoomLeave', () => {
    it('should reject invalid payload', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleRoomLeave(socket as never, io as never);
      await handler({ roomId: 'not-a-uuid' } as never, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_ACTION' }),
        }),
      );
    });

    it('should reject when not in the room', async () => {
      const roomId = randomUUID();
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();
      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: null });

      const handler = handleRoomLeave(socket as never, io as never);
      await handler({ roomId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_IN_ROOM' }),
        }),
      );
    });

    it('should successfully leave a room', async () => {
      const roomId = randomUUID();
      mockRooms.set(roomId, createMockRoom(roomId, [
        { userId: 'user-1', username: 'testuser' },
        { userId: 'user-2', username: 'other' },
      ]));
      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleRoomLeave(socket as never, io as never);
      await handler({ roomId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(socket['leave']).toHaveBeenCalledWith(roomId);
    });
  });

  describe('buildRoomStatePayload', () => {
    it('should build correct payload from room', () => {
      const room = createMockRoom('room-1', [
        { userId: 'user-1', username: 'alice', isReady: true, isHost: true },
        { userId: 'user-2', username: 'bob', isReady: false },
      ]);

      const connectedIds = new Set(['user-1']);
      const payload = buildRoomStatePayload(room as never, connectedIds);

      expect(payload.roomId).toBe('room-1');
      expect(payload.hostUserId).toBe('user-1');
      expect(payload.status).toBe('WAITING');
      expect(payload.players).toHaveLength(2);
      expect(payload.players[0]).toEqual(expect.objectContaining({
        userId: 'user-1',
        username: 'alice',
        isReady: true,
        isConnected: true,
      }));
      expect(payload.players[1]).toEqual(expect.objectContaining({
        userId: 'user-2',
        username: 'bob',
        isReady: false,
        isConnected: false,
      }));
    });

    it('should mark AI players as always connected', () => {
      const room = createMockRoom('room-1', [
        { userId: 'user-1', username: 'alice', isHost: true },
        { userId: 'ai_easy_1', username: 'AI (Easy)', isAI: true },
      ]);

      const payload = buildRoomStatePayload(room as never, new Set());

      const aiPlayer = payload.players.find((p) => p.userId === 'ai_easy_1');
      expect(aiPlayer?.isConnected).toBe(true);
    });
  });
});
