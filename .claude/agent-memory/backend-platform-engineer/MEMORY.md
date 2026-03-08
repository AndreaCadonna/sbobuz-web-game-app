# Backend Platform Engineer Memory

## Current Progress
- **Phase 2 Steps 2.1-2.10:** Complete (all server infrastructure)
- **Phase 3 Steps 3.1-3.8:** Complete (middleware + auth module + handlers + routes + wiring)
- **Phase 4 Steps 4.1-4.5:** Complete (lobby module)
- **Branch:** `feature/phase-4-lobby-module`
- **Total tests:** 1099 (629 Phase 1 + 195 Phase 2 + 160 Phase 3 + 115 Phase 4)
- **Next:** Phase 4 complete, ready for Phase 5 (Realtime + Game Session + Leaderboard)

## Phase 3 Files Created

### Step 3.1 - Middleware Pipeline (63 tests)
- `server/src/shared/middleware/request-id.ts` - UUIDv4 requestId, AsyncLocalStorage context (7 tests)
- `server/src/shared/middleware/cors.ts` - Config-driven CORS wrapper (5 tests)
- `server/src/shared/middleware/rate-limiter.ts` - Redis sorted set sliding window (11 tests)
- `server/src/shared/middleware/auth-middleware.ts` - JWT HS256 verification, Express.Request augmentation (13 tests)
- `server/src/shared/middleware/error-handler.ts` - Global 4-arg error handler, ApiErrorResponse format (15 tests)
- `server/src/shared/middleware/validation.ts` - Zod validateBody/Query/Params factories (12 tests)

### Steps 3.2-3.4 - Auth Module (54 tests)
- `server/src/modules/auth/auth.types.ts` - User, Session, RefreshToken, DeviceInfo interfaces
- `server/src/modules/auth/repository.ts` - createUser (transaction), findUser*, userExists* (19 tests)
- `server/src/modules/auth/token-service.ts` - JWT generate/verify, refresh token CRUD in Redis (17 tests)
- `server/src/modules/auth/session-service.ts` - Session CRUD in Redis, user_sessions SET tracking (18 tests)

### Steps 3.5-3.8 - Handlers, Routes, Wiring (43 tests)
- `server/src/modules/auth/schemas.ts` - Zod registerSchema, loginSchema with reserved usernames
- `server/src/modules/auth/handlers.ts` - register, login, refresh, logout, me handlers
- `server/src/modules/auth/routes.ts` - Express router with rate limiters + asyncHandler
- `server/src/modules/auth/handlers.test.ts` - 43 tests covering all flows
- Updated `server/src/server.ts` - cookie-parser, auth routes at /api/v1/auth, error handler, ApiErrorResponse 404

## Phase 4 Files Created

### Step 4.1 - Room Repository
- `server/src/modules/lobby/room-repository.ts` - Redis CRUD (saveRoom, getRoom, deleteRoom, listPublicRooms), PG archival

### Step 4.2 - Room Service
- `server/src/modules/lobby/room-service.ts` - createRoom, joinRoom, leaveRoom, setReady, startGame, addAIPlayer, removePlayer, updateSettings
- `server/src/modules/lobby/lobby.types.ts` - Room, CreateRoomInput, RoomArchive, RoomListItem, computeRoomStatus, toRoomState

### Step 4.3 - Handlers, Schemas, Routes
- `server/src/modules/lobby/schemas.ts` - Zod schemas for all endpoints
- `server/src/modules/lobby/handlers.ts` - 10 route handlers
- `server/src/modules/lobby/routes.ts` - Express router at /api/v1/lobby

### Step 4.4 - Tests (115 tests)
- `server/src/modules/lobby/lobby.types.test.ts` - 14 tests (computeRoomStatus, toRoomState, constants)
- `server/src/modules/lobby/room-service.test.ts` - 56 tests (all service operations + edge cases)
- `server/src/modules/lobby/handlers.test.ts` - 12 tests (handler delegation)
- `server/src/modules/lobby/schemas.test.ts` - 33 tests (all Zod schemas)

### Step 4.5 - Server Wiring
- Updated `server/src/server.ts` - lobby routes at /api/v1/lobby
- Updated `server/src/shared/errors/errors.ts` - AuthorizationError accepts ROOM_NOT_HOST

## Phase 2 Files Created

