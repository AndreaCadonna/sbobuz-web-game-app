/**
 * Tests for the Game Session Manager.
 *
 * Tests the bridge between the pure game engine and the I/O layer:
 * - Creating game sessions
 * - Processing actions
 * - State retrieval and sanitization
 * - Turn timer enforcement
 * - Game completion handling
 * - GameSessionProvider interface
 * - Session recovery from Redis
 *
 * @see server/src/modules/game-engine/session-manager.ts
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { GameConfig } from '@sbobuz/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedisStore: Record<string, string> = {};

vi.mock('../../infra/redis/index.js', () => ({
  getRedisClient: () => ({
    get: vi.fn((key: string) => Promise.resolve(mockRedisStore[key] ?? null)),
    set: vi.fn((key: string, value: string) => {
      mockRedisStore[key] = value;
      return Promise.resolve('OK');
    }),
    del: vi.fn((key: string) => {
      delete mockRedisStore[key];
      return Promise.resolve(1);
    }),
    pipeline: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn(() => Promise.resolve([])),
    })),
  }),
}));

const mockPoolQuery = vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 }));

vi.mock('../../infra/database/index.js', () => ({
  getPool: () => ({
    query: mockPoolQuery,
  }),
}));

vi.mock('../../shared/config/index.js', () => ({
  getConfig: () => ({
    GAME_SNAPSHOT_INTERVAL_ACTIONS: 10,
    GAME_SNAPSHOT_INTERVAL_SECONDS: 30,
  }),
}));

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createGameSession,
  applyAction,
  getGameState,
  getSanitizedState,
  getGameIdForRoom,
  getSession,
  getActiveSessionCount,
  handlePlayerDisconnectTimeout,
  createGameSessionProvider,
  removeSession,
  resetSessionManager,
  broadcastGameStarted,
  broadcastStateToRoom,
} from './session-manager.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: GameConfig = {
  turnTimerSeconds: 60,
  disconnectGraceSeconds: 30,
  maxPlayers: 5,
  minPlayers: 2,
};

function createTestPlayers(count: number): string[] {
  return Array.from({ length: count }, () => randomUUID());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GameSessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSessionManager();
    mockPoolQuery.mockClear();
    // Clear mock Redis store
    for (const key of Object.keys(mockRedisStore)) {
      delete mockRedisStore[key];
    }
  });

  afterEach(() => {
    resetSessionManager();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // createGameSession
  // -----------------------------------------------------------------------

  describe('createGameSession', () => {
    it('should create a game session with initial state', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG);

      expect(gameId).toBeTruthy();
      expect(state.gameId).toBe(gameId);
      expect(state.phase).toBe('playing');
      expect(state.players).toHaveLength(2);
      expect(state.turnOrder).toHaveLength(2);
    });

    it('should store session in memory', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(3);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG);

      expect(getActiveSessionCount()).toBe(1);
      expect(getSession(gameId)).toBeDefined();
      expect(getGameIdForRoom(roomId)).toBe(gameId);
    });

    it('should reject creating session if room already has one', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      await createGameSession(roomId, playerIds, DEFAULT_CONFIG);

      await expect(createGameSession(roomId, playerIds, DEFAULT_CONFIG))
        .rejects.toThrow('already has an active game');
    });

    it('should accept a custom seed', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);
      const seed = 42;

      const { state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, seed);

      expect(state.rngSeed).toBe(seed);
    });

    it('should support multiple simultaneous sessions', async () => {
      const room1 = randomUUID();
      const room2 = randomUUID();

      await createGameSession(room1, createTestPlayers(2), DEFAULT_CONFIG);
      await createGameSession(room2, createTestPlayers(3), DEFAULT_CONFIG);

      expect(getActiveSessionCount()).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // applyAction
  // -----------------------------------------------------------------------

  describe('applyAction', () => {
    it('should process valid actions', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      // Find the current player and play one of their hand cards
      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      // Play the first card from hand (always valid on an empty pile)
      const result = applyAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      expect(result.accepted).toBe(true);
    });

    it('should reject actions for non-existent sessions', () => {
      const result = applyAction(randomUUID(), {
        type: 'PICK_UP_PILE',
        playerId: randomUUID(),
      });

      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.error.message).toBe('Game session not found');
      }
    });

    it('should reject invalid actions', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      // Try to play as the wrong player
      const notCurrentPlayerId = state.turnOrder[
        (state.currentPlayerIndex + 1) % state.turnOrder.length
      ]!;

      const result = applyAction(gameId, {
        type: 'PICK_UP_PILE',
        playerId: notCurrentPlayerId,
      });

      expect(result.accepted).toBe(false);
    });

    it('should increment action log on accepted actions', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      applyAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      const session = getSession(gameId);
      expect(session?.actionLog).toHaveLength(1);
      expect(session?.actionLog[0]?.action.type).toBe('PLAY_CARDS');
    });
  });

  // -----------------------------------------------------------------------
  // State retrieval
  // -----------------------------------------------------------------------

  describe('getGameState', () => {
    it('should return the current state', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG);

      const retrieved = getGameState(gameId);
      expect(retrieved).toEqual(state);
    });

    it('should return undefined for non-existent sessions', () => {
      expect(getGameState(randomUUID())).toBeUndefined();
    });
  });

  describe('getSanitizedState', () => {
    it('should return sanitized state for a player', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG);

      const sanitized = getSanitizedState(gameId, playerIds[0]!);
      expect(sanitized).toBeDefined();
      expect(sanitized?.gameId).toBe(gameId);

      // Verify sanitization: own hand visible, other's hidden
      const ownPlayer = sanitized?.players.find(p => p.id === playerIds[0]);
      const otherPlayer = sanitized?.players.find(p => p.id === playerIds[1]);
      expect(ownPlayer?.hand).not.toBeNull();
      expect(otherPlayer?.hand).toBeNull();
    });

    it('should return undefined for non-existent sessions', () => {
      expect(getSanitizedState(randomUUID(), randomUUID())).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Turn timer
  // -----------------------------------------------------------------------

  describe('turn timer', () => {
    it('should trigger TIMEOUT_FORFEIT when timer expires', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);
      const config: GameConfig = { ...DEFAULT_CONFIG, turnTimerSeconds: 10 };

      const { gameId, state } = await createGameSession(roomId, playerIds, config, 42);

      const initialActionCount = state.actionCount;

      // Advance time past the turn timer
      vi.advanceTimersByTime(10_001);

      // The timeout forfeit should have been applied
      const currentState = getGameState(gameId);
      expect(currentState?.actionCount).toBeGreaterThan(initialActionCount);
    });

    it('should clear timer when action is applied', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);
      const config: GameConfig = { ...DEFAULT_CONFIG, turnTimerSeconds: 10 };

      const { gameId, state } = await createGameSession(roomId, playerIds, config, 42);

      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      applyAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      // The old timer should be cleared. Advance past the old timer's time
      // and verify a new timer started (not the old one)
      const stateAfterAction = getGameState(gameId)!;
      const actionCountAfterAction = stateAfterAction.actionCount;

      // Advance by 5 seconds (should not trigger timeout)
      vi.advanceTimersByTime(5_000);
      expect(getGameState(gameId)?.actionCount).toBe(actionCountAfterAction);

      // Advance to just past 10 seconds (should trigger timeout for next player)
      vi.advanceTimersByTime(5_001);
      expect(getGameState(gameId)?.actionCount).toBeGreaterThan(actionCountAfterAction);
    });

    it('should handle very long turn timers without premature expiry', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);
      const config: GameConfig = { ...DEFAULT_CONFIG, turnTimerSeconds: 300 };

      const { gameId, state } = await createGameSession(roomId, playerIds, config, 42);

      // Advance only 60 seconds - should NOT trigger timeout
      vi.advanceTimersByTime(60_000);

      // No timeout should have occurred
      expect(getGameState(gameId)?.actionCount).toBe(state.actionCount);
    });
  });

  // -----------------------------------------------------------------------
  // handlePlayerDisconnectTimeout
  // -----------------------------------------------------------------------

  describe('handlePlayerDisconnectTimeout', () => {
    it('should cancel the game when a player disconnects', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const result = handlePlayerDisconnectTimeout(roomId, playerIds[0]!);

      expect(result?.accepted).toBe(true);
      if (result?.accepted) {
        expect(result.newState.phase).toBe('cancelled');
      }
    });

    it('should return undefined for non-existent rooms', () => {
      const result = handlePlayerDisconnectTimeout(randomUUID(), randomUUID());
      expect(result).toBeUndefined();
    });

    it('should return undefined for already finished games', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      // Cancel the game first
      handlePlayerDisconnectTimeout(roomId, playerIds[0]!);

      // Try to cancel again
      const result = handlePlayerDisconnectTimeout(roomId, playerIds[0]!);
      expect(result).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // GameSessionProvider
  // -----------------------------------------------------------------------

  describe('createGameSessionProvider', () => {
    it('should return a provider with getGameIdForRoom', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG);

      const provider = createGameSessionProvider();
      expect(provider.getGameIdForRoom(roomId)).toBe(gameId);
    });

    it('should return undefined for rooms without games', () => {
      const provider = createGameSessionProvider();
      expect(provider.getGameIdForRoom(randomUUID())).toBeUndefined();
    });

    it('should process valid actions via the provider', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);
      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      const provider = createGameSessionProvider();
      const result = await provider.processAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      expect(result.accepted).toBe(true);
    });

    it('should reject actions for non-existent sessions via provider', async () => {
      const provider = createGameSessionProvider();
      const result = await provider.processAction(randomUUID(), {
        type: 'PICK_UP_PILE',
        playerId: randomUUID(),
      });

      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.reason).toContain('not found');
      }
    });
  });

  // -----------------------------------------------------------------------
  // removeSession / resetSessionManager
  // -----------------------------------------------------------------------

  describe('removeSession', () => {
    it('should remove a session by gameId', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG);
      expect(getActiveSessionCount()).toBe(1);

      removeSession(gameId);
      expect(getActiveSessionCount()).toBe(0);
      expect(getGameIdForRoom(roomId)).toBeUndefined();
    });

    it('should be no-op for non-existent sessions', () => {
      removeSession(randomUUID());
      expect(getActiveSessionCount()).toBe(0);
    });
  });

  describe('resetSessionManager', () => {
    it('should clear all sessions', async () => {
      await createGameSession(randomUUID(), createTestPlayers(2), DEFAULT_CONFIG);
      await createGameSession(randomUUID(), createTestPlayers(3), DEFAULT_CONFIG);

      expect(getActiveSessionCount()).toBe(2);

      resetSessionManager();
      expect(getActiveSessionCount()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // broadcastGameStarted
  // -----------------------------------------------------------------------

  describe('broadcastGameStarted', () => {
    it('should emit game:started to each socket with sanitized state', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const mockSocket1 = {
        data: { userId: playerIds[0] },
        emit: vi.fn(),
      };
      const mockSocket2 = {
        data: { userId: playerIds[1] },
        emit: vi.fn(),
      };

      const mockIo = {
        in: vi.fn().mockReturnValue({
          fetchSockets: vi.fn().mockResolvedValue([mockSocket1, mockSocket2]),
          emit: vi.fn(),
        }),
      } as unknown as import('../../infra/websocket/setup.js').TypedSocketIOServer;

      await broadcastGameStarted(mockIo, gameId, roomId);

      expect(mockSocket1.emit).toHaveBeenCalledWith('game:started', expect.objectContaining({
        gameId,
        initialState: expect.objectContaining({ gameId }),
      }));

      expect(mockSocket2.emit).toHaveBeenCalledWith('game:started', expect.objectContaining({
        gameId,
      }));

      // Verify sanitization: each player should see their own hand but not the other's
      const state1 = mockSocket1.emit.mock.calls[0]![1] as { initialState: { players: Array<{ id: string; hand: unknown }> } };
      const player1Self = state1.initialState.players.find(p => p.id === playerIds[0]);
      const player1Other = state1.initialState.players.find(p => p.id === playerIds[1]);
      expect(player1Self?.hand).not.toBeNull();
      expect(player1Other?.hand).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // broadcastStateToRoom
  // -----------------------------------------------------------------------

  describe('broadcastStateToRoom', () => {
    it('should emit game:state_update to each socket with sanitized state', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const mockSocket1 = {
        data: { userId: playerIds[0] },
        emit: vi.fn(),
      };

      const mockIo = {
        in: vi.fn().mockReturnValue({
          fetchSockets: vi.fn().mockResolvedValue([mockSocket1]),
          emit: vi.fn(),
        }),
      } as unknown as import('../../infra/websocket/setup.js').TypedSocketIOServer;

      const action = { type: 'PICK_UP_PILE' as const, playerId: playerIds[0]! };
      await broadcastStateToRoom(mockIo, gameId, roomId, action);

      expect(mockSocket1.emit).toHaveBeenCalledWith('game:state_update', expect.objectContaining({
        gameId,
        state: expect.objectContaining({ gameId }),
        lastAction: expect.objectContaining({ type: 'PICK_UP_PILE' }),
      }));
    });
  });

  // -----------------------------------------------------------------------
  // Game completion persistence
  // -----------------------------------------------------------------------

  describe('game completion', () => {
    it('should persist game result to PostgreSQL when game ends', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      // Cancel the game to trigger completion
      const result = handlePlayerDisconnectTimeout(roomId, playerIds[0]!);
      expect(result?.accepted).toBe(true);

      // Wait for async persistence
      await vi.advanceTimersByTimeAsync(100);

      // Should have called pool.query for game insert + action inserts
      expect(mockPoolQuery).toHaveBeenCalled();
      const calls = mockPoolQuery.mock.calls;
      const gameInsertCall = calls.find(call =>
        (call[0] as string).includes('INSERT INTO games'),
      );
      expect(gameInsertCall).toBeDefined();
    });

    it('should remove session from memory after completion', async () => {
      const roomId = randomUUID();
      const playerIds = createTestPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      handlePlayerDisconnectTimeout(roomId, playerIds[0]!);
      await vi.advanceTimersByTimeAsync(100);

      expect(getSession(gameId)).toBeUndefined();
      expect(getGameIdForRoom(roomId)).toBeUndefined();
    });
  });
});
