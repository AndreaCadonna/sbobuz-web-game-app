/**
 * Tests for game event handlers.
 *
 * @see docs/specs/realtime-module.md Section 4.1 (game:action)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---
vi.mock('../../../infra/redis/index.js', () => ({
  getRedisClient: () => ({}),
}));

vi.mock('../../../infra/websocket/rate-limiter.js', () => ({
  checkEventRateLimit: vi.fn(() => true),
}));

const mockConnections = new Map<string, Record<string, unknown>>();

vi.mock('../connection-manager.js', () => ({
  getConnectionBySocketId: vi.fn((socketId: string) => mockConnections.get(socketId) ?? undefined),
}));

vi.mock('../../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  handleGameAction,
  setGameSessionProvider,
  resetGameSessionProvider,
} from './game-events.js';
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
    sockets: { sockets: new Map() },
  };
}

const gameId = randomUUID();

describe('Game Event Handlers', () => {
  beforeEach(() => {
    mockConnections.clear();
    vi.clearAllMocks();
    resetGameSessionProvider();
  });

  afterEach(() => {
    resetGameSessionProvider();
  });

  describe('handleGameAction', () => {
    it('should reject when rate limited', async () => {
      vi.mocked(checkEventRateLimit).mockReturnValueOnce(false);

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler(
        { gameId: gameId, action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'RATE_LIMITED' }),
        }),
      );
    });

    it('should reject invalid payload', async () => {
      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler({ gameId: 'not-a-uuid', action: {} } as never, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_ACTION' }),
        }),
      );
    });

    it('should reject when not in a room', async () => {
      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: null });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler(
        {
          gameId: gameId,
          action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_IN_ROOM' }),
        }),
      );
    });

    it('should reject when no active game', async () => {
      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: 'room-1' });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      // No game session provider set — default returns undefined for getGameIdForRoom
      const handler = handleGameAction(socket as never, io as never);
      await handler(
        {
          gameId: gameId,
          action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'GAME_NOT_FOUND' }),
        }),
      );
    });

    it('should reject when gameId does not match room game', async () => {
      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: 'room-1' });

      setGameSessionProvider({
        getGameIdForRoom: () => 'actual-game-id',
        processAction: async () => ({ accepted: false, reason: 'test', actionType: 'test' }),
      });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler(
        {
          gameId: gameId,
          action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'GAME_NOT_FOUND' }),
        }),
      );
    });

    it('should accept valid game action', async () => {

      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: 'room-1' });

      const broadcastFn = vi.fn();
      setGameSessionProvider({
        getGameIdForRoom: () => gameId,
        processAction: async () => ({
          accepted: true as const,
          broadcastToRoom: broadcastFn,
        }),
      });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler(
        {
          gameId,
          action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(broadcastFn).toHaveBeenCalledWith(io, 'room-1');
    });

    it('should handle rejected game action', async () => {

      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: 'room-1' });

      setGameSessionProvider({
        getGameIdForRoom: () => gameId,
        processAction: async () => ({
          accepted: false as const,
          reason: 'Not your turn',
          actionType: 'PLAY_CARDS',
        }),
      });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler(
        {
          gameId,
          action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ message: 'Not your turn' }),
        }),
      );

      // Should emit game:action_rejected to sender
      expect(socket['emit']).toHaveBeenCalledWith('game:action_rejected', {
        reason: 'Not your turn',
        actionType: 'PLAY_CARDS',
        gameId,
      });
    });

    it('should handle internal errors gracefully', async () => {

      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: 'room-1' });

      setGameSessionProvider({
        getGameIdForRoom: () => gameId,
        processAction: async () => {
          throw new Error('Engine crashed');
        },
      });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler(
        {
          gameId,
          action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
        }),
      );
    });
  });

  describe('setGameSessionProvider / resetGameSessionProvider', () => {
    it('should use custom provider when set', async () => {

      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: 'room-1' });

      setGameSessionProvider({
        getGameIdForRoom: () => gameId,
        processAction: async () => ({
          accepted: true as const,
          broadcastToRoom: vi.fn(),
        }),
      });

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler(
        {
          gameId,
          action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('should revert to default after reset', async () => {

      mockConnections.set('sock-1', { socketId: 'sock-1', userId: 'user-1', roomId: 'room-1' });

      setGameSessionProvider({
        getGameIdForRoom: () => gameId,
        processAction: async () => ({
          accepted: true as const,
          broadcastToRoom: vi.fn(),
        }),
      });

      resetGameSessionProvider();

      const socket = createMockSocket('sock-1', 'user-1');
      const io = createMockIO();
      const callback = vi.fn();

      const handler = handleGameAction(socket as never, io as never);
      await handler(
        {
          gameId,
          action: { type: 'PLAY_CARDS', playerId: 'user-1', cardIds: [] } as never,
        },
        callback,
      );

      // Default provider returns undefined for getGameIdForRoom
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });
  });
});
