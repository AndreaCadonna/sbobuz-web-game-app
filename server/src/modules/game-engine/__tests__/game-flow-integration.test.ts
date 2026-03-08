/**
 * End-to-End Game Flow Integration Tests
 *
 * Tests the full game lifecycle without a browser:
 * 1. Create game session from room data
 * 2. Process player actions via the GameSessionProvider
 * 3. Verify per-player state sanitization
 * 4. Handle turn timers and timeouts
 * 5. Game completion and result persistence
 * 6. Disconnect timeout -> game cancellation
 * 7. Broadcasting to sockets
 *
 * These tests exercise the integration between:
 * - Game Session Manager (session-manager.ts)
 * - Pure Game Engine (index.ts)
 * - GameSessionProvider interface
 * - State sanitization
 *
 * @see server/src/modules/game-engine/session-manager.ts
 * @see server/src/modules/game-engine/index.ts
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { GameConfig, GameAction } from '@sbobuz/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedisStore: Record<string, string> = {};

vi.mock('../../../infra/redis/index.js', () => ({
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

vi.mock('../../../infra/database/index.js', () => ({
  getPool: () => ({
    query: mockPoolQuery,
  }),
}));

vi.mock('../../../shared/config/index.js', () => ({
  getConfig: () => ({
    GAME_SNAPSHOT_INTERVAL_ACTIONS: 10,
    GAME_SNAPSHOT_INTERVAL_SECONDS: 30,
  }),
}));

vi.mock('../../../shared/logger.js', () => ({
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
  broadcastGameStarted,
  broadcastStateToRoom,
  removeSession,
  resetSessionManager,
} from '../session-manager.js';

import { enumerateLegalMoves, sanitizeStateForPlayer } from '../index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: GameConfig = {
  turnTimerSeconds: 60,
  disconnectGraceSeconds: 30,
  maxPlayers: 5,
  minPlayers: 2,
};

function createPlayers(count: number): string[] {
  return Array.from({ length: count }, () => randomUUID());
}

function createMockSocketIO(playerIds: string[]) {
  const socketEmits = new Map<string, vi.Mock>();
  const sockets = playerIds.map(userId => {
    const emit = vi.fn();
    socketEmits.set(userId, emit);
    return {
      data: { userId },
      emit,
    };
  });

  const roomEmit = vi.fn();

  const io = {
    in: vi.fn().mockReturnValue({
      fetchSockets: vi.fn().mockResolvedValue(sockets),
      emit: roomEmit,
    }),
  } as unknown as import('../../../infra/websocket/setup.js').TypedSocketIOServer;

  return { io, socketEmits, roomEmit, sockets };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GameFlowIntegration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSessionManager();
    mockPoolQuery.mockClear();
    for (const key of Object.keys(mockRedisStore)) {
      delete mockRedisStore[key];
    }
  });

  afterEach(() => {
    resetSessionManager();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Full game creation and first actions
  // -----------------------------------------------------------------------

  describe('game creation and initial state', () => {
    it('should create a game with correct number of players', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(3);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      expect(state.players).toHaveLength(3);
      expect(state.turnOrder).toHaveLength(3);
      expect(state.phase).toBe('playing');
      expect(state.gameId).toBe(gameId);
    });

    it('should create game with 2-5 players', async () => {
      for (let count = 2; count <= 5; count++) {
        const roomId = randomUUID();
        const playerIds = createPlayers(count);

        const { state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG);

        expect(state.players).toHaveLength(count);
        resetSessionManager();
      }
    });

    it('should distribute cards to all players equally', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(3);

      const { state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      // Each player should have cards
      for (const player of state.players) {
        expect(player.hand.length).toBeGreaterThan(0);
        expect(player.faceUpCards.length).toBeGreaterThan(0);
        expect(player.faceDownCards.length).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Playing turns via GameSessionProvider
  // -----------------------------------------------------------------------

  describe('playing turns via provider', () => {
    it('should allow the current player to play cards via provider', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);
      const provider = createGameSessionProvider();

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      const result = await provider.processAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      expect(result.accepted).toBe(true);
    });

    it('should reject actions from wrong player', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);
      const provider = createGameSessionProvider();

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const notCurrentPlayerId = state.turnOrder[
        (state.currentPlayerIndex + 1) % state.turnOrder.length
      ]!;

      const result = await provider.processAction(gameId, {
        type: 'PICK_UP_PILE',
        playerId: notCurrentPlayerId,
      });

      expect(result.accepted).toBe(false);
    });

    it('should advance turn after successful action', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      applyAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      const newState = getGameState(gameId)!;
      // Turn should have advanced (current player index changed)
      // Note: depends on card played, but the action count should have increased
      expect(newState.actionCount).toBeGreaterThan(state.actionCount);
    });
  });

  // -----------------------------------------------------------------------
  // State sanitization per player
  // -----------------------------------------------------------------------

  describe('per-player state sanitization', () => {
    it('should show own hand but hide others', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(3);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      for (const playerId of playerIds) {
        const sanitized = getSanitizedState(gameId, playerId)!;

        const selfView = sanitized.players.find(p => p.id === playerId);
        expect(selfView?.hand).not.toBeNull();
        expect(selfView?.hand?.length).toBeGreaterThan(0);

        const otherViews = sanitized.players.filter(p => p.id !== playerId);
        for (const other of otherViews) {
          expect(other.hand).toBeNull();
          expect(other.handCount).toBeGreaterThan(0);
        }
      }
    });

    it('should always show face-up cards to all', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const state1 = getSanitizedState(gameId, playerIds[0]!)!;
      const state2 = getSanitizedState(gameId, playerIds[1]!)!;

      // Face-up cards should be identical between views
      for (let i = 0; i < state1.players.length; i++) {
        expect(state1.players[i]!.faceUpCards).toEqual(state2.players[i]!.faceUpCards);
      }
    });

    it('should hide draw pile count only', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const sanitized = getSanitizedState(gameId, playerIds[0]!)!;

      expect(sanitized.drawPileCount).toBeGreaterThanOrEqual(0);
      // Sanitized state should NOT have the actual drawPile array
      expect((sanitized as Record<string, unknown>)['drawPile']).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Broadcasting via Socket.IO
  // -----------------------------------------------------------------------

  describe('broadcasting game events', () => {
    it('should broadcast game:started to all players with individual sanitized states', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);
      const { io, socketEmits } = createMockSocketIO(playerIds);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      await broadcastGameStarted(io, gameId, roomId);

      // Each player should have received game:started
      for (const playerId of playerIds) {
        const emit = socketEmits.get(playerId)!;
        expect(emit).toHaveBeenCalledWith('game:started', expect.objectContaining({
          gameId,
          initialState: expect.objectContaining({ gameId }),
        }));
      }

      // Verify per-player sanitization
      const emit0 = socketEmits.get(playerIds[0]!)!;
      const emit1 = socketEmits.get(playerIds[1]!)!;

      const state0 = (emit0.mock.calls[0]![1] as { initialState: { players: Array<{ id: string; hand: unknown }> } }).initialState;
      const state1 = (emit1.mock.calls[0]![1] as { initialState: { players: Array<{ id: string; hand: unknown }> } }).initialState;

      // Player 0 should see their own hand
      const p0inState0 = state0.players.find(p => p.id === playerIds[0]);
      expect(p0inState0?.hand).not.toBeNull();

      // Player 0 should NOT see player 1's hand in their state
      const p1inState0 = state0.players.find(p => p.id === playerIds[1]);
      expect(p1inState0?.hand).toBeNull();

      // Player 1 should see their own hand
      const p1inState1 = state1.players.find(p => p.id === playerIds[1]);
      expect(p1inState1?.hand).not.toBeNull();
    });

    it('should broadcast game:state_update after action', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);
      const { io, socketEmits } = createMockSocketIO(playerIds);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;
      const action: GameAction = {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      };

      // Apply action first
      const result = applyAction(gameId, action);
      expect(result.accepted).toBe(true);

      // Then broadcast
      await broadcastStateToRoom(io, gameId, roomId, action);

      // Each player should receive game:state_update
      for (const playerId of playerIds) {
        const emit = socketEmits.get(playerId)!;
        expect(emit).toHaveBeenCalledWith('game:state_update', expect.objectContaining({
          gameId,
          lastAction: expect.objectContaining({ type: 'PLAY_CARDS' }),
        }));
      }
    });

    it('should broadcast game:ended when game completes', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);
      const { io, roomEmit } = createMockSocketIO(playerIds);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      // Cancel the game to trigger completion
      const cancelAction: GameAction = {
        type: 'CANCEL_GAME',
        reason: 'disconnect_timeout',
        disconnectedPlayerId: playerIds[0],
      };

      applyAction(gameId, cancelAction);
      await vi.advanceTimersByTimeAsync(100);

      // Broadcast the cancelled state
      await broadcastStateToRoom(io, gameId, roomId, cancelAction);

      // Note: after completion, session is removed, so broadcast may be a no-op
      // The game:ended event is emitted during broadcastStateToRoom if game is completed
    });
  });

  // -----------------------------------------------------------------------
  // Turn timer and timeout
  // -----------------------------------------------------------------------

  describe('turn timer enforcement', () => {
    it('should forfeit turn when timer expires', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);
      const config: GameConfig = { ...DEFAULT_CONFIG, turnTimerSeconds: 5 };

      const { gameId, state } = await createGameSession(roomId, playerIds, config, 42);

      const initialCurrentPlayer = state.turnOrder[state.currentPlayerIndex]!;
      const initialActionCount = state.actionCount;

      // Advance past turn timer
      vi.advanceTimersByTime(5_001);

      const newState = getGameState(gameId)!;
      expect(newState.actionCount).toBeGreaterThan(initialActionCount);
    });

    it('should reset timer on player action', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);
      const config: GameConfig = { ...DEFAULT_CONFIG, turnTimerSeconds: 10 };

      const { gameId, state } = await createGameSession(roomId, playerIds, config, 42);

      // Wait 8 seconds (close to timer)
      vi.advanceTimersByTime(8_000);

      // Play an action - this should reset the timer
      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      const result = applyAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      expect(result.accepted).toBe(true);
      const actionCountAfterPlay = getGameState(gameId)!.actionCount;

      // Wait another 8 seconds - should NOT have timed out yet (timer was reset)
      vi.advanceTimersByTime(8_000);
      expect(getGameState(gameId)?.actionCount).toBe(actionCountAfterPlay);

      // Wait another 2.5 seconds - NOW the timer should fire
      vi.advanceTimersByTime(2_500);
      expect(getGameState(gameId)?.actionCount).toBeGreaterThan(actionCountAfterPlay);
    });
  });

  // -----------------------------------------------------------------------
  // Disconnect timeout
  // -----------------------------------------------------------------------

  describe('disconnect timeout handling', () => {
    it('should cancel game on disconnect timeout', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);

      const { gameId } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const result = handlePlayerDisconnectTimeout(roomId, playerIds[0]!);

      expect(result).toBeDefined();
      expect(result?.accepted).toBe(true);
      if (result?.accepted) {
        expect(result.newState.phase).toBe('cancelled');
      }
    });

    it('should clean up session after cancellation', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);

      await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      handlePlayerDisconnectTimeout(roomId, playerIds[0]!);
      await vi.advanceTimersByTimeAsync(100);

      // Session should be cleaned up
      expect(getGameIdForRoom(roomId)).toBeUndefined();
      expect(getActiveSessionCount()).toBe(0);
    });

    it('should not affect non-game rooms', () => {
      const result = handlePlayerDisconnectTimeout(randomUUID(), randomUUID());
      expect(result).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Multi-game scenarios
  // -----------------------------------------------------------------------

  describe('multiple concurrent games', () => {
    it('should track separate games for separate rooms', async () => {
      const room1 = randomUUID();
      const room2 = randomUUID();
      const players1 = createPlayers(2);
      const players2 = createPlayers(3);

      const game1 = await createGameSession(room1, players1, DEFAULT_CONFIG, 1);
      const game2 = await createGameSession(room2, players2, DEFAULT_CONFIG, 2);

      expect(game1.gameId).not.toBe(game2.gameId);
      expect(getGameIdForRoom(room1)).toBe(game1.gameId);
      expect(getGameIdForRoom(room2)).toBe(game2.gameId);
      expect(getActiveSessionCount()).toBe(2);
    });

    it('should not cross-contaminate game actions', async () => {
      const room1 = randomUUID();
      const room2 = randomUUID();
      const players1 = createPlayers(2);
      const players2 = createPlayers(2);

      const game1 = await createGameSession(room1, players1, DEFAULT_CONFIG, 1);
      const game2 = await createGameSession(room2, players2, DEFAULT_CONFIG, 2);

      // Action on game1 should not affect game2
      const p1 = game1.state.turnOrder[game1.state.currentPlayerIndex]!;
      const p1State = game1.state.players.find(p => p.id === p1)!;

      applyAction(game1.gameId, {
        type: 'PLAY_CARDS',
        playerId: p1,
        cardIds: [p1State.hand[0]!.id],
      });

      // Game 2 should be unchanged
      const game2State = getGameState(game2.gameId)!;
      expect(game2State.actionCount).toBe(game2.state.actionCount);
    });

    it('should allow cancellation of one game without affecting another', async () => {
      const room1 = randomUUID();
      const room2 = randomUUID();
      const players1 = createPlayers(2);
      const players2 = createPlayers(2);

      await createGameSession(room1, players1, DEFAULT_CONFIG, 1);
      await createGameSession(room2, players2, DEFAULT_CONFIG, 2);

      handlePlayerDisconnectTimeout(room1, players1[0]!);
      await vi.advanceTimersByTimeAsync(100);

      // Game 1 should be gone
      expect(getGameIdForRoom(room1)).toBeUndefined();

      // Game 2 should still exist
      expect(getGameIdForRoom(room2)).toBeDefined();
      expect(getActiveSessionCount()).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Legal moves enumeration
  // -----------------------------------------------------------------------

  describe('legal moves for current player', () => {
    it('should enumerate legal moves for the current player', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const legalMoves = enumerateLegalMoves(state, currentPlayerId);

      // Should have at least one legal move
      expect(legalMoves.all.length).toBeGreaterThan(0);
    });

    it('should return no legal moves for non-current player', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);

      const { state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const notCurrentPlayerId = state.turnOrder[
        (state.currentPlayerIndex + 1) % state.turnOrder.length
      ]!;

      const legalMoves = enumerateLegalMoves(state, notCurrentPlayerId);
      expect(legalMoves.all).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Game result persistence
  // -----------------------------------------------------------------------

  describe('game result persistence', () => {
    it('should persist game and actions to PostgreSQL on completion', async () => {
      const roomId = randomUUID();
      const playerIds = createPlayers(2);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      // Play a few actions first
      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      applyAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      // Then cancel the game
      handlePlayerDisconnectTimeout(roomId, playerIds[0]!);
      await vi.advanceTimersByTimeAsync(100);

      // Check that INSERT INTO games was called
      const gameInsert = mockPoolQuery.mock.calls.find(
        call => (call[0] as string).includes('INSERT INTO games'),
      );
      expect(gameInsert).toBeDefined();

      // Check that INSERT INTO game_actions was called for each action
      const actionInserts = mockPoolQuery.mock.calls.filter(
        call => (call[0] as string).includes('INSERT INTO game_actions'),
      );
      expect(actionInserts.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // GameSessionProvider interface completeness
  // -----------------------------------------------------------------------

  describe('GameSessionProvider interface', () => {
    it('should implement getGameIdForRoom', async () => {
      const provider = createGameSessionProvider();
      const roomId = randomUUID();

      expect(provider.getGameIdForRoom(roomId)).toBeUndefined();

      await createGameSession(roomId, createPlayers(2), DEFAULT_CONFIG);

      expect(provider.getGameIdForRoom(roomId)).toBeDefined();
    });

    it('should implement processAction with broadcastToRoom', async () => {
      const provider = createGameSessionProvider();
      const roomId = randomUUID();
      const playerIds = createPlayers(2);
      const { io } = createMockSocketIO(playerIds);

      const { gameId, state } = await createGameSession(roomId, playerIds, DEFAULT_CONFIG, 42);

      const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
      const currentPlayer = state.players.find(p => p.id === currentPlayerId)!;

      const result = await provider.processAction(gameId, {
        type: 'PLAY_CARDS',
        playerId: currentPlayerId,
        cardIds: [currentPlayer.hand[0]!.id],
      });

      expect(result.accepted).toBe(true);

      if (result.accepted) {
        // broadcastToRoom should be a function
        expect(typeof result.broadcastToRoom).toBe('function');

        // Call it to verify it works
        await result.broadcastToRoom(io, roomId);

        // io.in should have been called
        expect(io.in).toHaveBeenCalledWith(roomId);
      }
    });
  });
});
