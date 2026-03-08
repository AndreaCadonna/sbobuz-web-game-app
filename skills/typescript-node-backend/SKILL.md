---
name: typescript-node-backend
description: Node.js and Express.js backend engineering patterns for TypeScript projects. Covers middleware pipelines, modular monolith structure, error handling, config validation, graceful shutdown, and server-side project organization. Use this skill whenever writing backend TypeScript code, creating Express routes or middleware, structuring a Node.js service, implementing server-side business logic, or when the user asks about backend architecture patterns, error handling strategies, or service lifecycle management. Also activate when setting up a new backend module, defining middleware chains, or implementing health endpoints.
origin: ECC
---

# TypeScript Node.js Backend Engineering

Production patterns for building Node.js backends with Express.js and TypeScript. These conventions prioritize type safety, predictable error handling, and clean module boundaries.

## When to Activate

- Writing Express.js routes, middleware, or handlers
- Structuring a Node.js/TypeScript backend project
- Implementing error handling or response envelopes
- Setting up environment config validation
- Building health check endpoints
- Implementing graceful shutdown
- Creating a modular monolith or defining module boundaries
- Writing server-side business logic in TypeScript

## Project Structure

Organize backend code as a modular monolith with clear boundaries between domains.

```
src/
├── config/
│   ├── env.ts              # Zod-validated environment schema
│   └── index.ts             # Parsed, typed config singleton
├── modules/
│   ├── auth/
│   │   ├── auth.routes.ts
│   │   ├── auth.service.ts
│   │   ├── auth.types.ts
│   │   └── auth.validation.ts
│   ├── lobby/
│   │   ├── lobby.routes.ts
│   │   ├── lobby.service.ts
│   │   └── ...
│   └── game-engine/
│       └── ...
├── shared/
│   ├── errors.ts            # Typed error classes
│   ├── middleware/           # Global middleware
│   ├── types.ts              # Cross-module types
│   └── logger.ts             # Pino logger setup
├── server.ts                 # Express app assembly
└── main.ts                   # Entry point, lifecycle management
```

### Module Boundaries

Each module owns its routes, service logic, types, and validation schemas. Modules communicate through well-defined interfaces, never by importing each other's internals.

```typescript
// GOOD — module exposes a service interface
// modules/auth/auth.service.ts
export interface AuthService {
  register(input: RegisterInput): Promise<User>;
  login(input: LoginInput): Promise<TokenPair>;
  validateToken(token: string): Promise<TokenPayload>;
}

// AVOID — reaching into another module's internals
import { userRepository } from '../auth/auth.repository';
```

A module's `routes.ts` registers Express routes. A module's `service.ts` contains business logic. A module's `types.ts` defines the data shapes that module owns. Types shared across modules live in `shared/types.ts`.

## Environment Configuration

Validate all environment variables at startup using Zod. Fail fast with a descriptive error if config is invalid — never let a misconfigured server start serving requests.

```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
```

```typescript
// config/index.ts
import { parseEnv, type Env } from './env';

let config: Env | null = null;

export function getConfig(): Env {
  if (!config) {
    config = parseEnv();
  }
  return config;
}
```

## Middleware Pipeline

Order matters. Each middleware has a specific job and a specific position in the chain. Think of the pipeline as a series of gates — a request must pass through each one before reaching the handler.

```typescript
// server.ts
import express from 'express';

export function createApp() {
  const app = express();

  // 1. Request ID — every request gets a correlation ID
  app.use(requestIdMiddleware);

  // 2. CORS — validate origin before processing
  app.use(corsMiddleware);

  // 3. Body parsing — JSON with size limit
  app.use(express.json({ limit: '16kb' }));

  // 4. Rate limiting — reject abusive traffic early
  app.use(rateLimitMiddleware);

  // 5. Auth — validate JWT (skipped for public routes)
  app.use(authMiddleware);

  // 6. Routes — module routers
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/rooms', lobbyRoutes);
  // ...

  // 7. 404 handler — after all routes
  app.use(notFoundHandler);

  // 8. Global error handler — must be last, must have 4 params
  app.use(globalErrorHandler);

  return app;
}
```

### Writing Middleware

Every middleware either calls `next()` to pass control, or sends a response. Never do both.

```typescript
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
```

## Error Handling

Use typed error classes with machine-readable codes. The global error handler catches everything and formats consistent responses. Business logic throws typed errors; it never constructs HTTP responses directly.

### Error Classes

```typescript
// shared/errors.ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} '${id}' not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super('RATE_LIMITED', `Rate limit exceeded. Try again in ${retryAfterSeconds}s`, 429);
  }
}
```

### Global Error Handler

```typescript
// shared/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../logger';

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.warn({ err, requestId: req.requestId }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Unexpected errors — log full stack, return generic message
  logger.error({ err, requestId: req.requestId }, 'unhandled_error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
```

Never leak stack traces, SQL errors, or internal details in production responses. The error handler is the firewall between your internals and the client.

## Response Envelope

Wrap all responses in a consistent envelope so clients can parse uniformly.

```typescript
// shared/types.ts
export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
    pagination?: PaginationMeta;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
    timestamp: string;
  };
}
```

### Response Helpers

```typescript
// shared/response.ts
import { Response, Request } from 'express';

export function sendSuccess<T>(
  res: Response,
  req: Request,
  data: T,
  statusCode = 200,
): void {
  res.status(statusCode).json({
    success: true,
    data,
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

export function sendCreated<T>(
  res: Response,
  req: Request,
  data: T,
  location: string,
): void {
  res.setHeader('Location', location);
  sendSuccess(res, req, data, 201);
}
```

## Input Validation

