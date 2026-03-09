/**
 * Game Session Manager — bridges the pure game engine with I/O.
 *
 * Manages active game state in memory, persists snapshots to Redis for crash
 * recovery, enforces turn timers, and implements the GameSessionProvider
 * interface for the realtime module's event handlers.
 *
 * Key responsibilities:
 * - Create game sessions from room start events
 * - Process actions via the pure game engine
 * - Broadcast per-player sanitized state updates
 * - Persist events to PostgreSQL (event sourcing)
 * - Snapshot state to Redis at configurable intervals
 * - Enforce turn timers with TIMEOUT_FORFEIT actions
 * - Handle game completion (persist results, clean up)
 *
 * @see docs/specs/realtime-module.md Section 3 (Connection Lifecycle, Phase 3)
 * @see docs/specs/realtime-module.md Section 4.3 (Per-Player State Sanitization)
 */

import { randomUUID } from 'node:crypto';

import type { GameAction, GameConfig, GameState } from '@sbobuz/shared';

import type { TypedSocketIOServer } from '../../infra/websocket/setup.js';
import type { GameSessionProvider } from '../realtime/handlers/game-events.js';
import { getRedisClient } from '../../infra/redis/index.js';
import { getPool } from '../../infra/database/index.js';
import { createModuleLogger } from '../../shared/logger.js';
import { getConfig } from '../../shared/config/index.js';

import {
  createGame,
  processAction,
  sanitizeStateForPlayer,
} from './index.js';
import type { ProcessActionResult, SanitizedGameState } from './index.js';

const logger = createModuleLogger('game-session');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * An active game session tracked in memory.
 */
export interface GameSession {
  readonly gameId: string;
  readonly roomId: string;
  readonly playerIds: ReadonlyArray<string>;
  readonly seed: number;
  state: GameState;
  readonly startedAt: string;
  actionLog: Array<{
    index: number;
    action: GameAction;
    timestamp: string;
  }>;
  turnTimer: ReturnType<typeof setTimeout> | null;
  lastSnapshotActionCount: number;
  lastSnapshotTime: number;
}

/**
 * Data persisted when a game completes.
 */
export interface GameCompletionData {
  readonly gameId: string;
  readonly roomId: string;
  readonly winnerId: string | null;
  readonly phase: 'finished' | 'cancelled';
  readonly playerIds: ReadonlyArray<string>;
  readonly config: GameConfig;
  readonly seed: number;
  readonly actionCount: number;
  readonly durationSeconds: number;
  readonly startedAt: string;
  readonly endedAt: string;
}

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

function gameSnapshotKey(gameId: string): string {
  return `game:snapshot:${gameId}`;
}

function roomGameKey(roomId: string): string {
  return `game:room:${roomId}`;
}

// ---------------------------------------------------------------------------
// In-memory game sessions
// ---------------------------------------------------------------------------

/** gameId -> GameSession */
const activeSessions = new Map<string, GameSession>();

/** roomId -> gameId */
const roomToGame = new Map<string, string>();

// ---------------------------------------------------------------------------
// Session Manager Public API
// ---------------------------------------------------------------------------

/**
 * Create a new game session for a room.
 *
 * Calls the pure game engine's `createGame()` to produce the initial state,
 * then stores the session in memory, snapshots to Redis, and starts the
 * turn timer.
 *
 * @param roomId - The room ID.
 * @param playerIds - Player IDs in seating order.
 * @param config - Game configuration from room settings.
 * @param seed - Optional RNG seed (random if not provided).
 * @returns The gameId and initial game state.
 */
export async function createGameSession(
  roomId: string,
  playerIds: ReadonlyArray<string>,
  config: GameConfig,
  seed?: number | undefined,
  existingGameId?: string | undefined,
): Promise<{ gameId: string; state: GameState }> {
  // Check room doesn't already have an active game
  if (roomToGame.has(roomId)) {
    throw new Error(`Room ${roomId} already has an active game`);
  }

  const gameId = existingGameId ?? randomUUID();
  const gameSeed = seed ?? Math.floor(Math.random() * 2_147_483_647);
  const now = new Date().toISOString();

  // Create initial state via pure engine
  const state = createGame({
    gameId,
    playerIds,
    seed: gameSeed,
    config,
  });

  const session: GameSession = {
    gameId,
    roomId,
    playerIds,
    seed: gameSeed,
    state,
    startedAt: now,
    actionLog: [],
    turnTimer: null,
    lastSnapshotActionCount: 0,
    lastSnapshotTime: Date.now(),
  };

  // Store in memory
  activeSessions.set(gameId, session);
  roomToGame.set(roomId, gameId);

  // Snapshot to Redis
  await snapshotToRedis(session);

  // Start turn timer
  startTurnTimer(session);

  logger.info(
    { gameId, roomId, playerCount: playerIds.length, seed: gameSeed },
    'Game session created',
  );

  return { gameId, state };
}

