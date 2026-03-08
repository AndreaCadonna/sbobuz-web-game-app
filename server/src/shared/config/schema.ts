/**
 * Zod validation schema for all server environment variables.
 *
 * Every environment variable is validated at startup. If validation fails,
 * the process exits immediately with a descriptive error.
 *
 * @see docs/specs/infrastructure-deployment.md Section 2.1-2.2
 */

import { z } from 'zod';

/**
 * Allowed log levels matching Pino conventions.
 */
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

/**
 * Allowed Node.js runtime environments.
 */
const nodeEnvSchema = z.enum(['development', 'staging', 'production']);

/**
 * Positive integer helper for timeout values and other numeric config.
 */
const positiveInt = z.coerce.number().int().positive();

/**
 * Port number range (1-65535).
 */
const portSchema = z.coerce.number().int().min(1).max(65535);

/**
 * The full Zod schema for ServerConfig.
 *
 * Default values are provided where specified in the spec. Required values
 * (DATABASE_URL, REDIS_URL, JWT_SECRET) have no defaults and must be supplied.
 *
 * The `.superRefine` at the end enforces cross-field rules:
 * - CORS_ALLOWED_ORIGINS must not be empty or contain '*' in production.
 */
export const serverConfigSchema = z
  .object({
    // --- Server ---
    NODE_ENV: nodeEnvSchema.default('development'),
    PORT: portSchema.default(3000),
    HOST: z.string().min(1).default('0.0.0.0'),
    LOG_LEVEL: logLevelSchema.default('info'),
    SERVER_ID: z
      .string()
      .default('')
      .transform((val) => (val === '' ? `sbobuz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : val)),

    // --- Database ---
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .refine((url) => url.startsWith('postgres://') || url.startsWith('postgresql://'), {
        message: 'DATABASE_URL must start with postgres:// or postgresql://',
      }),
    DB_POOL_MIN: positiveInt.default(2),
    DB_POOL_MAX: positiveInt.default(10),
    DB_STATEMENT_TIMEOUT_MS: positiveInt.default(30000),
    MIGRATE_ON_STARTUP: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),

    // --- Redis ---
    REDIS_URL: z
      .string()
      .min(1, 'REDIS_URL is required')
      .refine((url) => url.startsWith('redis://') || url.startsWith('rediss://'), {
        message: 'REDIS_URL must start with redis:// or rediss://',
      }),
    REDIS_COMMAND_TIMEOUT_MS: positiveInt.default(2000),

    // --- Auth ---
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_ACCESS_TOKEN_TTL_SECONDS: positiveInt.default(900),
    JWT_REFRESH_TOKEN_TTL_SECONDS: positiveInt.default(604800),
    BCRYPT_COST_FACTOR: positiveInt.default(12),

    // --- Rate Limiting ---
    RATE_LIMIT_WINDOW_MS: positiveInt.default(60000),
    RATE_LIMIT_MAX_REQUESTS: positiveInt.default(100),

    // --- Game ---
    DEFAULT_TURN_TIMER_SECONDS: positiveInt.default(60),
    DEFAULT_DISCONNECT_GRACE_SECONDS: positiveInt.default(30),
    MAX_GAMES_PER_INSTANCE: positiveInt.default(200),
    GAME_SNAPSHOT_INTERVAL_ACTIONS: positiveInt.default(10),
    GAME_SNAPSHOT_INTERVAL_SECONDS: positiveInt.default(30),

    // --- WebSocket ---
    WS_PING_INTERVAL_MS: positiveInt.default(25000),
    WS_PING_TIMEOUT_MS: positiveInt.default(5000),
    WS_MAX_PAYLOAD_BYTES: positiveInt.default(16384),

    // --- Observability ---
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4317'),
    OTEL_TRACE_SAMPLING_RATE: z.coerce.number().min(0).max(1).default(1.0),
    METRICS_PORT: portSchema.default(9464),
    GRAFANA_URL: z.string().default(''),

    // --- CORS ---
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3001'),

    // --- Feature Flags ---
    ENABLE_AI_OPPONENT: z
      .enum(['true', 'false'])
      .default('true')
      .transform((val) => val === 'true'),
    ENABLE_MATCHMAKING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const origins = data.CORS_ALLOWED_ORIGINS;
      if (!origins || origins.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CORS_ALLOWED_ORIGINS must not be empty in production',
          path: ['CORS_ALLOWED_ORIGINS'],
        });
      }
      if (origins.includes('*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CORS_ALLOWED_ORIGINS must not contain '*' in production",
          path: ['CORS_ALLOWED_ORIGINS'],
        });
      }
    }

    if (data.DB_POOL_MIN > data.DB_POOL_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DB_POOL_MIN must not exceed DB_POOL_MAX',
        path: ['DB_POOL_MIN'],
      });
    }
  });

/**
 * Inferred type from the validated Zod schema.
 * All modules use this type for config access -- never raw process.env.
 */
export type ServerConfig = z.infer<typeof serverConfigSchema>;
