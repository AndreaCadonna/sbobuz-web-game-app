/**
 * Pino-based structured logger with automatic context injection.
 *
 * Every log entry includes service name, module, and any active request
 * context (traceId, spanId, userId, etc.) from AsyncLocalStorage.
 *
 * Modules use `createModuleLogger(moduleName)` to get a child logger
 * with the `module` field pre-set. The context fields are injected
 * automatically via a Pino mixin.
 *
 * @see docs/specs/observability-stack.md Section 2.1 (LogEntry)
 * @see docs/specs/observability-stack.md Section 4.5 (Context Injection)
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

import { getContext } from './context.js';

/**
 * Module names that can appear in log entries.
 * Matches the ModuleName type from the observability spec.
 */
export type ModuleName = 'auth' | 'lobby' | 'game-engine' | 'realtime' | 'ai' | 'infra' | 'gateway';

/**
 * Log levels configurable per environment.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** The service name stamped on every log entry. */
const SERVICE_NAME = 'sbobuz-server';

/**
 * Fields redacted from log output to prevent leaking secrets.
 * Pino replaces the value of these paths with "[Redacted]".
 */
const REDACT_PATHS = [
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
];

/**
 * Create the root Pino logger instance.
 *
 * @param level - The minimum log level. Defaults to 'info'.
 * @param pretty - Enable pino-pretty for local development. Defaults to false.
 * @returns A configured Pino logger.
 */
export function createRootLogger(level: LogLevel = 'info', pretty = false): Logger {
  const options: LoggerOptions = {
    level,
    name: SERVICE_NAME,
    redact: {
      paths: REDACT_PATHS,
      remove: false,
    },
    // Mixin injects AsyncLocalStorage context into every log entry.
    mixin: () => {
      const ctx = getContext();
      const bindings: Record<string, unknown> = {
        service: SERVICE_NAME,
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
    // Timestamp in ISO 8601 with millisecond precision.
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  return pino(options);
}

/**
 * The singleton root logger, created lazily.
 * Call `initLogger()` at startup to configure it, or it will auto-initialize
 * with defaults on first use.
 */
let rootLogger: Logger | undefined;

/**
 * Initialize the root logger with the given settings.
 * Should be called once at startup after config is loaded.
 *
 * @param level - The minimum log level.
 * @param pretty - Whether to use pino-pretty transport.
 * @returns The initialized root logger.
 */
export function initLogger(level: LogLevel = 'info', pretty = false): Logger {
  rootLogger = createRootLogger(level, pretty);
  return rootLogger;
}

/**
 * Get the root logger singleton.
 * Auto-initializes with defaults if `initLogger()` was not called.
 */
export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = createRootLogger();
  }
  return rootLogger;
}

/**
 * Reset the root logger (for testing only).
 */
export function resetLogger(): void {
  rootLogger = undefined;
}

/**
 * Create a child logger for a specific module.
 *
 * The child logger has the `module` field pre-bound, so all log entries
 * from this logger automatically include the module name.
 *
 * Optionally, a per-module log level can be configured via environment
 * variable: `LOG_LEVEL_{MODULE}` (e.g., `LOG_LEVEL_AUTH=debug`).
 *
 * @param moduleName - The module name to bind to the child logger.
 * @returns A Pino child logger with module context.
 */
export function createModuleLogger(moduleName: ModuleName): Logger {
  const parent = getLogger();

  // Check for per-module log level override: LOG_LEVEL_AUTH, LOG_LEVEL_LOBBY, etc.
  const envKey = `LOG_LEVEL_${moduleName.replace(/-/g, '_').toUpperCase()}`;
  const moduleLevel = process.env[envKey];

  const child = parent.child({ module: moduleName });

  if (moduleLevel && isValidLevel(moduleLevel)) {
    child.level = moduleLevel;
  }

  return child;
}

/**
 * Type guard for valid Pino log levels.
 */
function isValidLevel(level: string): level is LogLevel {
  return ['debug', 'info', 'warn', 'error'].includes(level);
}
