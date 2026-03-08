/**
 * Unit tests for the Redis client wrapper.
 *
 * All tests mock ioredis to avoid requiring a real Redis server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import type { ServerConfig } from '../../shared/config/index.js';

// --- Hoisted mocks ---

const { MockRedis, mockLogger, getMockInstances, clearMockInstances } = vi.hoisted(() => {
  // We need a factory that creates EventEmitter instances with mock methods.
  const instances: Array<EventEmitter & {
    ping: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];

  const MockRedis = vi.fn(function () {
    const instance = Object.assign(new EventEmitter(), {
      ping: vi.fn().mockResolvedValue('PONG'),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
    });
    instances.push(instance);
    return instance;
  });

  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };

  return {
    MockRedis,
    mockLogger,
    getMockInstances: () => instances,
    clearMockInstances: () => { instances.length = 0; },
  };
});

vi.mock('ioredis', () => ({
  default: MockRedis,
}));

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: vi.fn(() => mockLogger),
}));

import {
  checkRedisHealth,
  closeRedisClients,
  createRedisClients,
  getRedisClient,
  getRedisSubscriber,
  resetRedisClients,
} from './client.js';

/** Minimal config for Redis client creation. */
function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    REDIS_URL: 'redis://localhost:6379',
    REDIS_COMMAND_TIMEOUT_MS: 2000,
    ...overrides,
  } as ServerConfig;
}

describe('createRedisClients', () => {
  beforeEach(() => {
    resetRedisClients();
    clearMockInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRedisClients();
  });

  it('creates primary and subscriber clients', () => {
    const result = createRedisClients(makeConfig());

    expect(result.primary).toBeDefined();
    expect(result.subscriber).toBeDefined();
    expect(getMockInstances()).toHaveLength(2);
  });

  it('passes REDIS_URL to both clients', () => {
    createRedisClients(makeConfig({ REDIS_URL: 'redis://myhost:6380' }));

    expect(MockRedis).toHaveBeenCalledWith(
      'redis://myhost:6380',
      expect.objectContaining({
        maxRetriesPerRequest: 3,
        connectTimeout: 5_000,
        enableReadyCheck: true,
        lazyConnect: false,
      }),
    );
    expect(MockRedis).toHaveBeenCalledTimes(2);
  });

  it('passes command timeout from config', () => {
    createRedisClients(makeConfig({ REDIS_COMMAND_TIMEOUT_MS: 5000 }));

    expect(MockRedis).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ commandTimeout: 5000 }),
    );
  });

  it('logs creation message', () => {
    createRedisClients(makeConfig());

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Redis clients created (primary + subscriber)',
    );
  });

  it('throws if clients already exist', () => {
    createRedisClients(makeConfig());

    expect(() => createRedisClients(makeConfig())).toThrow(
      'Redis clients already exist. Call closeRedisClients() before creating new ones.',
    );
  });

  it('attaches event listeners to both clients', () => {
    createRedisClients(makeConfig());

    for (const instance of getMockInstances()) {
      const events = instance.eventNames();
      expect(events).toContain('connect');
      expect(events).toContain('ready');
      expect(events).toContain('close');
      expect(events).toContain('reconnecting');
      expect(events).toContain('error');
      expect(events).toContain('end');
    }
  });
});

describe('getRedisClient', () => {
  beforeEach(() => {
    resetRedisClients();
    clearMockInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRedisClients();
  });

  it('returns the primary client after creation', () => {
    const { primary } = createRedisClients(makeConfig());
    expect(getRedisClient()).toBe(primary);
  });

  it('throws if clients not created', () => {
    expect(() => getRedisClient()).toThrow(
      'Redis client not initialized. Call createRedisClients() first.',
    );
  });
});

describe('getRedisSubscriber', () => {
  beforeEach(() => {
    resetRedisClients();
    clearMockInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRedisClients();
  });

  it('returns the subscriber client after creation', () => {
    const { subscriber } = createRedisClients(makeConfig());
    expect(getRedisSubscriber()).toBe(subscriber);
  });

  it('throws if clients not created', () => {
    expect(() => getRedisSubscriber()).toThrow(
      'Redis subscriber not initialized. Call createRedisClients() first.',
    );
  });
});

describe('closeRedisClients', () => {
  beforeEach(() => {
    resetRedisClients();
    clearMockInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRedisClients();
  });

  it('calls quit on both clients', async () => {
    createRedisClients(makeConfig());
    const instances = getMockInstances();
    const [primary, subscriber] = instances;

    await closeRedisClients();

    expect(primary?.quit).toHaveBeenCalled();
    expect(subscriber?.quit).toHaveBeenCalled();
  });

  it('clears singletons so getters throw', async () => {
    createRedisClients(makeConfig());
    await closeRedisClients();

    expect(() => getRedisClient()).toThrow();
    expect(() => getRedisSubscriber()).toThrow();
  });

  it('is a no-op if no clients exist', async () => {
    await closeRedisClients(); // should not throw
  });

  it('calls disconnect if quit fails', async () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    primary!.quit.mockRejectedValueOnce(new Error('quit failed'));

    await closeRedisClients();

    expect(primary?.disconnect).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'primary' }),
      'Redis client close failed, disconnecting',
    );
  });

  it('allows creating new clients after closing', async () => {
    createRedisClients(makeConfig());
    await closeRedisClients();

    clearMockInstances();
    // Should not throw
    const result = createRedisClients(makeConfig());
    expect(result.primary).toBeDefined();
  });
});

