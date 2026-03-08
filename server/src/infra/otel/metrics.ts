/**
 * Prometheus metrics registry and HTTP endpoint.
 *
 * Exposes all application metrics on a dedicated port (default 9464) in
 * Prometheus exposition format. Metrics are organized into four categories:
 * system, business, error, and capacity.
 *
 * The metrics port is separate from the main application port to prevent
 * Prometheus scrape traffic from appearing in application request metrics.
 *
 * @see docs/specs/observability-stack.md Section 3 (Metrics Catalog)
 */

import { createServer, type Server } from 'node:http';

import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

import { createModuleLogger } from '../../shared/logger.js';

// ---------------------------------------------------------------------------
// Registry and logger
// ---------------------------------------------------------------------------

const registry = new Registry();
const logger = createModuleLogger('infra');

/**
 * Standard histogram buckets for latency metrics (milliseconds).
 * @see docs/specs/observability-stack.md Section 3.1
 */
const LATENCY_BUCKETS_MS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/**
 * Histogram buckets for game duration (seconds).
 * @see docs/specs/observability-stack.md Section 3.2
 */
const GAME_DURATION_BUCKETS_S = [30, 60, 120, 300, 600, 900, 1800, 3600];

// ---------------------------------------------------------------------------
// 3.1 System Metrics
// ---------------------------------------------------------------------------

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request latency distribution in milliseconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: LATENCY_BUCKETS_MS,
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const wsConnectionsActive = new Gauge({
  name: 'ws_connections_active',
  help: 'Currently open WebSocket connections',
  labelNames: ['server_id'] as const,
  registers: [registry],
});

export const wsMessagesTotal = new Counter({
  name: 'ws_messages_total',
  help: 'WebSocket messages sent and received',
  labelNames: ['event_type', 'direction'] as const,
  registers: [registry],
});

export const dbPoolActiveConnections = new Gauge({
  name: 'db_pool_active_connections',
  help: 'Active PostgreSQL connections in pool',
  labelNames: ['pool_name'] as const,
  registers: [registry],
});

export const dbPoolWaitingCount = new Gauge({
  name: 'db_pool_waiting_count',
  help: 'Requests waiting for a database connection',
  labelNames: ['pool_name'] as const,
  registers: [registry],
});

export const dbQueryDurationMs = new Histogram({
  name: 'db_query_duration_ms',
  help: 'PostgreSQL query latency in milliseconds',
  labelNames: ['operation', 'table'] as const,
  buckets: LATENCY_BUCKETS_MS,
  registers: [registry],
});

export const redisCommandDurationMs = new Histogram({
  name: 'redis_command_duration_ms',
  help: 'Redis command latency in milliseconds',
  labelNames: ['command'] as const,
  buckets: LATENCY_BUCKETS_MS,
  registers: [registry],
});

export const redisConnectionsActive = new Gauge({
  name: 'redis_connections_active',
  help: 'Active Redis connections',
  labelNames: ['purpose'] as const,
  registers: [registry],
});

export const eventLoopLagMs = new Histogram({
  name: 'event_loop_lag_ms',
  help: 'Node.js event loop lag in milliseconds',
  buckets: LATENCY_BUCKETS_MS,
  registers: [registry],
});

export const processMemoryBytes = new Gauge({
  name: 'process_memory_bytes',
  help: 'Process memory usage in bytes',
  labelNames: ['type'] as const,
  registers: [registry],
});

