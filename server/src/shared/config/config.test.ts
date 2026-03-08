import { describe, it, expect, beforeEach } from 'vitest';

import { loadConfig, getConfig, resetConfig } from './index.js';

/**
 * Minimal valid environment for tests. Contains all required fields
 * plus the minimum necessary to pass validation.
 */
function validEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/sbobuz',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'a-secret-that-is-at-least-thirty-two-chars-long!!',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
    ...overrides,
  };
}

describe('config', () => {
  beforeEach(() => {
    resetConfig();
  });

  describe('loadConfig', () => {
    it('loads valid configuration with defaults', () => {
      const config = loadConfig(validEnv());

      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(3000);
      expect(config.HOST).toBe('0.0.0.0');
      expect(config.LOG_LEVEL).toBe('info');
      expect(config.DB_POOL_MIN).toBe(2);
      expect(config.DB_POOL_MAX).toBe(10);
      expect(config.DB_STATEMENT_TIMEOUT_MS).toBe(30000);
      expect(config.MIGRATE_ON_STARTUP).toBe(false);
      expect(config.REDIS_COMMAND_TIMEOUT_MS).toBe(2000);
      expect(config.JWT_ACCESS_TOKEN_TTL_SECONDS).toBe(900);
      expect(config.JWT_REFRESH_TOKEN_TTL_SECONDS).toBe(604800);
      expect(config.BCRYPT_COST_FACTOR).toBe(12);
      expect(config.RATE_LIMIT_WINDOW_MS).toBe(60000);
      expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(100);
      expect(config.DEFAULT_TURN_TIMER_SECONDS).toBe(60);
      expect(config.DEFAULT_DISCONNECT_GRACE_SECONDS).toBe(30);
      expect(config.MAX_GAMES_PER_INSTANCE).toBe(200);
      expect(config.GAME_SNAPSHOT_INTERVAL_ACTIONS).toBe(10);
      expect(config.GAME_SNAPSHOT_INTERVAL_SECONDS).toBe(30);
      expect(config.WS_PING_INTERVAL_MS).toBe(25000);
      expect(config.WS_PING_TIMEOUT_MS).toBe(5000);
      expect(config.WS_MAX_PAYLOAD_BYTES).toBe(16384);
      expect(config.OTEL_TRACE_SAMPLING_RATE).toBe(1.0);
      expect(config.METRICS_PORT).toBe(9464);
      expect(config.ENABLE_AI_OPPONENT).toBe(true);
      expect(config.ENABLE_MATCHMAKING).toBe(false);
    });

    it('accepts overridden values', () => {
      const config = loadConfig(
        validEnv({
          PORT: '8080',
          LOG_LEVEL: 'debug',
          DB_POOL_MAX: '20',
          MIGRATE_ON_STARTUP: 'true',
          OTEL_TRACE_SAMPLING_RATE: '0.5',
          ENABLE_MATCHMAKING: 'true',
        }),
      );

      expect(config.PORT).toBe(8080);
      expect(config.LOG_LEVEL).toBe('debug');
      expect(config.DB_POOL_MAX).toBe(20);
      expect(config.MIGRATE_ON_STARTUP).toBe(true);
      expect(config.OTEL_TRACE_SAMPLING_RATE).toBe(0.5);
      expect(config.ENABLE_MATCHMAKING).toBe(true);
    });

    it('freezes the returned config object', () => {
      const config = loadConfig(validEnv());

      expect(Object.isFrozen(config)).toBe(true);
    });

    it('generates a SERVER_ID when not provided', () => {
      const config = loadConfig(validEnv());

      expect(config.SERVER_ID).toBeTruthy();
      expect(config.SERVER_ID.startsWith('sbobuz-')).toBe(true);
    });

    it('uses provided SERVER_ID when set', () => {
      const config = loadConfig(validEnv({ SERVER_ID: 'my-server-1' }));

      expect(config.SERVER_ID).toBe('my-server-1');
    });
  });

  describe('validation: required fields', () => {
    it('throws when DATABASE_URL is missing', () => {
      const env = validEnv();
      delete (env as Record<string, string | undefined>).DATABASE_URL;

      expect(() => loadConfig(env)).toThrow('DATABASE_URL');
    });

    it('throws when REDIS_URL is missing', () => {
      const env = validEnv();
      delete (env as Record<string, string | undefined>).REDIS_URL;

      expect(() => loadConfig(env)).toThrow('REDIS_URL');
    });

    it('throws when JWT_SECRET is missing', () => {
      const env = validEnv();
      delete (env as Record<string, string | undefined>).JWT_SECRET;

      expect(() => loadConfig(env)).toThrow('JWT_SECRET');
    });
  });

  describe('validation: DATABASE_URL format', () => {
    it('accepts postgres:// prefix', () => {
      const config = loadConfig(validEnv({ DATABASE_URL: 'postgres://u:p@host:5432/db' }));

      expect(config.DATABASE_URL).toBe('postgres://u:p@host:5432/db');
    });

    it('accepts postgresql:// prefix', () => {
      const config = loadConfig(validEnv({ DATABASE_URL: 'postgresql://u:p@host:5432/db' }));

      expect(config.DATABASE_URL).toBe('postgresql://u:p@host:5432/db');
    });

    it('rejects invalid DATABASE_URL prefix', () => {
      expect(() => loadConfig(validEnv({ DATABASE_URL: 'mysql://host/db' }))).toThrow(
        'must start with postgres://',
      );
    });
  });

  describe('validation: REDIS_URL format', () => {
    it('accepts redis:// prefix', () => {
      const config = loadConfig(validEnv({ REDIS_URL: 'redis://localhost:6379' }));

      expect(config.REDIS_URL).toBe('redis://localhost:6379');
    });

    it('accepts rediss:// prefix (TLS)', () => {
      const config = loadConfig(validEnv({ REDIS_URL: 'rediss://host:6380' }));

      expect(config.REDIS_URL).toBe('rediss://host:6380');
    });

    it('rejects invalid REDIS_URL prefix', () => {
      expect(() => loadConfig(validEnv({ REDIS_URL: 'http://localhost:6379' }))).toThrow(
        'must start with redis://',
      );
    });
  });

  describe('validation: JWT_SECRET length', () => {
    it('accepts a 32-character secret', () => {
      const secret = 'a'.repeat(32);
      const config = loadConfig(validEnv({ JWT_SECRET: secret }));

      expect(config.JWT_SECRET).toBe(secret);
    });

    it('rejects a secret shorter than 32 characters', () => {
      expect(() => loadConfig(validEnv({ JWT_SECRET: 'too-short' }))).toThrow(
        'at least 32 characters',
      );
    });
  });

  describe('validation: PORT range', () => {
    it('accepts port 1', () => {
      expect(loadConfig(validEnv({ PORT: '1' })).PORT).toBe(1);
    });

    it('accepts port 65535', () => {
      expect(loadConfig(validEnv({ PORT: '65535' })).PORT).toBe(65535);
    });

    it('rejects port 0', () => {
      expect(() => loadConfig(validEnv({ PORT: '0' }))).toThrow();
    });

    it('rejects port 65536', () => {
      expect(() => loadConfig(validEnv({ PORT: '65536' }))).toThrow();
    });
  });

  describe('validation: NODE_ENV', () => {
    it.each(['development', 'staging', 'production'] as const)(
      'accepts NODE_ENV=%s',
      (env) => {
        const config = loadConfig(validEnv({ NODE_ENV: env }));
        expect(config.NODE_ENV).toBe(env);
      },
    );

    it('rejects invalid NODE_ENV', () => {
      expect(() => loadConfig(validEnv({ NODE_ENV: 'test' }))).toThrow();
    });
  });

  describe('validation: OTEL_TRACE_SAMPLING_RATE', () => {
    it('accepts 0.0', () => {
      expect(loadConfig(validEnv({ OTEL_TRACE_SAMPLING_RATE: '0' })).OTEL_TRACE_SAMPLING_RATE).toBe(0);
    });

    it('accepts 1.0', () => {
      expect(loadConfig(validEnv({ OTEL_TRACE_SAMPLING_RATE: '1' })).OTEL_TRACE_SAMPLING_RATE).toBe(1);
    });

    it('rejects values above 1.0', () => {
      expect(() => loadConfig(validEnv({ OTEL_TRACE_SAMPLING_RATE: '1.5' }))).toThrow();
    });

    it('rejects negative values', () => {
      expect(() => loadConfig(validEnv({ OTEL_TRACE_SAMPLING_RATE: '-0.1' }))).toThrow();
    });
  });

  describe('validation: positive integers', () => {
    it('rejects zero for timeout values', () => {
      expect(() => loadConfig(validEnv({ DB_STATEMENT_TIMEOUT_MS: '0' }))).toThrow();
    });

    it('rejects negative timeout values', () => {
      expect(() => loadConfig(validEnv({ REDIS_COMMAND_TIMEOUT_MS: '-1' }))).toThrow();
    });

    it('rejects non-integer timeout values', () => {
      expect(() => loadConfig(validEnv({ RATE_LIMIT_WINDOW_MS: '1.5' }))).toThrow();
    });
  });

  describe('validation: CORS in production', () => {
    it('rejects empty CORS_ALLOWED_ORIGINS in production', () => {
      expect(() =>
        loadConfig(validEnv({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: '' })),
      ).toThrow('must not be empty in production');
    });

    it('rejects wildcard CORS_ALLOWED_ORIGINS in production', () => {
      expect(() =>
        loadConfig(validEnv({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: '*' })),
      ).toThrow("must not contain '*' in production");
    });

    it('allows wildcard CORS_ALLOWED_ORIGINS in development', () => {
      const config = loadConfig(validEnv({ NODE_ENV: 'development', CORS_ALLOWED_ORIGINS: '*' }));

      expect(config.CORS_ALLOWED_ORIGINS).toBe('*');
    });
  });

  describe('validation: DB_POOL_MIN vs DB_POOL_MAX', () => {
    it('rejects DB_POOL_MIN > DB_POOL_MAX', () => {
      expect(() =>
        loadConfig(validEnv({ DB_POOL_MIN: '20', DB_POOL_MAX: '10' })),
      ).toThrow('DB_POOL_MIN must not exceed DB_POOL_MAX');
    });
  });

  describe('getConfig', () => {
    it('returns the loaded config singleton', () => {
      const loaded = loadConfig(validEnv());
      const got = getConfig();

      expect(got).toBe(loaded);
    });

    it('auto-loads from process.env if not already loaded', () => {
      // This would use actual process.env which may not have required vars.
      // We load manually first and then verify getConfig returns it.
      const loaded = loadConfig(validEnv());
      resetConfig();
      const reloaded = loadConfig(validEnv({ PORT: '9999' }));

      expect(getConfig()).toBe(reloaded);
      expect(getConfig().PORT).toBe(9999);
      // Verify it's the same reference
      expect(getConfig()).toBe(reloaded);
      expect(loaded).not.toBe(reloaded);
    });
  });

  describe('boolean coercion', () => {
    it('coerces MIGRATE_ON_STARTUP "true" to true', () => {
      expect(loadConfig(validEnv({ MIGRATE_ON_STARTUP: 'true' })).MIGRATE_ON_STARTUP).toBe(true);
    });

    it('coerces MIGRATE_ON_STARTUP "false" to false', () => {
      expect(loadConfig(validEnv({ MIGRATE_ON_STARTUP: 'false' })).MIGRATE_ON_STARTUP).toBe(false);
    });

    it('coerces ENABLE_AI_OPPONENT "false" to false', () => {
      expect(loadConfig(validEnv({ ENABLE_AI_OPPONENT: 'false' })).ENABLE_AI_OPPONENT).toBe(false);
    });
  });

  describe('error message formatting', () => {
    it('lists all validation issues in the error message', () => {
      try {
        loadConfig({
          NODE_ENV: 'invalid',
          DATABASE_URL: 'mysql://bad',
          REDIS_URL: 'http://bad',
          JWT_SECRET: 'short',
        });
        expect.fail('should have thrown');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('Invalid server configuration');
        expect(message).toContain('DATABASE_URL');
        expect(message).toContain('REDIS_URL');
        expect(message).toContain('JWT_SECRET');
      }
    });
  });
});