/**
 * Process a game action within a session.
 *
 * Validates and applies the action via the pure game engine, then:
 * - Logs the action for event sourcing
 * - Snapshots to Redis if interval reached
 * - Restarts the turn timer
 * - Checks for game completion
 *
 * @param gameId - The game ID.
 * @param action - The game action to process.
 * @returns The result from the game engine.
 */
export function applyAction(
  gameId: string,
  action: GameAction,
): ProcessActionResult {
  const session = activeSessions.get(gameId);
  if (!session) {
    return {
      accepted: false,
      error: {
        code: 'GAME_NOT_IN_PROGRESS',
        message: 'Game session not found',
      },
    };
  }

  const result = processAction(session.state, action);

  if (result.accepted) {
    const now = new Date().toISOString();

    // Update state
    session.state = result.newState;

    // Log action
    session.actionLog.push({
      index: session.actionLog.length,
      action,
      timestamp: now,
    });

    // Clear old turn timer
    clearTurnTimer(session);

    // Check if game is over
    if (result.newState.phase === 'finished' || result.newState.phase === 'cancelled') {
      void handleGameCompletion(session, result.newState);

      // Notify AI controller that game ended
      void notifyAIGameEnded(gameId);
    } else {
      // Restart turn timer for next player
      startTurnTimer(session);

      // Snapshot periodically
      void maybeSnapshot(session);

      // Notify AI controller if it's now an AI player's turn
      const nextPlayerId = result.newState.turnOrder[result.newState.currentPlayerIndex];
      if (nextPlayerId) {
        void notifyAITurnChange(gameId, nextPlayerId, result.newState);
      }
    }
  }

  return result;
}

/**
 * Get the current state for a game session.
 */
export function getGameState(gameId: string): GameState | undefined {
  return activeSessions.get(gameId)?.state;
}

/**
 * Get a sanitized state view for a specific player.
 */
export function getSanitizedState(
  gameId: string,
  playerId: string,
): SanitizedGameState | undefined {
  const session = activeSessions.get(gameId);
  if (!session) return undefined;

  return sanitizeStateForPlayer(session.state, playerId);
}

/**
 * Get the active game ID for a room.
 */
export function getGameIdForRoom(roomId: string): string | undefined {
  return roomToGame.get(roomId);
}

/**
 * Get a game session by ID.
 */
export function getSession(gameId: string): GameSession | undefined {
  return activeSessions.get(gameId);
}

/**
 * Get the number of active sessions.
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Handle player disconnect timeout — cancel the game.
 *
 * Called by the presence event handler when a player's grace period expires.
 */
export function handlePlayerDisconnectTimeout(
  roomId: string,
  userId: string,
): ProcessActionResult | undefined {
  const gameId = roomToGame.get(roomId);
  if (!gameId) return undefined;

  const session = activeSessions.get(gameId);
  if (!session) return undefined;

  // Only cancel if game is still in progress
  if (session.state.phase === 'finished' || session.state.phase === 'cancelled') {
    return undefined;
  }

  const cancelAction: GameAction = {
    type: 'CANCEL_GAME',
    reason: 'disconnect_timeout',
    disconnectedPlayerId: userId,
  };

  return applyAction(gameId, cancelAction);
}

/**
 * Build the GameSessionProvider interface for use by the realtime module.
 *
 * This is the bridge between the realtime event handlers and the game session
 * manager. The event handlers call these methods to process game actions
 * and broadcast state updates.
 */