export const processCpuUsagePercent = new Gauge({
  name: 'process_cpu_usage_percent',
  help: 'Process CPU usage percentage',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// 3.2 Business Metrics
// ---------------------------------------------------------------------------

export const sbobuzGamesActive = new Gauge({
  name: 'sbobuz_games_active',
  help: 'Live games currently in progress',
  labelNames: ['player_count'] as const,
  registers: [registry],
});

export const sbobuzGamesStartedTotal = new Counter({
  name: 'sbobuz_games_started_total',
  help: 'Total games that have started',
  labelNames: ['player_count'] as const,
  registers: [registry],
});

export const sbobuzGamesCompletedTotal = new Counter({
  name: 'sbobuz_games_completed_total',
  help: 'Completed games by outcome',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const sbobuzGameDurationSeconds = new Histogram({
  name: 'sbobuz_game_duration_seconds',
  help: 'Game duration distribution in seconds',
  labelNames: ['player_count'] as const,
  buckets: GAME_DURATION_BUCKETS_S,
  registers: [registry],
});

export const sbobuzGameActionsTotal = new Counter({
  name: 'sbobuz_game_actions_total',
  help: 'Total game actions processed',
  labelNames: ['action_type'] as const,
  registers: [registry],
});

export const sbobuzGameActionsPerGame = new Histogram({
  name: 'sbobuz_game_actions_per_game',
  help: 'Actions per completed game',
  labelNames: ['player_count'] as const,
  buckets: [5, 10, 20, 50, 100, 200, 500],
  registers: [registry],
});

export const sbobuzRoomsActive = new Gauge({
  name: 'sbobuz_rooms_active',
  help: 'Active rooms in lobby',
  labelNames: ['visibility'] as const,
  registers: [registry],
});

export const sbobuzUsersRegisteredTotal = new Counter({
  name: 'sbobuz_users_registered_total',
  help: 'Total user registrations',
  registers: [registry],
});

export const sbobuzAiMoveDurationMs = new Histogram({
  name: 'sbobuz_ai_move_duration_ms',
  help: 'AI opponent computation time in milliseconds',
  labelNames: ['difficulty'] as const,
  buckets: LATENCY_BUCKETS_MS,
  registers: [registry],
});

export const sbobuzAiMovesTotal = new Counter({
  name: 'sbobuz_ai_moves_total',
  help: 'Total AI moves computed',
  labelNames: ['difficulty'] as const,
  registers: [registry],
});

// ---------------------------------------------------------------------------
// 3.3 Error Metrics
// ---------------------------------------------------------------------------

export const sbobuzErrorsTotal = new Counter({
  name: 'sbobuz_errors_total',
  help: 'Application errors by module and code',
  labelNames: ['module', 'error_code'] as const,
  registers: [registry],
});

export const sbobuzGameEngineErrorsTotal = new Counter({
  name: 'sbobuz_game_engine_errors_total',
  help: 'Failed state transitions in the game engine',
  labelNames: ['error_type'] as const,
  registers: [registry],
});

export const sbobuzAuthFailuresTotal = new Counter({
  name: 'sbobuz_auth_failures_total',
  help: 'Authentication failures',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const sbobuzWsDisconnectsTotal = new Counter({
  name: 'sbobuz_ws_disconnects_total',
  help: 'WebSocket disconnections by cause',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const sbobuzRateLimitHitsTotal = new Counter({
  name: 'sbobuz_rate_limit_hits_total',
  help: 'Rate limit activations',
  labelNames: ['endpoint', 'limit_type'] as const,
  registers: [registry],
});

export const sbobuzUnhandledExceptionsTotal = new Counter({
  name: 'sbobuz_unhandled_exceptions_total',
  help: 'Unhandled exceptions caught by global handler',
  labelNames: ['module'] as const,
  registers: [registry],
});

// ---------------------------------------------------------------------------
// 3.4 Capacity Metrics
// ---------------------------------------------------------------------------

export const sbobuzGamesPerInstance = new Gauge({
  name: 'sbobuz_games_per_instance',
  help: 'Games running on each instance',
  labelNames: ['server_id'] as const,
  registers: [registry],
});

export const sbobuzInstanceHeadroomPercent = new Gauge({
  name: 'sbobuz_instance_headroom_percent',
  help: 'Remaining capacity percentage',
  labelNames: ['server_id'] as const,
  registers: [registry],
});

export const sbobuzRedisMemoryUsedBytes = new Gauge({
  name: 'sbobuz_redis_memory_used_bytes',
  help: 'Redis memory consumption in bytes',
  registers: [registry],
});

export const sbobuzRedisKeysTotal = new Gauge({
  name: 'sbobuz_redis_keys_total',
  help: 'Redis key count by pattern',
  labelNames: ['key_pattern'] as const,
  registers: [registry],
});

export const sbobuzPostgresConnectionsUsedPercent = new Gauge({
  name: 'sbobuz_postgres_connections_used_percent',
  help: 'PostgreSQL connection pool usage percentage',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Default Node.js process metrics
// ---------------------------------------------------------------------------

// Collect default metrics (GC, event loop, active handles, etc.)
// These complement our custom process_memory_bytes and process_cpu_usage_percent.
collectDefaultMetrics({ register: registry, prefix: '' });

// ---------------------------------------------------------------------------
// Event loop lag collector
// ---------------------------------------------------------------------------

let eventLoopLagInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Start periodic collection of event loop lag.
 *
 * Measures how long a setImmediate callback is delayed beyond the expected
 * immediate execution. A high lag indicates CPU saturation or long synchronous
 * operations blocking the event loop.
 */
function startEventLoopLagCollection(): void {
  if (eventLoopLagInterval) {
    return;
  }

  eventLoopLagInterval = setInterval(() => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lagNs = Number(process.hrtime.bigint() - start);
      const lagMs = lagNs / 1_000_000;
      eventLoopLagMs.observe(lagMs);
    });
  }, 1000);

  // Prevent the interval from keeping the process alive during shutdown
  eventLoopLagInterval.unref();
}

// ---------------------------------------------------------------------------
// Process metrics collector
// ---------------------------------------------------------------------------

let processMetricsInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Start periodic collection of process memory and CPU metrics.
 */
function startProcessMetricsCollection(): void {
  if (processMetricsInterval) {
    return;
  }

  let previousCpuUsage = process.cpuUsage();
  let previousTime = process.hrtime.bigint();

  processMetricsInterval = setInterval(() => {
    // Memory metrics
    const mem = process.memoryUsage();
    processMemoryBytes.set({ type: 'rss' }, mem.rss);
    processMemoryBytes.set({ type: 'heap_used' }, mem.heapUsed);
    processMemoryBytes.set({ type: 'heap_total' }, mem.heapTotal);

    // CPU usage percentage (user + system time / elapsed wall-clock time)
    const currentCpuUsage = process.cpuUsage(previousCpuUsage);
    const currentTime = process.hrtime.bigint();
    const elapsedUs = Number(currentTime - previousTime) / 1000; // nanoseconds to microseconds
    const cpuPercent = elapsedUs > 0
      ? ((currentCpuUsage.user + currentCpuUsage.system) / elapsedUs) * 100
      : 0;

    processCpuUsagePercent.set(Math.round(cpuPercent * 100) / 100);

    previousCpuUsage = process.cpuUsage();
    previousTime = process.hrtime.bigint();
  }, 5000);

  processMetricsInterval.unref();
}

// ---------------------------------------------------------------------------
// Metrics HTTP server
// ---------------------------------------------------------------------------

let metricsServer: Server | undefined;

/**
 * Start the Prometheus metrics HTTP server.
 *
 * Exposes the `/metrics` endpoint on the configured port (default 9464).
 * This is a separate server from the main application to avoid polluting
 * application request metrics with Prometheus scrape traffic.
 *
 * @param port - The port to listen on. Defaults to 9464.
 * @returns The HTTP server instance.
 */
export async function startMetricsServer(port = 9464): Promise<Server> {
  if (metricsServer) {
    return metricsServer;
  }

  // Start background collectors
  startEventLoopLagCollection();
  startProcessMetricsCollection();

  metricsServer = createServer(async (req, res) => {
    if (req.url === '/metrics' && req.method === 'GET') {
      try {
        const metrics = await registry.metrics();
        res.setHeader('Content-Type', registry.contentType);
        res.writeHead(200);
        res.end(metrics);
      } catch (err: unknown) {
        logger.error({ err }, 'Failed to generate metrics');
        res.writeHead(500);
        res.end('Internal Server Error');
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise<void>((resolve, reject) => {
    metricsServer!.listen(port, () => {
      logger.info({ port }, 'Prometheus metrics server listening');
      resolve();
    });
    metricsServer!.on('error', reject);
  });

  return metricsServer;
}

/**
 * Stop the Prometheus metrics HTTP server and background collectors.
 */
export async function stopMetricsServer(): Promise<void> {
  if (eventLoopLagInterval) {
    clearInterval(eventLoopLagInterval);
    eventLoopLagInterval = undefined;
  }

  if (processMetricsInterval) {
    clearInterval(processMetricsInterval);
    processMetricsInterval = undefined;
  }

  if (metricsServer) {
    await new Promise<void>((resolve, reject) => {
      metricsServer!.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    metricsServer = undefined;
  }
}

/**
 * Get the Prometheus registry instance.
 * Useful for tests or custom metric registration.
 */
export function getRegistry(): Registry {
  return registry;
}

/**
 * Reset all metrics to their initial values.
 * For testing only.
 */
export function resetMetrics(): void {
  registry.resetMetrics();
}
