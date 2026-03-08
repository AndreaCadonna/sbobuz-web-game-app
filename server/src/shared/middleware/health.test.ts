/**
 * Tests for health check endpoints.
 *
 * @see docs/specs/observability-stack.md Section 2.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks must be set up before importing the module under test ---

const { mockCheckPoolHealth, mockCheckRedisHealth, mockGetConfig } = vi.hoisted(() => ({
  mockCheckPoolHealth: vi.fn(),
  mockCheckRedisHealth: vi.fn(),
  mockGetConfig: vi.fn(),
}));

vi.mock('../../infra/database/index.js', () => ({
  checkPoolHealth: mockCheckPoolHealth,
}));

vi.mock('../../infra/redis/index.js', () => ({
  checkRedisHealth: mockCheckRedisHealth,
}));

vi.mock('../config/index.js', () => ({
  getConfig: mockGetConfig,
}));

vi.mock('../logger.js', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createHealthRouter } from './health.js';

// --- Test helpers ---

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
  headersSent: boolean;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code: number): MockResponse {
      res.statusCode = code;
      return res;
    },
    json(data: unknown): MockResponse {
      res.body = data;
      res.headersSent = true;
      return res;
    },
  };
  return res;
}

function createMockRequest(path: string): { method: string; url: string; path: string } {
  return { method: 'GET', url: path, path };
}

/** Shape of an Express router layer for test introspection. */
interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: unknown, res: unknown, next: unknown) => void }>;
  };
}

/**
 * Helper to invoke a route handler from the router.
 * Matches GET handlers by path.
 */
async function invokeRoute(
  path: string,
): Promise<MockResponse> {
  const router = createHealthRouter();
  const res = createMockResponse();
  const req = createMockRequest(path);

  // Extract the handler from the router's layer stack
  const routerStack = (router as unknown as { stack: RouterLayer[] }).stack;
  const layer = routerStack.find(
    (l) => l.route?.path === path && l.route?.methods['get'],
  );

  if (!layer?.route) {
    throw new Error(`No GET route found for ${path}`);
  }

  const firstHandler = layer.route.stack[0];
  if (!firstHandler) {
    throw new Error(`No handler found for ${path}`);
  }

  const handler = firstHandler.handle;

  // The handler may be sync or async (wrapped by asyncHandler)
  const result = handler(req as never, res as never, vi.fn() as never);
  if (result instanceof Promise) {
    await result;
  }

  // Give setImmediate-based operations time to resolve
  await new Promise((resolve) => setTimeout(resolve, 50));

  return res;
}

// --- Tests ---