export function createGameSessionProvider(): GameSessionProvider {
  return {
    getGameIdForRoom(roomId: string): string | undefined {
      return roomToGame.get(roomId);
    },

    getSanitizedState: getSanitizedState,

    async processAction(
      gameId: string,
      action: Record<string, unknown>,
    ): Promise<
      | { accepted: true; broadcastToRoom: (io: TypedSocketIOServer, roomId: string) => Promise<void> }
      | { accepted: false; reason: string; actionType: string }
    > {
      const session = activeSessions.get(gameId);
      if (!session) {
        return {
          accepted: false,
          reason: 'Game session not found',
          actionType: (action['type'] as string) ?? 'unknown',
        };
      }

      const gameAction = action as unknown as GameAction;
      const result = applyAction(gameId, gameAction);

      if (!result.accepted) {
        return {
          accepted: false,
          reason: result.error.message,
          actionType: gameAction.type,
        };
      }

      return {
        accepted: true,
        broadcastToRoom: async (io: TypedSocketIOServer, roomId: string): Promise<void> => {
          await broadcastStateToRoom(io, gameId, roomId, gameAction);
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------

/**
 * Broadcast a per-player sanitized state update to all players in a room.
 *
 * Each player receives their own sanitized view of the game state,
 * ensuring no player sees another's hidden cards.
 */
export async function broadcastStateToRoom(
  io: TypedSocketIOServer,
  gameId: string,
  roomId: string,
  lastAction: GameAction,
): Promise<void> {
  const session = activeSessions.get(gameId);
  if (!session) return;

  const now = new Date().toISOString();

  // Get all sockets in the room
  const room = io.in(roomId);
  const socketsInRoom = await io.in(roomId).fetchSockets();

  for (const socket of socketsInRoom) {
    const playerId = socket.data.userId;
    const sanitized = sanitizeStateForPlayer(session.state, playerId);

    socket.emit('game:state_update', {
      gameId,
      state: sanitized,
      lastAction: {
        type: lastAction.type,
        playerId: 'playerId' in lastAction ? lastAction.playerId : 'system',
        timestamp: now,
      },
    });
  }

  // Check for game completion broadcast
  if (session.state.phase === 'finished' || session.state.phase === 'cancelled') {
    const winnerId = findWinner(session.state);
    const reason = session.state.phase === 'finished' ? 'completed' as const : 'cancelled' as const;

    // Broadcast game:ended to entire room (no per-player sanitization needed for final state)
    // Use the first player's view for the final state broadcast
    const finalState = sanitizeStateForPlayer(session.state, session.playerIds[0]!);

    room.emit('game:ended', {
      gameId,
      result: {
        winnerId: winnerId ?? '',
        reason,
        finalState,
      },
    });
  }
}

/**
 * Broadcast game:started to all players in a room.
 * Each player receives their own sanitized initial state.
 */
export async function broadcastGameStarted(
  io: TypedSocketIOServer,
  gameId: string,
  roomId: string,
): Promise<void> {
  const session = activeSessions.get(gameId);
  if (!session) return;

  const socketsInRoom = await io.in(roomId).fetchSockets();

  for (const socket of socketsInRoom) {
    const playerId = socket.data.userId;
    const sanitized = sanitizeStateForPlayer(session.state, playerId);

    socket.emit('game:started', {
      gameId,
      initialState: sanitized,
    });
  }
}

// ---------------------------------------------------------------------------
// Turn Timer
// ---------------------------------------------------------------------------

function startTurnTimer(session: GameSession): void {
  const turnTimerSeconds = session.state.config.turnTimerSeconds;
  if (turnTimerSeconds <= 0) return;

  const currentPlayerId = session.state.turnOrder[session.state.currentPlayerIndex];
  if (!currentPlayerId) return;

  // Don't start timers for finished/cancelled games
  if (session.state.phase === 'finished' || session.state.phase === 'cancelled') return;

  session.turnTimer = setTimeout(() => {
    logger.info(
      { gameId: session.gameId, playerId: currentPlayerId },
      'Turn timer expired, forfeiting turn',
    );

    const timeoutAction: GameAction = {
      type: 'TIMEOUT_FORFEIT',
      playerId: currentPlayerId,
    };

    const result = applyAction(session.gameId, timeoutAction);

    if (result.accepted) {
      logger.debug(
        { gameId: session.gameId, playerId: currentPlayerId },
        'Timeout forfeit applied successfully',
      );
    } else {
      logger.warn(
        { gameId: session.gameId, playerId: currentPlayerId, error: result.error },
        'Timeout forfeit rejected',
      );
    }
  }, turnTimerSeconds * 1000);

  // Prevent timer from keeping the process alive
  if (session.turnTimer.unref) {
    session.turnTimer.unref();
  }
}

function clearTurnTimer(session: GameSession): void {
  if (session.turnTimer) {
    clearTimeout(session.turnTimer);
    session.turnTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

async function snapshotToRedis(session: GameSession): Promise<void> {
  try {
    const redis = getRedisClient();
    const snapshot = {
      gameId: session.gameId,
      roomId: session.roomId,
      playerIds: session.playerIds,
      seed: session.seed,
      state: session.state,
      startedAt: session.startedAt,
      actionCount: session.actionLog.length,
      snapshotAt: new Date().toISOString(),
    };

    const pipeline = redis.pipeline();
    pipeline.set(gameSnapshotKey(session.gameId), JSON.stringify(snapshot));
    pipeline.set(roomGameKey(session.roomId), session.gameId);
    await pipeline.exec();

    session.lastSnapshotActionCount = session.state.actionCount;
    session.lastSnapshotTime = Date.now();

    logger.debug(
      { gameId: session.gameId, actionCount: session.state.actionCount },
      'Game state snapshotted to Redis',
    );
  } catch (err) {
    logger.error({ err, gameId: session.gameId }, 'Failed to snapshot game state to Redis');
  }
}

async function maybeSnapshot(session: GameSession): Promise<void> {
  let config: { GAME_SNAPSHOT_INTERVAL_ACTIONS: number; GAME_SNAPSHOT_INTERVAL_SECONDS: number };
  try {
    config = getConfig();
  } catch {
    config = { GAME_SNAPSHOT_INTERVAL_ACTIONS: 10, GAME_SNAPSHOT_INTERVAL_SECONDS: 30 };
  }

  const actionsSinceSnapshot = session.state.actionCount - session.lastSnapshotActionCount;
  const timeSinceSnapshot = Date.now() - session.lastSnapshotTime;

  if (
    actionsSinceSnapshot >= config.GAME_SNAPSHOT_INTERVAL_ACTIONS ||
    timeSinceSnapshot >= config.GAME_SNAPSHOT_INTERVAL_SECONDS * 1000
  ) {
    await snapshotToRedis(session);
  }
}

// ---------------------------------------------------------------------------
// Game Completion
// ---------------------------------------------------------------------------

async function handleGameCompletion(
  session: GameSession,
  finalState: GameState,
): Promise<void> {
  clearTurnTimer(session);

  const endedAt = new Date().toISOString();
  const startTime = new Date(session.startedAt).getTime();
  const endTime = new Date(endedAt).getTime();
  const durationSeconds = Math.round((endTime - startTime) / 1000);

  const completionData: GameCompletionData = {
    gameId: session.gameId,
    roomId: session.roomId,
    winnerId: findWinner(finalState),
    phase: finalState.phase as 'finished' | 'cancelled',
    playerIds: session.playerIds,
    config: finalState.config,
    seed: session.seed,
    actionCount: finalState.actionCount,
    durationSeconds,
    startedAt: session.startedAt,
    endedAt,
  };

  // Persist to PostgreSQL
  await persistGameResult(completionData, session);

  // Final snapshot to Redis
  await snapshotToRedis(session);

  // Clean up Redis game keys after a delay (allow reconnects to still fetch state)
  setTimeout(async () => {
    try {
      const redis = getRedisClient();
      await redis.del(gameSnapshotKey(session.gameId));
      await redis.del(roomGameKey(session.roomId));
    } catch (err) {
      logger.error({ err, gameId: session.gameId }, 'Failed to clean up Redis game keys');
    }
  }, 60_000).unref();

  // Remove from active sessions
  activeSessions.delete(session.gameId);
  roomToGame.delete(session.roomId);

  logger.info(
    {
      gameId: session.gameId,
      roomId: session.roomId,
      winnerId: completionData.winnerId,
      phase: completionData.phase,
      durationSeconds,
      actionCount: completionData.actionCount,
    },
    'Game completed',
  );
}

function findWinner(state: GameState): string | null {
  if (state.phase !== 'finished') return null;

  // Winner is a player with no cards left (hand, faceUp, faceDown all empty)
  for (const player of state.players) {
    if (
      player.hand.length === 0 &&
      player.faceUpCards.length === 0 &&
      player.faceDownCards.length === 0
    ) {
      return player.id;
    }
  }

  return null;
}

async function persistGameResult(
  data: GameCompletionData,
  session: GameSession,
): Promise<void> {
  try {
    const pool = getPool();

    // Insert game record
    await pool.query(
      `INSERT INTO games (id, room_id, winner_user_id, phase, player_ids, config, rng_seed, action_count, duration_seconds, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        data.gameId,
        data.roomId,
        data.winnerId,
        data.phase,
        data.playerIds,
        JSON.stringify(data.config),
        data.seed,
        data.actionCount,
        data.durationSeconds,
        data.startedAt,
        data.endedAt,
      ],
    );

    // Persist action log (event sourcing)
    for (const entry of session.actionLog) {
      const actionPlayerId = 'playerId' in entry.action ? entry.action.playerId : null;
      await pool.query(
        `INSERT INTO game_actions (game_id, index, action_type, action_payload, player_id, "timestamp")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          data.gameId,
          entry.index,
          entry.action.type,
          JSON.stringify(entry.action),
          actionPlayerId,
          entry.timestamp,
        ],
      );
    }

    logger.info(
      { gameId: data.gameId, actionCount: session.actionLog.length },
      'Game result persisted to PostgreSQL',
    );
  } catch (err) {
    logger.error({ err, gameId: data.gameId }, 'Failed to persist game result');
  }
}

// ---------------------------------------------------------------------------
// Recovery from Redis snapshot
// ---------------------------------------------------------------------------

/**
 * Attempt to recover a game session from a Redis snapshot.
 *
 * @param roomId - The room ID to recover a game for.
 * @returns The recovered session, or undefined if no snapshot exists.
 */
export async function recoverSession(roomId: string): Promise<GameSession | undefined> {
  try {
    const redis = getRedisClient();
    const gameId = await redis.get(roomGameKey(roomId));
    if (!gameId) return undefined;

    const raw = await redis.get(gameSnapshotKey(gameId));
    if (!raw) return undefined;

    const snapshot = JSON.parse(raw) as {
      gameId: string;
      roomId: string;
      playerIds: string[];
      seed: number;
      state: GameState;
      startedAt: string;
      actionCount: number;
    };

    const session: GameSession = {
      gameId: snapshot.gameId,
      roomId: snapshot.roomId,
      playerIds: snapshot.playerIds,
      seed: snapshot.seed,
      state: snapshot.state,
      startedAt: snapshot.startedAt,
      actionLog: [], // Action log is not recovered; only the state matters
      turnTimer: null,
      lastSnapshotActionCount: snapshot.state.actionCount,
      lastSnapshotTime: Date.now(),
    };

    // Store in memory
    activeSessions.set(session.gameId, session);
    roomToGame.set(session.roomId, session.gameId);

    // Restart turn timer if game is still in progress
    if (session.state.phase !== 'finished' && session.state.phase !== 'cancelled') {
      startTurnTimer(session);
    }

    logger.info(
      { gameId: session.gameId, roomId: session.roomId },
      'Game session recovered from Redis',
    );

    return session;
  } catch (err) {
    logger.error({ err, roomId }, 'Failed to recover game session');
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// AI Controller Integration
// ---------------------------------------------------------------------------

async function notifyAITurnChange(
  gameId: string,
  playerId: string,
  gameState: GameState,
): Promise<void> {
  try {
    const { onTurnChange } = await import('../ai/controller.js');
    onTurnChange(gameId, playerId, gameState);
  } catch {
    // AI module not available or player is not AI — silently ignore
  }
}

async function notifyAIGameEnded(gameId: string): Promise<void> {
  try {
    const { onGameEnded } = await import('../ai/controller.js');
    onGameEnded(gameId);
  } catch {
    // AI module not available — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Cleanup / Testing
// ---------------------------------------------------------------------------

/**
 * Remove a game session (for cleanup or testing).
 */
export function removeSession(gameId: string): void {
  const session = activeSessions.get(gameId);
  if (session) {
    clearTurnTimer(session);
    activeSessions.delete(gameId);
    roomToGame.delete(session.roomId);
  }
}

/**
 * Reset all game session state (for testing only).
 */
export function resetSessionManager(): void {
  for (const session of activeSessions.values()) {
    clearTurnTimer(session);
  }
  activeSessions.clear();
  roomToGame.clear();
}

/**
 * Snapshot all active sessions to Redis (for graceful shutdown).
 */
export async function snapshotAllSessions(): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const session of activeSessions.values()) {
    promises.push(snapshotToRedis(session));
  }

  await Promise.allSettled(promises);

  logger.info(
    { sessionCount: activeSessions.size },
    'All active sessions snapshotted',
  );
}
