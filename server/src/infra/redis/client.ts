/**
 * Redis client wrapper with primary and subscriber connections.
 *
 * The primary connection handles read/write commands. The subscriber
 * connection is dedicated to pub/sub (SUBSCRIBE blocks the connection).
 * Both connections use the same configuration.
 *
 * @see docs/specs/data-layer.md Section 5.2
 */

import Redis, { type RedisOptions } from 'ioredis';

import type { ServerConfig } from '../../shared/config/index.js';
import { createModuleLogger } from '../../shared/logger.js';

const logger = createModuleLogger('infra');

/**
 * Health check result for Redis.
 */
export interface RedisHealthResult {
  readonly status: 'healthy' | 'unhealthy';
  readonly latencyMs: number;
  readonly error?: string | undefined;
}

/**
 * Singleton Redis clients.
 */
let primaryClient: Redis | undefined;
let subscriberClient: Redis | undefined;

/**
 * Build ioredis options from server config.
 */
function buildRedisOptions(config: ServerConfig, role: 'primary' | 'subscriber'): RedisOptions {
  return {
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    commandTimeout: config.REDIS_COMMAND_TIMEOUT_MS,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        logger.error({ role, times }, 'Redis retry limit exceeded, giving up');
        return null; // stop retrying
      }
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, ...
      const delay = Math.min(100 * Math.pow(2, times - 1), 10_000);
      logger.warn({ role, times, delay }, 'Redis reconnecting');
      return delay;
    },
  };
}

/**
 * Attach lifecycle event listeners to a Redis client for logging.
 */
function attachEventListeners(client: Redis, role: 'primary' | 'subscriber'): void {
  client.on('connect', () => {
    logger.info({ role }, 'Redis client connected');
  });

  client.on('ready', () => {
    logger.info({ role }, 'Redis client ready');
  });

  client.on('close', () => {
    logger.info({ role }, 'Redis client connection closed');
  });

  client.on('reconnecting', () => {
    logger.warn({ role }, 'Redis client reconnecting');
  });

  client.on('error', (err: Error) => {
    logger.error({ role, err }, 'Redis client error');
  });

  client.on('end', () => {
    logger.info({ role }, 'Redis client disconnected (end)');
  });
}

/**
 * Create the primary and subscriber Redis clients.
 *
 * Both clients connect to the same Redis server. The subscriber client
 * is kept separate because SUBSCRIBE puts the connection into subscriber
 * mode, blocking regular commands.
 *
 * @param config - Server configuration with REDIS_URL and REDIS_COMMAND_TIMEOUT_MS.
 * @returns An object with both clients.
 * @throws Error if clients already exist (call closeRedisClients first).
 */
export function createRedisClients(config: ServerConfig): {
  primary: Redis;
  subscriber: Redis;
} {
  if (primaryClient || subscriberClient) {
    throw new Error(
      'Redis clients already exist. Call closeRedisClients() before creating new ones.',
    );
  }

  const primaryOpts = buildRedisOptions(config, 'primary');
  const subscriberOpts = buildRedisOptions(config, 'subscriber');

  primaryClient = new Redis(config.REDIS_URL, primaryOpts);
  subscriberClient = new Redis(config.REDIS_URL, subscriberOpts);

  attachEventListeners(primaryClient, 'primary');
  attachEventListeners(subscriberClient, 'subscriber');

  logger.info('Redis clients created (primary + subscriber)');

  return { primary: primaryClient, subscriber: subscriberClient };
}

/**
 * Get the primary Redis client (for commands).
 *
 * @returns The ioredis client.
 * @throws Error if clients have not been created.
 */
export function getRedisClient(): Redis {
  if (!primaryClient) {
    throw new Error('Redis client not initialized. Call createRedisClients() first.');
  }
  return primaryClient;
}

/**
 * Get the subscriber Redis client (for pub/sub).
 *
 * @returns The ioredis subscriber client.
 * @throws Error if clients have not been created.
 */
export function getRedisSubscriber(): Redis {
  if (!subscriberClient) {
    throw new Error('Redis subscriber not initialized. Call createRedisClients() first.');
  }
  return subscriberClient;
}

/**
 * Close both Redis connections gracefully.
 */
export async function closeRedisClients(): Promise<void> {
  const clients: Array<{ client: Redis | undefined; role: string }> = [
    { client: primaryClient, role: 'primary' },
    { client: subscriberClient, role: 'subscriber' },
  ];

  const closePromises: Promise<void>[] = [];

  for (const { client, role } of clients) {
    if (client) {
      closePromises.push(
        client
          .quit()
          .then(() => {
            logger.info({ role }, 'Redis client closed gracefully');
          })
          .catch((err: unknown) => {
            logger.warn({ role, err }, 'Redis client close failed, disconnecting');
            client.disconnect();
          }),
      );
    }
  }

  primaryClient = undefined;
  subscriberClient = undefined;

  if (closePromises.length > 0) {
    await Promise.all(closePromises);
  }

  logger.info('All Redis clients closed');
}

/**
 * Run a health check against Redis.
 *
 * Sends a PING to the primary client and measures latency.
 *
 * @returns Health check result with latency measurement.
 */
export async function checkRedisHealth(): Promise<RedisHealthResult> {
  if (!primaryClient) {
    return {
      status: 'unhealthy',
      latencyMs: -1,
      error: 'Redis client not initialized',
    };
  }

  const start = performance.now();

  try {
    const reply = await primaryClient.ping();
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    if (reply !== 'PONG') {
      return {
        status: 'unhealthy',
        latencyMs,
        error: `Unexpected PING reply: ${reply}`,
      };
    }

    return {
      status: 'healthy',
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    logger.error({ err }, 'Redis health check failed');

    return {
      status: 'unhealthy',
      latencyMs,
      error: errorMessage,
    };
  }
}

/**
 * Reset the client singletons (for testing only).
 */
export function resetRedisClients(): void {
  primaryClient = undefined;
  subscriberClient = undefined;
}