Validate at the boundary, trust internally. Every route handler validates its input with a Zod schema before calling service logic. This keeps validation in one place and keeps services free of HTTP concerns.

```typescript
// shared/middleware/validate.ts
import { ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      throw new ValidationError('Request validation failed', details);
    }
    req.validatedBody = result.data;
    next();
  };
}
```

```typescript
// modules/auth/auth.validation.ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
```

```typescript
// modules/auth/auth.routes.ts
import { Router } from 'express';
import { validate } from '../../shared/middleware/validate';
import { registerSchema, loginSchema } from './auth.validation';
import { authService } from './auth.service';
import { sendCreated, sendSuccess } from '../../shared/response';

const router = Router();

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const user = await authService.register(req.validatedBody);
    sendCreated(res, req, user, `/api/v1/users/${user.id}`);
  } catch (err) {
    next(err);
  }
});

export default router;
```

## Logging

Use Pino for structured JSON logging. Never use `console.log` — enforce this with ESLint (`no-console` rule). Structured logs enable correlation across distributed systems and make log aggregation (Loki, ELK) effective.

```typescript
// shared/logger.ts
import pino from 'pino';
import { getConfig } from '../config';

export const logger = pino({
  level: getConfig().LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'sbobuz-server',
    pid: process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createModuleLogger(module: string) {
  return logger.child({ module });
}
```

```typescript
// Usage in a module
const log = createModuleLogger('auth');

log.info({ userId: user.id }, 'user_registered');
log.warn({ userId, attempts }, 'login_failed');
log.error({ err, requestId }, 'token_validation_error');
```

### Logging Rules

- Use snake_case event names as messages: `user_registered`, `game_started`, `token_refreshed`
- Include contextual fields (userId, roomId, gameId, requestId) — not in the message string, in the structured fields
- Never log secrets, passwords, tokens, or full request bodies
- Log at the right level: `debug` for dev-only detail, `info` for business events, `warn` for recoverable problems, `error` for failures needing investigation

## Context Propagation

Use `AsyncLocalStorage` to propagate request context (request ID, user ID, trace ID) through the call stack without threading it through every function signature.

```typescript
// shared/context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext | undefined {
  return requestContext.getStore();
}
```

```typescript
// Middleware that sets up context
export function contextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const ctx: RequestContext = {
    requestId: req.requestId,
    userId: req.user?.id,
    traceId: req.headers['x-trace-id'] as string,
  };
  requestContext.run(ctx, () => next());
}
```

## Health Endpoints

Health endpoints serve infrastructure (load balancers, Kubernetes probes). They must not require auth, must not be rate-limited, and must respond fast.

```typescript
const healthRouter = Router();

// Liveness — "is the process running?"
healthRouter.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness — "can this instance serve traffic?"
healthRouter.get('/health/ready', async (_req, res) => {
  try {
    await Promise.all([
      db.raw('SELECT 1'),       // PostgreSQL reachable
      redis.ping(),             // Redis reachable
    ]);
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});
```

## Graceful Shutdown

When the process receives SIGTERM (Kubernetes pod termination, deploy), shut down cleanly: stop accepting new connections, finish in-flight work, close resource handles, then exit.

```typescript
// main.ts
import { createApp } from './server';
import { getConfig } from './config';
import { logger } from './shared/logger';

const config = getConfig();
const app = createApp();

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info({ port: config.PORT }, 'server_started');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutdown_initiated');

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('http_server_closed');
  });

  // 2. Close resource handles
  try {
    await Promise.allSettled([
      db.destroy(),
      redis.quit(),
    ]);
    logger.info('resources_closed');
  } catch (err) {
    logger.error({ err }, 'shutdown_error');
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Safety net: force exit after 15 seconds
process.on('SIGTERM', () => {
  setTimeout(() => {
    logger.error('forced_shutdown');
    process.exit(1);
  }, 15_000).unref();
});
```

## Async Route Handlers

Express does not catch errors in async handlers by default. Wrap handlers or use an async wrapper to ensure errors reach the global error handler.

```typescript
// shared/middleware/async-handler.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
```

```typescript
// Usage
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.register(req.validatedBody);
    sendCreated(res, req, user, `/api/v1/users/${user.id}`);
  }),
);
```

## TypeScript Conventions

- **Strict mode** — `"strict": true` in tsconfig. No exceptions.
- **No `any`** — Use `unknown` and narrow with type guards when the type is truly unknown.
- **Prefer interfaces** for object shapes, `type` for unions and intersections.
- **Use `readonly`** for data that should not be mutated after creation.
- **Use discriminated unions** for state variants instead of boolean flags.
- **Export types explicitly** from module boundary files.

```typescript
// GOOD — discriminated union
type RoomState =
  | { phase: 'waiting'; players: Player[] }
  | { phase: 'playing'; gameId: string; players: Player[] }
  | { phase: 'finished'; result: GameResult };

// AVOID — boolean soup
interface RoomState {
  isPlaying: boolean;
  isFinished: boolean;
  gameId?: string;
  result?: GameResult;
}
```

## Checklist

Before shipping backend code:

- [ ] Strict TypeScript — no `any`, no `as` casts without justification
- [ ] Environment config validated with Zod at startup
- [ ] Input validated at route boundary with Zod schemas
- [ ] Errors are typed (`AppError` subclasses), not raw strings
- [ ] Global error handler catches all unhandled errors
- [ ] Responses use consistent envelope format
- [ ] Logging uses Pino with structured fields — no `console.log`
- [ ] Health endpoints exist and check real dependencies
- [ ] Graceful shutdown handles SIGTERM properly
- [ ] Async handlers wrapped to propagate errors to Express
- [ ] No secrets in code or logs
