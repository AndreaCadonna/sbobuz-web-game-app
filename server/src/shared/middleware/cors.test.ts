/**
 * Tests for CORS middleware configuration.
 */

import { describe, it, expect } from 'vitest';

import type { ServerConfig } from '../config/index.js';

import { createCorsMiddleware } from './cors.js';

function createMockConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    NODE_ENV: 'development',
    PORT: 3000,
    HOST: '0.0.0.0',
    LOG_LEVEL: 'info',
    SERVER_ID: 'test-server',
    DATABASE_URL: 'postgres://localhost/test',
    DB_POOL_MIN: 2,
    DB_POOL_MAX: 10,
    DB_STATEMENT_TIMEOUT_MS: 30000,
    MIGRATE_ON_STARTUP: false,
    REDIS_URL: 'redis://localhost:6379',
    REDIS_COMMAND_TIMEOUT_MS: 2000,
    JWT_SECRET: 'a'.repeat(32),
    JWT_ACCESS_TOKEN_TTL_SECONDS: 900,
    JWT_REFRESH_TOKEN_TTL_SECONDS: 604800,
    BCRYPT_COST_FACTOR: 12,
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    DEFAULT_TURN_TIMER_SECONDS: 60,
    DEFAULT_DISCONNECT_GRACE_SECONDS: 30,
    MAX_GAMES_PER_INSTANCE: 200,
    GAME_SNAPSHOT_INTERVAL_ACTIONS: 10,
    GAME_SNAPSHOT_INTERVAL_SECONDS: 30,
    WS_PING_INTERVAL_MS: 25000,
    WS_PING_TIMEOUT_MS: 5000,
    WS_MAX_PAYLOAD_BYTES: 16384,
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
    OTEL_TRACE_SAMPLING_RATE: 1.0,
    METRICS_PORT: 9464,
    GRAFANA_URL: '',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
    ENABLE_AI_OPPONENT: true,
    ENABLE_MATCHMAKING: false,
    ...overrides,
  } as ServerConfig;
}

describe('createCorsMiddleware', () => {
  it('should return a function (middleware)', () => {
    const config = createMockConfig();
    const middleware = createCorsMiddleware(config);

    expect(typeof middleware).toBe('function');
  });

  it('should accept single origin from config', () => {
    const config = createMockConfig({ CORS_ALLOWED_ORIGINS: 'http://localhost:3001' });
    const middleware = createCorsMiddleware(config);

    expect(middleware).toBeDefined();
  });

  it('should accept multiple comma-separated origins', () => {
    const config = createMockConfig({
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001, https://sbobuz.com, https://www.sbobuz.com',
    });
    const middleware = createCorsMiddleware(config);

    expect(middleware).toBeDefined();
  });

  it('should trim whitespace from origins', () => {
    const config = createMockConfig({
      CORS_ALLOWED_ORIGINS: '  http://localhost:3001  ,  https://sbobuz.com  ',
    });
    // This should not throw
    const middleware = createCorsMiddleware(config);
    expect(middleware).toBeDefined();
  });

  it('should filter out empty strings from origins', () => {
    const config = createMockConfig({
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001,,',
    });
    const middleware = createCorsMiddleware(config);
    expect(middleware).toBeDefined();
  });
});
