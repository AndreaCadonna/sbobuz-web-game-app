/**
 * Express server composition root.
 *
 * Wires all infrastructure modules together: config, logger, database,
 * Redis, health checks. Handles graceful shutdown on SIGTERM/SIGINT.
 *
 * @see docs/specs/infrastructure-deployment.md Section 8
 */

import { createServer, type Server } from 'node:http';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';

import type { ApiErrorResponse } from '@sbobuz/shared';

import { createPool, closePool, runMigrations, getPool } from './infra/database/index.js';
import { createRedisClients, closeRedisClients } from './infra/redis/index.js';
import { createSocketIOServer, closeSocketIOServer } from './infra/websocket/setup.js';
import { loadConfig, type ServerConfig } from './shared/config/index.js';
import { runWithContext, generateRequestId, generateTraceId, generateSpanId } from './shared/context.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createLobbyRouter } from './modules/lobby/routes.js';
import { createLeaderboardRouter } from './modules/leaderboard/routes.js';
import { initializeRealtimeModule, shutdownRealtimeModule, setGameSessionProvider } from './modules/realtime/index.js';
import { createGameSessionProvider, snapshotAllSessions, resetSessionManager, applyAction as sessionApplyAction, getGameState as sessionGetGameState } from './modules/game-engine/session-manager.js';
import { initLogger, createModuleLogger } from './shared/logger.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { createHealthRouter } from './shared/middleware/health.js';

/**
 * Create and configure the Express application.
 *
 * This function is separated from `startServer` to allow importing the app
 * in tests without starting the HTTP listener.
 *
 * @param config - Validated server configuration.
 * @returns The configured Express application.
 */
export function createApp(config: ServerConfig): Express {
  const app = express();

  // --- Security & parsing middleware ---
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: config.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );

  // --- Request context middleware ---
  // Assigns a unique requestId, traceId, and spanId to each request
  // and runs the handler within AsyncLocalStorage context.
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();
    const traceId = (req.headers['x-trace-id'] as string | undefined) ?? generateTraceId();
    const spanId = generateSpanId();

    res.setHeader('x-request-id', requestId);

    runWithContext({ requestId, traceId, spanId }, () => {
      next();
    });
  });

  // --- Request logging middleware ---
  const requestLogger = createModuleLogger('gateway');
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const start = performance.now();

    res.on('finish', () => {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      requestLogger.info(
        {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          durationMs,
          contentLength: res.getHeader('content-length'),
        },
        'request_completed',
      );
    });

    next();
  });

  // --- Health check routes (no auth required) ---
  app.use('/health', createHealthRouter());

  // --- API routes ---
  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/lobby', createLobbyRouter());
  app.use('/api/v1/leaderboard', createLeaderboardRouter());

  // --- 404 handler ---
  app.use((_req: Request, res: Response): void => {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource does not exist',
        requestId: (res.getHeader('X-Request-Id') as string | undefined) ?? '',
        timestamp: new Date().toISOString(),
      },
    };
    res.status(404).json(body);
  });

  // --- Global error handler (must be last) ---
  app.use(errorHandler);

  return app;
}

/**
 * Adapter: wraps session-manager's applyAction for the AI controller callback.
 * AI controller expects { accepted: true; newState } | { accepted: false; reason: string }.
 * Also broadcasts state update to all players via Socket.IO after a successful action.
 */
function applyActionForAI(
  gameId: string,
  action: import('@sbobuz/shared').GameAction,
): { accepted: true; newState: import('@sbobuz/shared').GameState } | { accepted: false; reason: string } {
  const result = sessionApplyAction(gameId, action);
  if (result.accepted) {
    // Broadcast updated state to all players (async, best-effort)
    void (async () => {
      try {
        const { getSocketIOServer } = await import('./infra/websocket/setup.js');
        const { broadcastStateToRoom, getSession } = await import('./modules/game-engine/session-manager.js');
        const session = getSession(gameId);
        if (session) {
          const io = getSocketIOServer();
          await broadcastStateToRoom(io, gameId, session.roomId, action);
        }
      } catch {
        // Best-effort broadcast
      }
    })();
    return { accepted: true, newState: result.newState };
  }
  return { accepted: false, reason: result.error.message };
}

/**
 * Adapter: wraps session-manager's getGameState for the AI controller callback.
 */
function getGameStateForAI(gameId: string): import('@sbobuz/shared').GameState | undefined {
  return sessionGetGameState(gameId);
}

/**
 * Start the server: initialize all infrastructure, create the HTTP server,
 * and listen on the configured port.
 *
 * @returns The HTTP server instance and config (for shutdown handling).
 */
