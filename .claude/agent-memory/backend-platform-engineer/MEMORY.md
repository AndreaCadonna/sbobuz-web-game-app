# Backend Platform Engineer Memory

## Current Progress
- **Phase 2 Steps 2.1-2.10:** Complete (all server infrastructure)
- **Branch:** `feature/phase-2-server-infrastructure`
- **Total tests:** 824 (629 Phase 1 + 195 Phase 2)
- **Next:** Phase 3 (Auth Module + API Gateway)

## Phase 2 Files Created

### Steps 2.1-2.6 (config, logger, errors, db, migrator, redis)
- `server/src/shared/config/schema.ts`, `index.ts`, `config.test.ts` (41 tests)
- `server/src/shared/context.ts`, `server/src/shared/logger.ts`, `logger.test.ts` (20 tests)
- `server/src/shared/errors/app-error.ts`, `errors.ts`, `index.ts`, `errors.test.ts` (42 tests)
- `server/src/infra/database/pool.ts`, `index.ts`, `pool.test.ts` (23 tests)
- `server/src/infra/database/migrator.ts`, `migrator.test.ts` (17 tests), `migrations/001-008*.sql`
- `server/src/infra/redis/client.ts`, `index.ts`, `client.test.ts` (34 tests)

### Step 2.7 - Health Check Endpoints
- `server/src/shared/middleware/health.ts` - Express router: /live, /ready, /capacity
- `server/src/shared/middleware/health.test.ts` - 18 tests

### Step 2.8 - Express Server Composition Root
- `server/src/server.ts` - Express app, HTTP server, graceful shutdown
- `createApp(config)` exportable for testing, `startServer()` for full init

### Step 2.9 - Docker Compose
- `docker-compose.yml` - postgres:16, redis:7, app, grafana, prometheus, jaeger, loki
- `infra/docker/Dockerfile` - 3-stage build (deps, build, production)
- `.dockerignore`, `observability/prometheus/prometheus.yml`

### Step 2.10 - npm Scripts
- Root `package.json`: added `start`, `format:fix`

## Key Patterns

### Config
- `loadConfig(env?)` validates+freezes, `getConfig()` returns singleton, `resetConfig()` for tests
- Boolean env vars: `z.enum(['true','false']).transform()` pattern

### Server Composition
- `createApp(config)` returns Express app (testable without HTTP listen)
- `startServer()`: config -> logger -> db pool -> migrations? -> redis -> listen
- Graceful shutdown: stop HTTP -> close pool -> close redis -> exit(0)
- Request context middleware: requestId/traceId via AsyncLocalStorage
- Express 5 is used (v5.2.1)

### Health Checks
- `createHealthRouter()` -> mount at `/health`
- /ready: 503 if DB or Redis down or latency > 5000ms
- /capacity: placeholder activeGames=0 until game session module built

## Dependencies
- `zod`, `pino`, `pino-pretty`, `pg`, `@types/pg`, `ioredis`
- `express` (v5), `@types/express`, `cors`, `@types/cors`, `tsx`

## TypeScript Gotchas
- `exactOptionalPropertyTypes: true` requires `| undefined` on optional params
- Server uses `module: "ES2022"` with `moduleResolution: "bundler"`
- ioredis: import `RedisOptions` type separately

## Testing Gotchas
- `vi.mock()` factories are hoisted -- use `vi.hoisted()` for variables referenced inside
- On Windows/WSL, `rmSync` can throw EIO on temp dirs during parallel tests
- `pg` mock: `{ default: { Pool: MockPool } }`; `ioredis` mock: `{ default: MockRedis }`
- Complex inline type assertions break esbuild -- use separate interface declarations
