/**
 * Health check Express router.
 *
 * Provides three endpoints for Kubernetes probes and load balancer decisions:
 * - GET /health/live   -- Liveness probe (process is running)
 * - GET /health/ready  -- Readiness probe (DB + Redis connected)
 * - GET /health/capacity -- Capacity check (load metrics)
 *
 * @see docs/specs/observability-stack.md Section 2.5
 */

import { Router, type Request, type Response } from 'express';
import os from 'node:os';

import { checkPoolHealth } from '../../infra/database/index.js';
import { checkRedisHealth } from '../../infra/redis/index.js';
import { getConfig } from '../config/index.js';
import { createModuleLogger } from '../logger.js';

const logger = createModuleLogger('infra');

/** Maximum acceptable dependency latency (ms) before marking as down. */
const MAX_DEPENDENCY_LATENCY_MS = 5000;

/** Process start time for uptime calculation. */
const startTime = Date.now();

/**
 * Dependency check result as returned in the readiness response.
 */
interface DependencyCheck {
  readonly status: 'up' | 'down';
  readonly latencyMs: number;
  readonly error?: string | undefined;
}

/**
 * GET /health/live
 *
 * Kubernetes liveness probe. If this handler responds, the process is alive.
 * No dependency checks are performed.
 */
function handleLive(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /health/ready
 *
 * Kubernetes readiness probe. Checks that PostgreSQL and Redis are reachable
 * and responding within the latency threshold.
 */
async function handleReady(_req: Request, res: Response): Promise<void> {
  const [pgResult, redisResult] = await Promise.all([
    checkPoolHealth(),
    checkRedisHealth(),
  ]);

  const pgCheck: DependencyCheck = {
    status: pgResult.status === 'healthy' && pgResult.latencyMs < MAX_DEPENDENCY_LATENCY_MS ? 'up' : 'down',
    latencyMs: pgResult.latencyMs,
    ...(pgResult.error ? { error: pgResult.error } : {}),
  };

  const redisCheck: DependencyCheck = {
    status: redisResult.status === 'healthy' && redisResult.latencyMs < MAX_DEPENDENCY_LATENCY_MS ? 'up' : 'down',
    latencyMs: redisResult.latencyMs,
    ...(redisResult.error ? { error: redisResult.error } : {}),
  };

  const allUp = pgCheck.status === 'up' && redisCheck.status === 'up';
  const statusCode = allUp ? 200 : 503;

  res.status(statusCode).json({
    status: allUp ? 'ready' : 'not_ready',
    checks: {
      postgres: pgCheck,
      redis: redisCheck,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Measure event loop lag by scheduling a timer and comparing actual vs expected delay.
 */
function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    setImmediate(() => {
      const lag = performance.now() - start;
      resolve(Math.round(lag * 100) / 100);
    });
  });
}

/**
 * GET /health/capacity
 *
 * Returns load metrics for autoscaler and load balancer decisions.
 * Returns 503 if at capacity.
 */
async function handleCapacity(_req: Request, res: Response): Promise<void> {
  const config = getConfig();

  // Placeholder values for modules not yet built
  const activeGames = 0;
  const activeConnections = 0;
  const maxGamesPerInstance = config.MAX_GAMES_PER_INSTANCE;

  // CPU usage
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    totalIdle += cpu.times.idle;
    totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  const cpuUsagePercent = totalTick > 0
    ? Math.round((1 - totalIdle / totalTick) * 10000) / 100
    : 0;

  // Memory usage
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryUsagePercent = totalMem > 0
    ? Math.round(((totalMem - freeMem) / totalMem) * 10000) / 100
    : 0;

  // Event loop lag
  const eventLoopLagMs = await measureEventLoopLag();

  const atCapacity = activeGames >= maxGamesPerInstance;
  const statusCode = atCapacity ? 503 : 200;

  res.status(statusCode).json({
    status: atCapacity ? 'at_capacity' : 'accepting',
    activeGames,
    activeConnections,
    maxGamesPerInstance,
    cpuUsagePercent,
    memoryUsagePercent,
    eventLoopLagMs,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Async route handler wrapper that catches promise rejections
 * and forwards them to Express error handling.
 */
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => void {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      logger.error({ err }, 'Health check handler error');
      if (!res.headersSent) {
        res.status(500).json({
          status: 'error',
          message: 'Internal health check error',
          timestamp: new Date().toISOString(),
        });
      }
    });
  };
}

/**
 * Create the health check router.
 *
 * Mount at `/health` in the Express app:
 * ```
 * app.use('/health', createHealthRouter());
 * ```
 */
export function createHealthRouter(): Router {
  const router = Router();

  router.get('/live', handleLive);
  router.get('/ready', asyncHandler(handleReady));
  router.get('/capacity', asyncHandler(handleCapacity));

  return router;
}
