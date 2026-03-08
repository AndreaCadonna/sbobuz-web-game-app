/**
 * OpenTelemetry and Prometheus metrics barrel export.
 *
 * @see docs/specs/observability-stack.md
 */

// --- OTel tracing ---
export { initOtel, shutdownOtel, isOtelInitialized, tracedOperation } from './setup.js';
export type { SpanOptions } from './setup.js';

// --- Prometheus metrics ---
export {
  // Server lifecycle
  startMetricsServer,
  stopMetricsServer,
  getRegistry,
  resetMetrics,
  // System metrics
  httpRequestDurationMs,
  httpRequestsTotal,
  wsConnectionsActive,
  wsMessagesTotal,
  dbPoolActiveConnections,
  dbPoolWaitingCount,
  dbQueryDurationMs,
  redisCommandDurationMs,
  redisConnectionsActive,
  eventLoopLagMs,
  processMemoryBytes,
  processCpuUsagePercent,
  // Business metrics
  sbobuzGamesActive,
  sbobuzGamesStartedTotal,
  sbobuzGamesCompletedTotal,
  sbobuzGameDurationSeconds,
  sbobuzGameActionsTotal,
  sbobuzGameActionsPerGame,
  sbobuzRoomsActive,
  sbobuzUsersRegisteredTotal,
  sbobuzAiMoveDurationMs,
  sbobuzAiMovesTotal,
  // Error metrics
  sbobuzErrorsTotal,
  sbobuzGameEngineErrorsTotal,
  sbobuzAuthFailuresTotal,
  sbobuzWsDisconnectsTotal,
  sbobuzRateLimitHitsTotal,
  sbobuzUnhandledExceptionsTotal,
  // Capacity metrics
  sbobuzGamesPerInstance,
  sbobuzInstanceHeadroomPercent,
  sbobuzRedisMemoryUsedBytes,
  sbobuzRedisKeysTotal,
  sbobuzPostgresConnectionsUsedPercent,
} from './metrics.js';
