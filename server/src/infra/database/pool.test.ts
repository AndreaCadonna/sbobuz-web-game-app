/**
 * Unit tests for the PostgreSQL connection pool wrapper.
 *
 * All tests mock the `pg` module to avoid requiring a real database.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerConfig } from '../../shared/config/index.js';

// --- Hoisted mocks (vi.mock is hoisted, so references must use vi.hoisted) ---

const { mockPoolInstance, MockPool, mockLogger } = vi.hoisted(() => {
  const mockPoolInstance = {
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  };

  const MockPool = vi.fn(() => mockPoolInstance);

  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };

  return { mockPoolInstance, MockPool, mockLogger };
});

vi.mock('pg', () => ({
  default: { Pool: MockPool },
}));

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: vi.fn(() => mockLogger),
}));

import { checkPoolHealth, closePool, createPool, getPool, resetPool } from './pool.js';

/** Minimal config for pool creation. */
function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/sbobuz',
    DB_POOL_MIN: 2,
    DB_POOL_MAX: 10,
    DB_STATEMENT_TIMEOUT_MS: 30000,
    ...overrides,
  } as ServerConfig;
}

describe('createPool', () => {
  beforeEach(() => {
    resetPool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPool();
  });

  it('creates a pool with correct configuration', () => {
    const config = makeConfig();
    const result = createPool(config);

    expect(MockPool).toHaveBeenCalledWith({
      connectionString: 'postgresql://user:pass@localhost:5432/sbobuz',
      min: 2,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30000,
      application_name: 'sbobuz-server',
    });
    expect(result).toBe(mockPoolInstance);
  });

  it('registers event listeners on the pool', () => {
    createPool(makeConfig());

    const eventNames = mockPoolInstance.on.mock.calls.map(
      (call: [string, unknown]) => call[0],
    );
    expect(eventNames).toContain('connect');
    expect(eventNames).toContain('acquire');
    expect(eventNames).toContain('remove');
    expect(eventNames).toContain('error');
  });

  it('logs pool creation with min/max', () => {
    createPool(makeConfig({ DB_POOL_MIN: 3, DB_POOL_MAX: 15 }));

    expect(mockLogger.info).toHaveBeenCalledWith(
      { min: 3, max: 15 },
      'PostgreSQL connection pool created',
    );
  });

  it('throws if pool already exists', () => {
    createPool(makeConfig());

    expect(() => createPool(makeConfig())).toThrow(
      'PostgreSQL pool already exists. Call closePool() before creating a new one.',
    );
  });

  it('uses custom pool sizing from config', () => {
    createPool(makeConfig({ DB_POOL_MIN: 5, DB_POOL_MAX: 20 }));

    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({ min: 5, max: 20 }),
    );
  });

  it('uses custom statement timeout from config', () => {
    createPool(makeConfig({ DB_STATEMENT_TIMEOUT_MS: 60000 }));

    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({ statement_timeout: 60000 }),
    );
  });
});

describe('getPool', () => {
  beforeEach(() => {
    resetPool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPool();
  });

  it('returns the pool after creation', () => {
    createPool(makeConfig());
    const result = getPool();
    expect(result).toBe(mockPoolInstance);
  });

  it('throws if no pool has been created', () => {
    expect(() => getPool()).toThrow(
      'PostgreSQL pool not initialized. Call createPool() first.',
    );
  });
});

describe('closePool', () => {
  beforeEach(() => {
    resetPool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPool();
  });

  it('drains the pool and logs success', async () => {
    mockPoolInstance.end.mockResolvedValueOnce(undefined);
    createPool(makeConfig());

    await closePool();

    expect(mockPoolInstance.end).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('PostgreSQL connection pool closed');
  });

  it('clears the singleton so getPool throws', async () => {
    mockPoolInstance.end.mockResolvedValueOnce(undefined);
    createPool(makeConfig());

    await closePool();

    expect(() => getPool()).toThrow('PostgreSQL pool not initialized');
  });

  it('is a no-op if no pool exists', async () => {
    await closePool(); // should not throw
    expect(mockPoolInstance.end).not.toHaveBeenCalled();
  });

  it('warns if pool drain times out', async () => {
    // Simulate a pool.end() that never resolves
    mockPoolInstance.end.mockReturnValueOnce(new Promise(() => {}));
    createPool(makeConfig());

    await closePool();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'PostgreSQL pool drain did not complete cleanly',
    );
  });

  it('allows creating a new pool after closing', async () => {
    mockPoolInstance.end.mockResolvedValueOnce(undefined);
    createPool(makeConfig());
    await closePool();

    // Should not throw
    const result = createPool(makeConfig());
    expect(result).toBe(mockPoolInstance);
  });
});

describe('checkPoolHealth', () => {
  beforeEach(() => {
    resetPool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPool();
  });

  it('returns unhealthy when pool is not initialized', async () => {
    const result = await checkPoolHealth();

    expect(result).toEqual({
      status: 'unhealthy',
      latencyMs: -1,
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      error: 'Pool not initialized',
    });
  });

  it('returns healthy with latency when SELECT 1 succeeds', async () => {
    mockPoolInstance.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    createPool(makeConfig());

    const result = await checkPoolHealth();

    expect(result.status).toBe('healthy');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.totalCount).toBe(5);
    expect(result.idleCount).toBe(3);
    expect(result.waitingCount).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('returns unhealthy with error message when query fails', async () => {
    mockPoolInstance.query.mockRejectedValueOnce(new Error('Connection refused'));
    createPool(makeConfig());

    const result = await checkPoolHealth();

    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Connection refused');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('logs the error when health check fails', async () => {
    const err = new Error('timeout');
    mockPoolInstance.query.mockRejectedValueOnce(err);
    createPool(makeConfig());

    await checkPoolHealth();

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err },
      'PostgreSQL health check failed',
    );
  });

  it('handles non-Error thrown values', async () => {
    mockPoolInstance.query.mockRejectedValueOnce('string error');
    createPool(makeConfig());

    const result = await checkPoolHealth();

    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Unknown error');
  });
});

describe('pool event handlers', () => {
  beforeEach(() => {
    resetPool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPool();
  });

  it('logs debug on connect event', () => {
    createPool(makeConfig());

    const connectHandler = mockPoolInstance.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'connect',
    )?.[1] as (() => void) | undefined;
    connectHandler?.();

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'PostgreSQL pool: new client connected',
    );
  });

  it('logs debug on acquire event', () => {
    createPool(makeConfig());

    const acquireHandler = mockPoolInstance.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'acquire',
    )?.[1] as (() => void) | undefined;
    acquireHandler?.();

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'PostgreSQL pool: client acquired',
    );
  });

  it('logs debug on remove event', () => {
    createPool(makeConfig());

    const removeHandler = mockPoolInstance.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'remove',
    )?.[1] as (() => void) | undefined;
    removeHandler?.();

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'PostgreSQL pool: client removed',
    );
  });

  it('logs error on pool error event', () => {
    createPool(makeConfig());

    const errorHandler = mockPoolInstance.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'error',
    )?.[1] as ((err: Error) => void) | undefined;
    const err = new Error('idle client error');
    errorHandler?.(err);

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err },
      'PostgreSQL pool: unexpected error on idle client',
    );
  });
});

describe('resetPool', () => {
  it('clears the singleton without calling end', () => {
    createPool(makeConfig());
    resetPool();
    expect(mockPoolInstance.end).not.toHaveBeenCalled();
    expect(() => getPool()).toThrow();
  });
});
