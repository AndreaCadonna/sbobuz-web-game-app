/**
 * Unit tests for the Prometheus metrics module.
 *
 * Tests verify metric registration, label correctness, the /metrics HTTP
 * endpoint, and background collectors.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Hoisted mocks ---

const { mockLogger } = vi.hoisted(() => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };

  return { mockLogger };
});

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: vi.fn(() => mockLogger),
}));

// --- Imports (after mocks) ---

import {
  getRegistry,
  resetMetrics,
  startMetricsServer,
  stopMetricsServer,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch the /metrics endpoint text from the test server. */
async function fetchMetrics(port: number): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/metrics`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/plain');
  return res.text();
}

// Use a dynamic port range to avoid conflicts with other tests
let testPort = 19464;

beforeEach(() => {
  testPort += 1;
  resetMetrics();
});

afterEach(async () => {
  await stopMetricsServer();
});

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe('metrics registry', () => {
  it('returns a valid prom-client Registry', () => {
    const registry = getRegistry();
    expect(registry).toBeDefined();
    expect(typeof registry.metrics).toBe('function');
  });

  it('contains all expected metric names', async () => {
    const metricsText = await getRegistry().metrics();

    const expectedNames = [
      'http_request_duration_ms',
      'http_requests_total',
      'ws_connections_active',
      'ws_messages_total',
      'db_pool_active_connections',
      'db_pool_waiting_count',
      'db_query_duration_ms',
      'redis_command_duration_ms',
      'redis_connections_active',
      'event_loop_lag_ms',
      'process_memory_bytes',
      'process_cpu_usage_percent',
      'sbobuz_games_active',
      'sbobuz_games_started_total',
      'sbobuz_games_completed_total',
      'sbobuz_game_duration_seconds',
      'sbobuz_game_actions_total',
      'sbobuz_game_actions_per_game',
      'sbobuz_rooms_active',
      'sbobuz_users_registered_total',
      'sbobuz_ai_move_duration_ms',
      'sbobuz_ai_moves_total',
      'sbobuz_errors_total',
      'sbobuz_game_engine_errors_total',
      'sbobuz_auth_failures_total',
      'sbobuz_ws_disconnects_total',
      'sbobuz_rate_limit_hits_total',
      'sbobuz_unhandled_exceptions_total',
      'sbobuz_games_per_instance',
      'sbobuz_instance_headroom_percent',
      'sbobuz_redis_memory_used_bytes',
      'sbobuz_redis_keys_total',
      'sbobuz_postgres_connections_used_percent',
    ];

    for (const name of expectedNames) {
      expect(metricsText).toContain(name);
    }
  });
});

// ---------------------------------------------------------------------------
// System metrics tests
// ---------------------------------------------------------------------------

describe('system metrics', () => {
  it('records http_request_duration_ms histogram with correct labels', async () => {
    httpRequestDurationMs.observe({ method: 'GET', route: '/api/v1/health', status_code: '200' }, 42);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('http_request_duration_ms_bucket{');
    expect(metricsText).toContain('method="GET"');
    expect(metricsText).toContain('route="/api/v1/health"');
    expect(metricsText).toContain('status_code="200"');
  });

  it('increments http_requests_total counter', async () => {
    httpRequestsTotal.inc({ method: 'POST', route: '/api/v1/auth/login', status_code: '200' });
    httpRequestsTotal.inc({ method: 'POST', route: '/api/v1/auth/login', status_code: '200' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('http_requests_total{method="POST",route="/api/v1/auth/login",status_code="200"} 2');
  });

  it('sets and reads ws_connections_active gauge', async () => {
    wsConnectionsActive.set({ server_id: 'test-1' }, 150);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('ws_connections_active{server_id="test-1"} 150');
  });

  it('increments ws_messages_total with direction labels', async () => {
    wsMessagesTotal.inc({ event_type: 'action:play_card', direction: 'inbound' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('ws_messages_total{event_type="action:play_card",direction="inbound"} 1');
  });

  it('tracks db pool connections and waiting count', async () => {
    dbPoolActiveConnections.set({ pool_name: 'main' }, 5);
    dbPoolWaitingCount.set({ pool_name: 'main' }, 2);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('db_pool_active_connections{pool_name="main"} 5');
    expect(metricsText).toContain('db_pool_waiting_count{pool_name="main"} 2');
  });

  it('observes db_query_duration_ms histogram', async () => {
    dbQueryDurationMs.observe({ operation: 'SELECT', table: 'users' }, 15);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('db_query_duration_ms_bucket{');
    expect(metricsText).toContain('operation="SELECT"');
    expect(metricsText).toContain('table="users"');
  });

  it('observes redis_command_duration_ms histogram', async () => {
    redisCommandDurationMs.observe({ command: 'SET' }, 1.5);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('redis_command_duration_ms_bucket{');
    expect(metricsText).toContain('command="SET"');
  });

  it('tracks redis_connections_active gauge', async () => {
    redisConnectionsActive.set({ purpose: 'pub' }, 1);
    redisConnectionsActive.set({ purpose: 'sub' }, 1);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('redis_connections_active{purpose="pub"} 1');
    expect(metricsText).toContain('redis_connections_active{purpose="sub"} 1');
  });

  it('observes event_loop_lag_ms histogram', async () => {
    eventLoopLagMs.observe(0.5);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('event_loop_lag_ms_bucket{');
  });

  it('tracks process memory by type', async () => {
    processMemoryBytes.set({ type: 'rss' }, 50_000_000);
    processMemoryBytes.set({ type: 'heap_used' }, 30_000_000);
    processMemoryBytes.set({ type: 'heap_total' }, 40_000_000);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('process_memory_bytes{type="rss"} 50000000');
    expect(metricsText).toContain('process_memory_bytes{type="heap_used"} 30000000');
    expect(metricsText).toContain('process_memory_bytes{type="heap_total"} 40000000');
  });

  it('sets process_cpu_usage_percent', async () => {
    processCpuUsagePercent.set(25.5);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('process_cpu_usage_percent 25.5');
  });
});

// ---------------------------------------------------------------------------
// Business metrics tests
// ---------------------------------------------------------------------------

describe('business metrics', () => {
  it('tracks active games gauge with player_count label', async () => {
    sbobuzGamesActive.set({ player_count: '2' }, 10);
    sbobuzGamesActive.set({ player_count: '4' }, 3);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_games_active{player_count="2"} 10');
    expect(metricsText).toContain('sbobuz_games_active{player_count="4"} 3');
  });

  it('increments games started counter', async () => {
    sbobuzGamesStartedTotal.inc({ player_count: '2' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_games_started_total{player_count="2"} 1');
  });

  it('counts completed games by result', async () => {
    sbobuzGamesCompletedTotal.inc({ result: 'finished' });
    sbobuzGamesCompletedTotal.inc({ result: 'finished' });
    sbobuzGamesCompletedTotal.inc({ result: 'cancelled' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_games_completed_total{result="finished"} 2');
    expect(metricsText).toContain('sbobuz_games_completed_total{result="cancelled"} 1');
  });

  it('observes game duration with correct buckets', async () => {
    sbobuzGameDurationSeconds.observe({ player_count: '2' }, 180);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_game_duration_seconds_bucket{');
    // 180s should be captured in the 300s bucket
    expect(metricsText).toContain('le="300"');
  });

  it('counts game actions by type', async () => {
    sbobuzGameActionsTotal.inc({ action_type: 'PLAY_CARD' });
    sbobuzGameActionsTotal.inc({ action_type: 'DRAW_CARD' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_game_actions_total{action_type="PLAY_CARD"} 1');
    expect(metricsText).toContain('sbobuz_game_actions_total{action_type="DRAW_CARD"} 1');
  });

  it('observes actions per game histogram', async () => {
    sbobuzGameActionsPerGame.observe({ player_count: '2' }, 45);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_game_actions_per_game_bucket{');
  });

  it('tracks active rooms by visibility', async () => {
    sbobuzRoomsActive.set({ visibility: 'public' }, 5);
    sbobuzRoomsActive.set({ visibility: 'private' }, 2);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_rooms_active{visibility="public"} 5');
    expect(metricsText).toContain('sbobuz_rooms_active{visibility="private"} 2');
  });

  it('increments user registration counter', async () => {
    sbobuzUsersRegisteredTotal.inc();

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_users_registered_total 1');
  });

  it('observes AI move duration by difficulty', async () => {
    sbobuzAiMoveDurationMs.observe({ difficulty: 'easy' }, 50);
    sbobuzAiMoveDurationMs.observe({ difficulty: 'medium' }, 200);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_ai_move_duration_ms_bucket{');
    expect(metricsText).toContain('difficulty="easy"');
    expect(metricsText).toContain('difficulty="medium"');
  });

  it('counts AI moves by difficulty', async () => {
    sbobuzAiMovesTotal.inc({ difficulty: 'easy' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_ai_moves_total{difficulty="easy"} 1');
  });
});

// ---------------------------------------------------------------------------
// Error metrics tests
// ---------------------------------------------------------------------------

describe('error metrics', () => {
  it('counts errors by module and code', async () => {
    sbobuzErrorsTotal.inc({ module: 'auth', error_code: 'INVALID_TOKEN' });
    sbobuzErrorsTotal.inc({ module: 'game-engine', error_code: 'INVALID_MOVE' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_errors_total{module="auth",error_code="INVALID_TOKEN"} 1');
    expect(metricsText).toContain('sbobuz_errors_total{module="game-engine",error_code="INVALID_MOVE"} 1');
  });

  it('counts game engine errors by type', async () => {
    sbobuzGameEngineErrorsTotal.inc({ error_type: 'invalid_state_transition' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_game_engine_errors_total{error_type="invalid_state_transition"} 1');
  });

  it('counts auth failures by reason', async () => {
    sbobuzAuthFailuresTotal.inc({ reason: 'expired' });
    sbobuzAuthFailuresTotal.inc({ reason: 'invalid_token' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_auth_failures_total{reason="expired"} 1');
    expect(metricsText).toContain('sbobuz_auth_failures_total{reason="invalid_token"} 1');
  });

  it('counts WebSocket disconnects by reason', async () => {
    sbobuzWsDisconnectsTotal.inc({ reason: 'clean' });
    sbobuzWsDisconnectsTotal.inc({ reason: 'timeout' });
    sbobuzWsDisconnectsTotal.inc({ reason: 'error' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_ws_disconnects_total{reason="clean"} 1');
    expect(metricsText).toContain('sbobuz_ws_disconnects_total{reason="timeout"} 1');
    expect(metricsText).toContain('sbobuz_ws_disconnects_total{reason="error"} 1');
  });

  it('counts rate limit hits by endpoint and type', async () => {
    sbobuzRateLimitHitsTotal.inc({ endpoint: '/api/v1/auth/login', limit_type: 'ip' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_rate_limit_hits_total{endpoint="/api/v1/auth/login",limit_type="ip"} 1');
  });

  it('counts unhandled exceptions by module', async () => {
    sbobuzUnhandledExceptionsTotal.inc({ module: 'realtime' });

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_unhandled_exceptions_total{module="realtime"} 1');
  });
});

// ---------------------------------------------------------------------------
// Capacity metrics tests
// ---------------------------------------------------------------------------

describe('capacity metrics', () => {
  it('tracks games per instance', async () => {
    sbobuzGamesPerInstance.set({ server_id: 'sbobuz-abc123' }, 42);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_games_per_instance{server_id="sbobuz-abc123"} 42');
  });

  it('tracks instance headroom percentage', async () => {
    sbobuzInstanceHeadroomPercent.set({ server_id: 'sbobuz-abc123' }, 79);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_instance_headroom_percent{server_id="sbobuz-abc123"} 79');
  });

  it('tracks Redis memory usage', async () => {
    sbobuzRedisMemoryUsedBytes.set(1_048_576);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_redis_memory_used_bytes 1048576');
  });

  it('tracks Redis key count by pattern', async () => {
    sbobuzRedisKeysTotal.set({ key_pattern: 'game:*' }, 150);
    sbobuzRedisKeysTotal.set({ key_pattern: 'session:*' }, 300);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_redis_keys_total{key_pattern="game:*"} 150');
    expect(metricsText).toContain('sbobuz_redis_keys_total{key_pattern="session:*"} 300');
  });

  it('tracks PostgreSQL connection usage percentage', async () => {
    sbobuzPostgresConnectionsUsedPercent.set(60);

    const metricsText = await getRegistry().metrics();
    expect(metricsText).toContain('sbobuz_postgres_connections_used_percent 60');
  });
});

// ---------------------------------------------------------------------------
// Metrics HTTP server tests
// ---------------------------------------------------------------------------

describe('metrics HTTP server', () => {
  it('starts and serves /metrics endpoint', async () => {
    await startMetricsServer(testPort);

    // Record a metric to ensure non-empty output
    httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });

    const metricsText = await fetchMetrics(testPort);
    expect(metricsText).toContain('http_requests_total');
  });

  it('returns 404 for non-/metrics paths', async () => {
    await startMetricsServer(testPort);

    const res = await fetch(`http://127.0.0.1:${testPort}/other`);
    expect(res.status).toBe(404);
  });

  it('is idempotent when called multiple times', async () => {
    const server1 = await startMetricsServer(testPort);
    const server2 = await startMetricsServer(testPort);
    expect(server1).toBe(server2);
  });

  it('stops cleanly', async () => {
    await startMetricsServer(testPort);
    await stopMetricsServer();

    // After stopping, the port should be free. Starting again should work.
    await startMetricsServer(testPort);
    const metricsText = await fetchMetrics(testPort);
    expect(metricsText).toBeDefined();
  });

  it('stop is a no-op when not started', async () => {
    // Should not throw
    await stopMetricsServer();
  });
});

// ---------------------------------------------------------------------------
// resetMetrics tests
// ---------------------------------------------------------------------------

describe('resetMetrics', () => {
  it('resets all counter values to zero', async () => {
    httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' }, 10);

    const beforeText = await getRegistry().metrics();
    expect(beforeText).toContain('http_requests_total{method="GET",route="/test",status_code="200"} 10');

    resetMetrics();

    const afterText = await getRegistry().metrics();
    // After reset, the metric line should not contain value 10
    expect(afterText).not.toContain('http_requests_total{method="GET",route="/test",status_code="200"} 10');
  });
});
