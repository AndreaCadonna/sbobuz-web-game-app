/**
 * Unit tests for the OpenTelemetry setup module.
 *
 * Tests verify SDK initialization, the tracedOperation wrapper,
 * and graceful shutdown behavior.
 *
 * Note: Full auto-instrumentation testing requires integration tests
 * with real HTTP/DB/Redis calls. These unit tests cover the setup
 * logic and manual span utility.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Hoisted mocks ---

const {
  mockNodeSDK,
  mockStart,
  mockShutdown,
  mockTracer,
  mockSpan,
} = vi.hoisted(() => {
  const mockSpan = {
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
    setAttribute: vi.fn(),
  };

  const mockTracer = {
    startActiveSpan: vi.fn((_name: string, _options: unknown, fn: (span: typeof mockSpan) => unknown) => {
      return fn(mockSpan);
    }),
  };

  const mockShutdown = vi.fn().mockResolvedValue(undefined);
  const mockStart = vi.fn();

  const mockNodeSDK = vi.fn(() => ({
    start: mockStart,
    shutdown: mockShutdown,
  }));

  return {
    mockNodeSDK,
    mockStart,
    mockShutdown,
    mockTracer,
    mockSpan,
  };
});

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: mockNodeSDK,
}));

vi.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn(() => ({})),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  SEMRESATTRS_SERVICE_NAME: 'service.name',
  SEMRESATTRS_SERVICE_VERSION: 'service.version',
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  ParentBasedSampler: vi.fn(() => ({
    shouldSample: vi.fn(() => ({
      decision: 1, // RECORD_AND_SAMPLED
      attributes: {},
    })),
  })),
  TraceIdRatioBasedSampler: vi.fn(),
  SamplingDecision: {
    NOT_RECORD: 0,
    RECORD: 1,
    RECORD_AND_SAMPLED: 2,
  },
}));

vi.mock('@opentelemetry/instrumentation-http', () => ({
  HttpInstrumentation: vi.fn(),
}));

vi.mock('@opentelemetry/instrumentation-express', () => ({
  ExpressInstrumentation: vi.fn(),
}));

vi.mock('@opentelemetry/instrumentation-pg', () => ({
  PgInstrumentation: vi.fn(),
}));

vi.mock('@opentelemetry/instrumentation-ioredis', () => ({
  IORedisInstrumentation: vi.fn(),
}));

vi.mock('@opentelemetry/instrumentation-socket.io', () => ({
  SocketIoInstrumentation: vi.fn(),
}));

vi.mock('@opentelemetry/api', () => ({
  SpanKind: { INTERNAL: 1 },
  SpanStatusCode: { OK: 1, ERROR: 2 },
  context: { active: vi.fn() },
  trace: {
    getTracer: vi.fn(() => mockTracer),
  },
}));

// --- Imports (after mocks) ---

import { SpanStatusCode } from '@opentelemetry/api';

import { initOtel, shutdownOtel, isOtelInitialized, tracedOperation } from './setup.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initOtel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Reset module state by shutting down
    await shutdownOtel();
  });

  it('creates and starts the NodeSDK', () => {
    initOtel();

    expect(mockNodeSDK).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on repeated calls', () => {
    initOtel();
    initOtel();
    initOtel();

    expect(mockNodeSDK).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('reports initialized state correctly', () => {
    expect(isOtelInitialized()).toBe(false);

    initOtel();

    expect(isOtelInitialized()).toBe(true);
  });
});

describe('shutdownOtel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls sdk.shutdown()', async () => {
    initOtel();
    await shutdownOtel();

    expect(mockShutdown).toHaveBeenCalledTimes(1);
    expect(isOtelInitialized()).toBe(false);
  });

  it('is a no-op when not initialized', async () => {
    await shutdownOtel();
    // Should not throw
    expect(isOtelInitialized()).toBe(false);
  });

  it('allows re-initialization after shutdown', async () => {
    initOtel();
    await shutdownOtel();

    initOtel();
    expect(isOtelInitialized()).toBe(true);
    expect(mockNodeSDK).toHaveBeenCalledTimes(2);
  });
});

describe('tracedOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs a synchronous operation and sets OK status', async () => {
    const result = await tracedOperation(
      { name: 'test.sync_op', module: 'infra' },
      () => 42,
    );

    expect(result).toBe(42);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  it('runs an async operation and sets OK status', async () => {
    const result = await tracedOperation(
      { name: 'test.async_op', module: 'game-engine' },
      async () => 'hello',
    );

    expect(result).toBe('hello');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  it('records exception and sets ERROR status on failure', async () => {
    const testError = new Error('test failure');

    await expect(
      tracedOperation(
        { name: 'test.failing_op', module: 'auth' },
        () => {
          throw testError;
        },
      ),
    ).rejects.toThrow('test failure');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'test failure',
    });
    expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  it('handles non-Error thrown values', async () => {
    await expect(
      tracedOperation(
        { name: 'test.string_throw', module: 'infra' },
        () => {
          throw 'string error'; // eslint-disable-line no-throw-literal
        },
      ),
    ).rejects.toBe('string error');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'string error',
    });
    // Non-Error values should not call recordException
    expect(mockSpan.recordException).not.toHaveBeenCalled();
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  it('passes attributes to the span', async () => {
    await tracedOperation(
      {
        name: 'test.with_attrs',
        module: 'game-engine',
        attributes: {
          'sbobuz.game.id': 'game-123',
          'sbobuz.game.player_count': 2,
        },
      },
      () => 'ok',
    );

    // Verify startActiveSpan was called with the right options
    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
      'test.with_attrs',
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sbobuz.module': 'game-engine',
          'sbobuz.game.id': 'game-123',
          'sbobuz.game.player_count': 2,
        }),
      }),
      expect.any(Function),
    );
  });

  it('always calls span.end(), even on error', async () => {
    try {
      await tracedOperation(
        { name: 'test.ensure_end', module: 'infra' },
        () => {
          throw new Error('boom');
        },
      );
    } catch {
      // Expected
    }

    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });
});