describe('Health Check Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({
      MAX_GAMES_PER_INSTANCE: 200,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /live', () => {
    it('returns 200 with status ok', async () => {
      const res = await invokeRoute('/live');

      expect(res.statusCode).toBe(200);
      const body = res.body as { status: string; uptime: number; timestamp: string };
      expect(body.status).toBe('ok');
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof body.timestamp).toBe('string');
    });

    it('includes ISO 8601 timestamp', async () => {
      const res = await invokeRoute('/live');

      const body = res.body as { timestamp: string };
      // Validate ISO 8601 format
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('does not call any dependency checks', async () => {
      await invokeRoute('/live');

      expect(mockCheckPoolHealth).not.toHaveBeenCalled();
      expect(mockCheckRedisHealth).not.toHaveBeenCalled();
    });
  });

  describe('GET /ready', () => {
    it('returns 200 when both postgres and redis are healthy', async () => {
      mockCheckPoolHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 2.5,
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      });
      mockCheckRedisHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 1.2,
      });

      const res = await invokeRoute('/ready');

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        status: string;
        checks: { postgres: { status: string; latencyMs: number }; redis: { status: string; latencyMs: number } };
      };
      expect(body.status).toBe('ready');
      expect(body.checks.postgres.status).toBe('up');
      expect(body.checks.postgres.latencyMs).toBe(2.5);
      expect(body.checks.redis.status).toBe('up');
      expect(body.checks.redis.latencyMs).toBe(1.2);
    });

    it('returns 503 when postgres is unhealthy', async () => {
      mockCheckPoolHealth.mockResolvedValue({
        status: 'unhealthy',
        latencyMs: -1,
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
        error: 'Pool not initialized',
      });
      mockCheckRedisHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 1.0,
      });

      const res = await invokeRoute('/ready');

      expect(res.statusCode).toBe(503);
      const body = res.body as {
        status: string;
        checks: { postgres: { status: string; error: string }; redis: { status: string } };
      };
      expect(body.status).toBe('not_ready');
      expect(body.checks.postgres.status).toBe('down');
      expect(body.checks.postgres.error).toBe('Pool not initialized');
      expect(body.checks.redis.status).toBe('up');
    });

    it('returns 503 when redis is unhealthy', async () => {
      mockCheckPoolHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 3.0,
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      });
      mockCheckRedisHealth.mockResolvedValue({
        status: 'unhealthy',
        latencyMs: -1,
        error: 'Redis client not initialized',
      });

      const res = await invokeRoute('/ready');

      expect(res.statusCode).toBe(503);
      const body = res.body as { status: string; checks: { postgres: { status: string }; redis: { status: string; error: string } } };
      expect(body.status).toBe('not_ready');
      expect(body.checks.postgres.status).toBe('up');
      expect(body.checks.redis.status).toBe('down');
      expect(body.checks.redis.error).toBe('Redis client not initialized');
    });

    it('returns 503 when both are unhealthy', async () => {
      mockCheckPoolHealth.mockResolvedValue({
        status: 'unhealthy',
        latencyMs: -1,
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
        error: 'Connection refused',
      });
      mockCheckRedisHealth.mockResolvedValue({
        status: 'unhealthy',
        latencyMs: -1,
        error: 'Connection timeout',
      });

      const res = await invokeRoute('/ready');

      expect(res.statusCode).toBe(503);
      const body = res.body as { status: string };
      expect(body.status).toBe('not_ready');
    });

    it('marks postgres as down when latency exceeds 5000ms', async () => {
      mockCheckPoolHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 5001,
        totalCount: 5,
        idleCount: 1,
        waitingCount: 0,
      });
      mockCheckRedisHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 1.0,
      });

      const res = await invokeRoute('/ready');

      expect(res.statusCode).toBe(503);
      const body = res.body as { checks: { postgres: { status: string } } };
      expect(body.checks.postgres.status).toBe('down');
    });

    it('marks redis as down when latency exceeds 5000ms', async () => {
      mockCheckPoolHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 2.0,
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      });
      mockCheckRedisHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 5500,
      });

      const res = await invokeRoute('/ready');

      expect(res.statusCode).toBe(503);
      const body = res.body as { checks: { redis: { status: string } } };
      expect(body.checks.redis.status).toBe('down');
    });

    it('includes timestamp in response', async () => {
      mockCheckPoolHealth.mockResolvedValue({ status: 'healthy', latencyMs: 1 });
      mockCheckRedisHealth.mockResolvedValue({ status: 'healthy', latencyMs: 1 });

      const res = await invokeRoute('/ready');

      const body = res.body as { timestamp: string };
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('does not include error field when checks are healthy', async () => {
      mockCheckPoolHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 1.5,
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      });
      mockCheckRedisHealth.mockResolvedValue({
        status: 'healthy',
        latencyMs: 0.8,
      });

      const res = await invokeRoute('/ready');

      const body = res.body as { checks: { postgres: Record<string, unknown>; redis: Record<string, unknown> } };
      expect(body.checks.postgres).not.toHaveProperty('error');
      expect(body.checks.redis).not.toHaveProperty('error');
    });
  });

  describe('GET /capacity', () => {
    it('returns 200 with accepting status when not at capacity', async () => {
      const res = await invokeRoute('/capacity');

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        status: string;
        activeGames: number;
        activeConnections: number;
        maxGamesPerInstance: number;
        cpuUsagePercent: number;
        memoryUsagePercent: number;
        eventLoopLagMs: number;
        timestamp: string;
      };
      expect(body.status).toBe('accepting');
      expect(body.activeGames).toBe(0);
      expect(body.activeConnections).toBe(0);
      expect(body.maxGamesPerInstance).toBe(200);
      expect(typeof body.cpuUsagePercent).toBe('number');
      expect(typeof body.memoryUsagePercent).toBe('number');
      expect(typeof body.eventLoopLagMs).toBe('number');
      expect(typeof body.timestamp).toBe('string');
    });

    it('returns 503 when at capacity', async () => {
      mockGetConfig.mockReturnValue({
        MAX_GAMES_PER_INSTANCE: 0, // 0 means immediately at capacity with 0 active games
      });

      const res = await invokeRoute('/capacity');

      expect(res.statusCode).toBe(503);
      const body = res.body as { status: string };
      expect(body.status).toBe('at_capacity');
    });

    it('includes numeric CPU usage percent', async () => {
      const res = await invokeRoute('/capacity');

      const body = res.body as { cpuUsagePercent: number };
      expect(body.cpuUsagePercent).toBeGreaterThanOrEqual(0);
      expect(body.cpuUsagePercent).toBeLessThanOrEqual(100);
    });

    it('includes numeric memory usage percent', async () => {
      const res = await invokeRoute('/capacity');

      const body = res.body as { memoryUsagePercent: number };
      expect(body.memoryUsagePercent).toBeGreaterThanOrEqual(0);
      expect(body.memoryUsagePercent).toBeLessThanOrEqual(100);
    });

    it('includes event loop lag in milliseconds', async () => {
      const res = await invokeRoute('/capacity');

      const body = res.body as { eventLoopLagMs: number };
      expect(body.eventLoopLagMs).toBeGreaterThanOrEqual(0);
    });

    it('includes ISO 8601 timestamp', async () => {
      const res = await invokeRoute('/capacity');

      const body = res.body as { timestamp: string };
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });
  });

  describe('Router structure', () => {
    it('creates a router with three routes', () => {
      const router = createHealthRouter();
      const routerStack = (router as unknown as { stack: RouterLayer[] }).stack;
      const paths = routerStack.map((l) => l.route?.path).filter(Boolean);

      expect(paths).toContain('/live');
      expect(paths).toContain('/ready');
      expect(paths).toContain('/capacity');
      expect(paths).toHaveLength(3);
    });
  });
});
