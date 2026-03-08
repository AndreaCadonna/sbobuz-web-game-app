import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { getContext, runWithContext } from './context.js';
import {
  createRootLogger,
  createModuleLogger,
  initLogger,
  getLogger,
  resetLogger,
} from './logger.js';

/**
 * Creates a Pino logger that writes JSON to an array for inspection.
 * Mirrors the mixin and redaction logic from createRootLogger.
 */
function createTestLogger(level = 'debug'): {
  logger: ReturnType<typeof pino>;
  entries: Record<string, unknown>[];
} {
  const entries: Record<string, unknown>[] = [];

  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      entries.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });

  const logger = pino(
    {
      level,
      name: 'sbobuz-server',
      redact: {
        paths: [
          'password',
          'token',
          'accessToken',
          'refreshToken',
          'authorization',
          'cookie',
          'jwt',
          'secret',
          'req.headers.authorization',
          'req.headers.cookie',
        ],
        remove: false,
      },
      mixin: () => {
        const ctx = getContext();
        const bindings: Record<string, unknown> = {
          service: 'sbobuz-server',
        };
        if (ctx.traceId) bindings['traceId'] = ctx.traceId;
        if (ctx.spanId) bindings['spanId'] = ctx.spanId;
        if (ctx.userId) bindings['userId'] = ctx.userId;
        if (ctx.roomId) bindings['roomId'] = ctx.roomId;
        if (ctx.gameId) bindings['gameId'] = ctx.gameId;
        if (ctx.requestId) bindings['requestId'] = ctx.requestId;
        if (ctx.socketId) bindings['socketId'] = ctx.socketId;
        return bindings;
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    stream,
  );

  return { logger, entries };
}

describe('logger', () => {
  beforeEach(() => {
    resetLogger();
  });

  afterEach(() => {
    resetLogger();
  });

  describe('createRootLogger', () => {
    it('creates a logger with the given level', () => {
      const logger = createRootLogger('warn');
      expect(logger.level).toBe('warn');
    });

    it('defaults to info level', () => {
      const logger = createRootLogger();
      expect(logger.level).toBe('info');
    });
  });

  describe('initLogger / getLogger', () => {
    it('initLogger creates and caches the logger', () => {
      const logger = initLogger('debug');
      const retrieved = getLogger();
      expect(retrieved).toBe(logger);
    });

    it('getLogger auto-initializes if not initialized', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');
    });

    it('getLogger returns the same instance on repeated calls', () => {
      const first = getLogger();
      const second = getLogger();
      expect(first).toBe(second);
    });
  });

  describe('createModuleLogger', () => {
    it('creates a child logger with module field', () => {
      initLogger('debug');
      const child = createModuleLogger('auth');
      expect(child).toBeDefined();
    });

    it('respects per-module log level from env', () => {
      initLogger('info');
      process.env['LOG_LEVEL_AUTH'] = 'debug';
      try {
        const child = createModuleLogger('auth');
        expect(child.level).toBe('debug');
      } finally {
        delete process.env['LOG_LEVEL_AUTH'];
      }
    });

    it('handles hyphenated module names for env lookup', () => {
      initLogger('info');
      process.env['LOG_LEVEL_GAME_ENGINE'] = 'warn';
      try {
        const child = createModuleLogger('game-engine');
        expect(child.level).toBe('warn');
      } finally {
        delete process.env['LOG_LEVEL_GAME_ENGINE'];
      }
    });

    it('does not override level for invalid env values', () => {
      initLogger('info');
      process.env['LOG_LEVEL_LOBBY'] = 'invalid';
      try {
        const child = createModuleLogger('lobby');
        expect(child.level).toBe('info');
      } finally {
        delete process.env['LOG_LEVEL_LOBBY'];
      }
    });
  });

  describe('context injection via mixin', () => {
    it('includes service name in every log entry', () => {
      const { logger, entries } = createTestLogger();
      logger.info('test message');

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('service', 'sbobuz-server');
    });

    it('includes context fields when running within a context', () => {
      const { logger, entries } = createTestLogger();

      runWithContext(
        {
          traceId: 'abc123',
          spanId: 'def456',
          userId: 'user-1',
          requestId: 'req-1',
        },
        () => {
          logger.info('inside context');
        },
      );

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('traceId', 'abc123');
      expect(entries[0]).toHaveProperty('spanId', 'def456');
      expect(entries[0]).toHaveProperty('userId', 'user-1');
      expect(entries[0]).toHaveProperty('requestId', 'req-1');
    });

    it('omits undefined context fields', () => {
      const { logger, entries } = createTestLogger();

      runWithContext({ traceId: 'trace-only' }, () => {
        logger.info('partial context');
      });

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('traceId', 'trace-only');
      expect(entries[0]).not.toHaveProperty('userId');
      expect(entries[0]).not.toHaveProperty('roomId');
      expect(entries[0]).not.toHaveProperty('gameId');
    });

    it('does not include context fields outside of a context', () => {
      const { logger, entries } = createTestLogger();
      logger.info('no context');

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('service', 'sbobuz-server');
      expect(entries[0]).not.toHaveProperty('traceId');
      expect(entries[0]).not.toHaveProperty('userId');
    });

    it('includes all context fields when all are set', () => {
      const { logger, entries } = createTestLogger();

      runWithContext(
        {
          traceId: 't1',
          spanId: 's1',
          userId: 'u1',
          roomId: 'r1',
          gameId: 'g1',
          requestId: 'req1',
          socketId: 'sock1',
        },
        () => {
          logger.info('full context');
        },
      );

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('traceId', 't1');
      expect(entries[0]).toHaveProperty('spanId', 's1');
      expect(entries[0]).toHaveProperty('userId', 'u1');
      expect(entries[0]).toHaveProperty('roomId', 'r1');
      expect(entries[0]).toHaveProperty('gameId', 'g1');
      expect(entries[0]).toHaveProperty('requestId', 'req1');
      expect(entries[0]).toHaveProperty('socketId', 'sock1');
    });
  });

  describe('redaction', () => {
    it('redacts password fields', () => {
      const { logger, entries } = createTestLogger();
      logger.info({ password: 'my-secret-password' }, 'login attempt');

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('password', '[Redacted]');
    });

    it('redacts token fields', () => {
      const { logger, entries } = createTestLogger();
      logger.info({ token: 'jwt-token-value' }, 'token issued');

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('token', '[Redacted]');
    });

    it('redacts accessToken fields', () => {
      const { logger, entries } = createTestLogger();
      logger.info({ accessToken: 'eyJhbGc...' }, 'access token');

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('accessToken', '[Redacted]');
    });

    it('redacts secret fields', () => {
      const { logger, entries } = createTestLogger();
      logger.info({ secret: 'super-secret' }, 'secret value');

      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('secret', '[Redacted]');
    });
  });

  describe('timestamp format', () => {
    it('includes ISO 8601 timestamp', () => {
      const { logger, entries } = createTestLogger();
      logger.info('timestamp test');

      expect(entries.length).toBe(1);
      const timestamp = entries[0]?.['time'];
      expect(typeof timestamp).toBe('string');
      // Verify it parses as a valid date
      expect(Number.isNaN(new Date(timestamp as string).getTime())).toBe(false);
    });
  });

  describe('log levels', () => {
    it('filters messages below the configured level', () => {
      const { logger, entries } = createTestLogger('warn');

      logger.debug('should not appear');
      logger.info('should not appear');
      logger.warn('should appear');
      logger.error('should appear');

      expect(entries.length).toBe(2);
    });
  });
});