### Steps 2.1-2.6 (config, logger, errors, db, migrator, redis)
- `server/src/shared/config/schema.ts`, `index.ts`, `config.test.ts` (41 tests)
- `server/src/shared/context.ts`, `server/src/shared/logger.ts`, `logger.test.ts` (20 tests)
- `server/src/shared/errors/app-error.ts`, `errors.ts`, `index.ts`, `errors.test.ts` (42 tests)
- `server/src/infra/database/pool.ts`, `index.ts`, `pool.test.ts` (23 tests)
- `server/src/infra/database/migrator.ts`, `migrator.test.ts` (17 tests), `migrations/001-008*.sql`
- `server/src/infra/redis/client.ts`, `index.ts`, `client.test.ts` (34 tests)

### Steps 2.7-2.10
- `server/src/shared/middleware/health.ts` + test (18 tests)
- `server/src/server.ts` - Express composition root
- `docker-compose.yml`, `infra/docker/Dockerfile`

## Key Patterns

### Config
- `loadConfig(env?)` validates+freezes, `getConfig()` returns singleton, `resetConfig()` for tests
- Boolean env vars: `z.enum(['true','false']).transform()` pattern

### Auth Middleware
- `createAuthMiddleware(jwtSecret)` - required auth, returns 401 via next(err)
- `optionalAuth(jwtSecret)` - attaches user if valid, proceeds regardless
- Express.Request augmented with `userId?`, `username?`, `userEmail?`, `sessionId?` via global declaration

### Rate Limiter
- `createRateLimiter(options)` factory, supports per-endpoint overrides
- Redis pipeline: ZREMRANGEBYSCORE + ZCARD + ZADD + PEXPIRE
- Fails open on Redis errors (logs warning, allows request)

### Token Service
- `generateAccessToken(payload)` includes `sessionId` in JWT claims
- `verifyAccessToken(token)` returns `DecodedAccessToken` with `sessionId`
- `generateRefreshToken(userId, sessionId)` stores in Redis as `refresh:{tokenId}`
- `rotateRefreshToken` marks old as used, creates new
- `revokeAllRefreshTokensForUser` uses SCAN (expensive, used sparingly)

### Session Service
- `createSession(userId, deviceInfo)` stores JSON at `session:{sessionId}`, adds to `user_sessions:{userId}` SET
- `revokeSession` sets isRevoked=true, keeps in Redis for audit
- `revokeAllSessions` iterates SMEMBERS, revokes each, DELs the set

### DB Schema (credentials table)
- Has `id`, `user_id`, `password_hash`, `refresh_token_hash`, `password_changed_at`, etc.
- The credentials table has its own UUID PK plus user_id FK (not user_id as PK)

### Lobby Module
- Redis keys: `room:{roomId}` (JSON), `room:invite:{inviteCode}` -> roomId, `room:public_list` (SET), `user:current_room:{userId}` -> roomId
- All keys TTL = 1800s (30min), refreshed on activity
- `saveRoom()` uses pipeline for atomicity (set room + invite + user keys + public list)
- `computeRoomStatus()` ignores AI players for ready calculation
- Host transfer: earliest-joined human player becomes host
- Zod schema `maxPlayers` infers as `number` but `RoomSettings.maxPlayers` is `2|3|4|5` — use `as Partial<RoomSettings>` cast in handlers
- Rate limiter keyBy accepts `'ip' | 'userId'` (not `'user'`)

## Dependencies
- Phase 2: `zod`, `pino`, `pino-pretty`, `pg`, `@types/pg`, `ioredis`, `express` (v5), `cors`, `tsx`
- Phase 3: `jsonwebtoken`, `@types/jsonwebtoken`, `bcryptjs`, `@types/bcryptjs`, `cookie-parser`, `@types/cookie-parser`

## TypeScript Gotchas
- `exactOptionalPropertyTypes: true` requires `| undefined` on optional params
- Server uses `module: "ES2022"` with `moduleResolution: "bundler"`
- Express.Request type augmentation via `declare global { namespace Express { ... } }`

## Testing Gotchas
- `vi.mock()` factories are hoisted -- use `vi.hoisted()` for variables referenced inside
- For async module imports after mocks: `const { fn } = await import('./module.js')`
- Mock Redis store pattern: plain object + vi.fn() implementing get/set/del/sadd/smembers
- `pg` mock: `{ default: { Pool: MockPool } }`; `ioredis` mock: `{ default: MockRedis }`