export async function startServer(): Promise<{ server: Server; config: ServerConfig }> {
  // 1. Load and validate config
  const config = loadConfig();

  // 2. Initialize logger
  const pretty = config.NODE_ENV === 'development';
  initLogger(config.LOG_LEVEL, pretty);
  const logger = createModuleLogger('infra');

  logger.info({ env: config.NODE_ENV, serverId: config.SERVER_ID }, 'Starting sbobuz-server');

  // 3. Initialize database pool
  createPool(config);
  logger.info('PostgreSQL pool initialized');

  // 4. Run migrations if configured
  if (config.MIGRATE_ON_STARTUP) {
    logger.info('Running database migrations...');
    const pool = getPool();
    await runMigrations(pool);
    logger.info('Database migrations complete');
  }

  // 5. Initialize Redis clients
  createRedisClients(config);
  logger.info('Redis clients initialized');

  // 6. Create Express app
  const app = createApp(config);

  // 7. Create HTTP server and listen
  const httpServer = createServer(app);

  // 8. Create Socket.IO server and attach to HTTP server
  const io = createSocketIOServer(httpServer, config);
  logger.info('Socket.IO server created');

  // 9. Initialize game session manager and wire into realtime module
  const gameSessionProvider = createGameSessionProvider();
  setGameSessionProvider(gameSessionProvider);
  logger.info('Game session manager wired to realtime module');

  // 10. Register AI controller callbacks
  const { registerCallbacks: registerAICallbacks } = await import('./modules/ai/controller.js');
  registerAICallbacks(
    (gameId, action) => {
      const result = applyActionForAI(gameId, action);
      return result;
    },
    (gameId) => getGameStateForAI(gameId),
  );
  logger.info('AI controller callbacks registered');

  // 11. Initialize realtime module (registers event handlers, starts heartbeat)
  initializeRealtimeModule(io);
  logger.info('Realtime module initialized');

  await new Promise<void>((resolve) => {
    httpServer.listen(config.PORT, config.HOST, () => {
      logger.info(
        { port: config.PORT, host: config.HOST, env: config.NODE_ENV },
        'Server listening',
      );
      resolve();
    });
  });

  // 11. Register graceful shutdown handlers
  const shutdown = createShutdownHandler(httpServer, io, logger);

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, starting graceful shutdown');
    void shutdown();
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, starting graceful shutdown');
    void shutdown();
  });

  return { server: httpServer, config };
}

/**
 * Create a shutdown handler that drains connections and closes resources.
 *
 * The handler:
 * 1. Shuts down the realtime module (notifies clients)
 * 2. Snapshots all active game sessions to Redis
 * 3. Closes the Socket.IO server
 * 4. Stops accepting new HTTP connections
 * 5. Closes the database pool
 * 6. Closes Redis clients
 * 7. Exits with code 0
 */
function createShutdownHandler(
  httpServer: Server,
  io: ReturnType<typeof createSocketIOServer>,
  logger: ReturnType<typeof createModuleLogger>,
): () => Promise<void> {
  let isShuttingDown = false;

  return async (): Promise<void> => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal');
      return;
    }
    isShuttingDown = true;

    logger.info('Graceful shutdown initiated');

    // 1. Shut down realtime module (emits server:draining to clients)
    try {
      shutdownRealtimeModule(io);
      logger.info('Realtime module shut down');
    } catch (err) {
      logger.error({ err }, 'Error shutting down realtime module');
    }

    // 2. Snapshot all active game sessions to Redis for crash recovery
    try {
      await snapshotAllSessions();
      logger.info('Game sessions snapshotted');
    } catch (err) {
      logger.error({ err }, 'Error snapshotting game sessions');
    }

    // 3. Close Socket.IO server
    try {
      await closeSocketIOServer();
      logger.info('Socket.IO server closed');
    } catch (err) {
      logger.error({ err }, 'Error closing Socket.IO server');
    }

    // 4. Stop accepting new HTTP connections
    await new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) {
          logger.error({ err }, 'Error closing HTTP server');
        } else {
          logger.info('HTTP server closed — no longer accepting connections');
        }
        resolve();
      });
    });

    // 5. Clean up game session manager
    resetSessionManager();

    // 6. Close database pool
    try {
      await closePool();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database pool');
    }

    // 7. Close Redis clients
    try {
      await closeRedisClients();
      logger.info('Redis clients closed');
    } catch (err) {
      logger.error({ err }, 'Error closing Redis clients');
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  };
}

// --- Main entry point ---
// Only start if this file is executed directly (not imported in tests)
const isDirectExecution = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');

if (isDirectExecution) {
  startServer().catch((err: unknown) => {
    // Use Pino if available, fallback to stderr for fatal startup errors
    try {
      const logger = createModuleLogger('infra');
      logger.error({ err }, 'Fatal: server failed to start');
    } catch {
      // If logger isn't initialized yet, write to stderr directly
      process.stderr.write(`Fatal: server failed to start: ${String(err)}\n`);
    }
    process.exit(1);
  });
}
