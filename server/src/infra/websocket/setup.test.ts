/**
 * Tests for Socket.IO server setup.
 *
 * @see docs/specs/realtime-module.md Section 6 (Scaling Architecture)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetRedisClient = vi.fn();
const mockGetRedisSubscriber = vi.fn();

vi.mock('../../infra/redis/index.js', () => ({
  getRedisClient: () => mockGetRedisClient(),
  getRedisSubscriber: () => mockGetRedisSubscriber(),
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn(() => ({})),
}));

vi.mock('./auth-middleware.js', () => ({
  socketAuthMiddleware: vi.fn(),
}));

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createServer } from 'node:http';

import {
  createSocketIOServer,
  getSocketIOServer,
  closeSocketIOServer,
  resetSocketIOServer,
} from './setup.js';

function makeConfig(): Record<string, unknown> {
  return {
    CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
    WS_PING_INTERVAL_MS: 25000,
    WS_PING_TIMEOUT_MS: 5000,
    WS_MAX_PAYLOAD_BYTES: 16384,
  };
}

describe('Socket.IO Server Setup', () => {
  let httpServer: ReturnType<typeof createServer>;

  beforeEach(() => {
    resetSocketIOServer();
    httpServer = createServer();
    mockGetRedisClient.mockReturnValue({});
    mockGetRedisSubscriber.mockReturnValue({});
  });

  afterEach(async () => {
    await closeSocketIOServer();
    httpServer.close();
  });

  describe('createSocketIOServer', () => {
    it('should create a Socket.IO server', () => {
      const io = createSocketIOServer(httpServer, makeConfig() as never);
      expect(io).toBeDefined();
    });

    it('should throw if called twice without closing', () => {
      createSocketIOServer(httpServer, makeConfig() as never);
      expect(() => createSocketIOServer(httpServer, makeConfig() as never)).toThrow(
        'Socket.IO server already exists',
      );
    });

    it('should handle Redis adapter failure gracefully', () => {
      mockGetRedisClient.mockImplementation(() => {
        throw new Error('Redis not available');
      });

      // Should not throw — just warns and runs in single-instance mode
      const io = createSocketIOServer(httpServer, makeConfig() as never);
      expect(io).toBeDefined();
    });
  });

  describe('getSocketIOServer', () => {
    it('should return the created instance', () => {
      const created = createSocketIOServer(httpServer, makeConfig() as never);
      const retrieved = getSocketIOServer();
      expect(retrieved).toBe(created);
    });

    it('should throw if server not created', () => {
      expect(() => getSocketIOServer()).toThrow('Socket.IO server not initialized');
    });
  });

  describe('closeSocketIOServer', () => {
    it('should close and reset the server', async () => {
      createSocketIOServer(httpServer, makeConfig() as never);
      await closeSocketIOServer();
      expect(() => getSocketIOServer()).toThrow('Socket.IO server not initialized');
    });

    it('should be safe to call when no server exists', async () => {
      await expect(closeSocketIOServer()).resolves.not.toThrow();
    });
  });
});
