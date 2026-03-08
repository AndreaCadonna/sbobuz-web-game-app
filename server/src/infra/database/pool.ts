/**
 * PostgreSQL connection pool wrapper.
 *
 * Manages a pg Pool singleton with health checking, event logging,
 * and graceful shutdown. All database access in the application goes
 * through this pool.
 *
 * @see docs/specs/data-layer.md Section 5.1
 */

import pg from 'pg';

import type { ServerConfig } from '../../shared/config/index.js';
import { createModuleLogger } from '../../shared/logger.js';

const { Pool } = pg;

const logger = createModuleLogger('infra');

/**
 * Health check result for the database pool.
 */
export interface PoolHealthResult {
  readonly status: 'healthy' | 'unhealthy';
  readonly latencyMs: number;
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
  readonly error?: string | undefined;
}

/**
 * The singleton pool instance.
 */
let pool: pg.Pool | undefined;

/**
 * Create and configure a PostgreSQL connection pool.
 *
 * Attaches event listeners for logging pool lifecycle events.
 * The pool connects lazily on first query unless a health check
 * is run immediately after creation.
 *
 * @param config - Server configuration with database settings.
 * @returns The configured pg Pool instance.
 * @throws Error if a pool already exists (call closePool first).
 */
export function createPool(config: ServerConfig): pg.Pool {
  if (pool) {
    throw new Error('PostgreSQL pool already exists. Call closePool() before creating a new one.');
  }

  const newPool = new Pool({
    connectionString: config.DATABASE_URL,
    min: config.DB_POOL_MIN,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    application_name: 'sbobuz-server',
  });

  // --- Pool event logging ---

  newPool.on('connect', () => {
    logger.debug('PostgreSQL pool: new client connected');
  });

  newPool.on('acquire', () => {
    logger.debug('PostgreSQL pool: client acquired');
  });

  newPool.on('remove', () => {
    logger.debug('PostgreSQL pool: client removed');
  });

  newPool.on('error', (err: Error) => {
    logger.error({ err }, 'PostgreSQL pool: unexpected error on idle client');
  });

  pool = newPool;
  logger.info(
    { min: config.DB_POOL_MIN, max: config.DB_POOL_MAX },
    'PostgreSQL connection pool created',
  );

  return newPool;
}

/**
 * Get the current pool singleton.
 *
 * @returns The pg Pool instance.
 * @throws Error if no pool has been created.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('PostgreSQL pool not initialized. Call createPool() first.');
  }
  return pool;
}

/**
 * Close the pool and release all connections.
 *
 * Waits for active queries to complete up to a maximum of 3 seconds,
 * then forcefully ends the pool.
 */
export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = undefined;

  logger.info('Draining PostgreSQL connection pool...');

  try {
    await Promise.race([
      currentPool.end(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Pool drain timed out after 3000ms')), 3_000),
      ),
    ]);
    logger.info('PostgreSQL connection pool closed');
  } catch (err) {
    logger.warn({ err }, 'PostgreSQL pool drain did not complete cleanly');
  }
}

/**
 * Run a health check against the database.
 *
 * Executes `SELECT 1` and measures latency. Returns pool statistics
 * alongside the health status.
 *
 * @returns Health check result with latency and pool stats.
 */
export async function checkPoolHealth(): Promise<PoolHealthResult> {
  if (!pool) {
    return {
      status: 'unhealthy',
      latencyMs: -1,
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      error: 'Pool not initialized',
    };
  }

  const start = performance.now();

  try {
    await pool.query('SELECT 1');
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      status: 'healthy',
      latencyMs,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    logger.error({ err }, 'PostgreSQL health check failed');

    return {
      status: 'unhealthy',
      latencyMs,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
      error: errorMessage,
    };
  }
}

/**
 * Reset the pool singleton (for testing only).
 */
export function resetPool(): void {
  pool = undefined;
}