describe('checkRedisHealth', () => {
  beforeEach(() => {
    resetRedisClients();
    clearMockInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRedisClients();
  });

  it('returns unhealthy when client not initialized', async () => {
    const result = await checkRedisHealth();

    expect(result).toEqual({
      status: 'unhealthy',
      latencyMs: -1,
      error: 'Redis client not initialized',
    });
  });

  it('returns healthy when PING succeeds', async () => {
    createRedisClients(makeConfig());

    const result = await checkRedisHealth();

    expect(result.status).toBe('healthy');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('returns unhealthy when PING returns unexpected reply', async () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    primary!.ping.mockResolvedValueOnce('NOT_PONG');

    const result = await checkRedisHealth();

    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Unexpected PING reply: NOT_PONG');
  });

  it('returns unhealthy when PING throws', async () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    primary!.ping.mockRejectedValueOnce(new Error('Connection lost'));

    const result = await checkRedisHealth();

    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Connection lost');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('logs error when health check fails', async () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    const err = new Error('timeout');
    primary!.ping.mockRejectedValueOnce(err);

    await checkRedisHealth();

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err },
      'Redis health check failed',
    );
  });

  it('handles non-Error thrown values', async () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    primary!.ping.mockRejectedValueOnce('string error');

    const result = await checkRedisHealth();

    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Unknown error');
  });
});

describe('event handlers', () => {
  beforeEach(() => {
    resetRedisClients();
    clearMockInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRedisClients();
  });

  it('logs on connect event', () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    primary?.emit('connect');

    expect(mockLogger.info).toHaveBeenCalledWith(
      { role: 'primary' },
      'Redis client connected',
    );
  });

  it('logs on ready event', () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    primary?.emit('ready');

    expect(mockLogger.info).toHaveBeenCalledWith(
      { role: 'primary' },
      'Redis client ready',
    );
  });

  it('logs on close event', () => {
    createRedisClients(makeConfig());
    const instances = getMockInstances();
    const subscriber = instances[1];
    subscriber?.emit('close');

    expect(mockLogger.info).toHaveBeenCalledWith(
      { role: 'subscriber' },
      'Redis client connection closed',
    );
  });

  it('logs warning on reconnecting event', () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    primary?.emit('reconnecting');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { role: 'primary' },
      'Redis client reconnecting',
    );
  });

  it('logs error on error event', () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();
    const err = new Error('connection refused');
    primary?.emit('error', err);

    expect(mockLogger.error).toHaveBeenCalledWith(
      { role: 'primary', err },
      'Redis client error',
    );
  });

  it('logs on end event', () => {
    createRedisClients(makeConfig());
    const instances = getMockInstances();
    const subscriber = instances[1];
    subscriber?.emit('end');

    expect(mockLogger.info).toHaveBeenCalledWith(
      { role: 'subscriber' },
      'Redis client disconnected (end)',
    );
  });
});

describe('retry strategy', () => {
  beforeEach(() => {
    resetRedisClients();
    clearMockInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRedisClients();
  });

  it('uses exponential backoff for retries', () => {
    createRedisClients(makeConfig());

    // Extract the retryStrategy from the options passed to MockRedis
    const options = MockRedis.mock.calls[0]?.[1] as {
      retryStrategy: (times: number) => number | null;
    };
    const retryStrategy = options.retryStrategy;

    expect(retryStrategy(1)).toBe(100);   // 100 * 2^0
    expect(retryStrategy(2)).toBe(200);   // 100 * 2^1
    expect(retryStrategy(3)).toBe(400);   // 100 * 2^2
    expect(retryStrategy(4)).toBe(800);   // 100 * 2^3
  });

  it('caps retry delay at 10 seconds', () => {
    createRedisClients(makeConfig());

    const options = MockRedis.mock.calls[0]?.[1] as {
      retryStrategy: (times: number) => number | null;
    };
    const retryStrategy = options.retryStrategy;

    // 100 * 2^9 = 51200, should be capped at 10000
    expect(retryStrategy(10)).toBe(10_000);
  });

  it('returns null after 10 retries', () => {
    createRedisClients(makeConfig());

    const options = MockRedis.mock.calls[0]?.[1] as {
      retryStrategy: (times: number) => number | null;
    };
    const retryStrategy = options.retryStrategy;

    expect(retryStrategy(11)).toBeNull();
  });
});

describe('resetRedisClients', () => {
  beforeEach(() => {
    clearMockInstances();
    vi.clearAllMocks();
  });

  it('clears singletons without calling quit', () => {
    createRedisClients(makeConfig());
    const [primary] = getMockInstances();

    resetRedisClients();

    expect(primary?.quit).not.toHaveBeenCalled();
    expect(() => getRedisClient()).toThrow();
  });
});
