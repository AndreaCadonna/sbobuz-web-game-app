# Backend Platform Engineer Memory

## Current Progress
- **Phase 2 Steps 2.1-2.10:** Complete (all server infrastructure)
- **Phase 3 Steps 3.1-3.8:** Complete (middleware + auth module + handlers + routes + wiring)
- **Phase 4 Steps 4.1-4.5:** Complete (lobby module)
- **Phase 5 Steps 5.1-5.8:** Complete (realtime + game session + leaderboard + wiring)
- **Branch:** `feature/phase-5-realtime-module`
- **Total tests:** 1305 (629 Phase 1 + 195 Phase 2 + 160 Phase 3 + 115 Phase 4 + 206 Phase 5)
- **Next:** Phase 6 (AI Opponent Module)

## Phase 5 Files (Steps 5.5-5.8)

### Step 5.5 - Game Session Manager (30 tests)
- `server/src/modules/game-engine/session-manager.ts` - Bridges pure engine with I/O
- `server/src/modules/game-engine/session-manager.test.ts`

### Step 5.6 - Leaderboard Module (40 tests)
- `server/src/modules/leaderboard/leaderboard.types.ts` - Types
- `server/src/modules/leaderboard/rating-service.ts` - Pure ELO (K=40/20/10)
- `server/src/modules/leaderboard/repository.ts` - PostgreSQL for ratings/match_results
- `server/src/modules/leaderboard/leaderboard-service.ts` - Orchestration
- `server/src/modules/leaderboard/routes.ts` - REST: GET /, /me, /nearby, /history
- `server/src/modules/leaderboard/index.ts` - Barrel

### Step 5.7 - Integration Tests (25 tests)
- `server/src/modules/game-engine/__tests__/game-flow-integration.test.ts`

### Step 5.8 - Server Wiring
- Updated `server/src/server.ts` with Socket.IO, leaderboard routes, game session provider, shutdown

## Game Session Manager Patterns
- `createGameSession(roomId, playerIds, config, seed?)` -> `{ gameId, state }`
- `applyAction(gameId, action)` -> `ProcessActionResult`
- `createGameSessionProvider()` -> `GameSessionProvider` interface
- Redis keys: `game:snapshot:{gameId}`, `game:room:{roomId}`
- Turn timers: `setTimeout.unref()`, auto TIMEOUT_FORFEIT on expiry
- Completion: persists to `games` + `game_actions` tables, cleans Redis after 60s
- `broadcastStateToRoom/broadcastGameStarted` — per-player sanitized via fetchSockets

## Leaderboard / ELO
- Initial=1200, min=100, K: 40(0-29), 20(30-99), 10(100+)
- AI players (`ai_*` prefix) skipped in rating calculations
- REST at `/api/v1/leaderboard` with auth middleware

## Server Shutdown Sequence
1. `shutdownRealtimeModule(io)` 2. `snapshotAllSessions()` 3. `closeSocketIOServer()`
4. `httpServer.close()` 5. `resetSessionManager()` 6. `closePool()` 7. `closeRedisClients()`

## Phase 5 Files (Steps 5.1-5.4) - 111 tests
- `server/src/infra/websocket/` - types, setup, auth-middleware, rate-limiter
- `server/src/modules/realtime/` - connection-manager, presence-manager, handlers/, index

## Key Interfaces
- `GameSessionProvider` defined in `game-events.ts`, NOT `types.ts`
- `LegalMoveSet.all` (not `.actions`) for total legal moves
- `TypedSocketIOServer` from `setup.ts`, `TypedSocket` from `types.ts`

## Config
- `loadConfig(env?)` validates+freezes, `getConfig()` singleton, `resetConfig()` for tests
- Game config: `turnTimerSeconds` must be >0 (state-factory validates)

## Testing Gotchas
- `vi.mock()` hoisted — use `vi.hoisted()` for variables in mock factories
- Mock Redis: plain object store + vi.fn()
- Zod v4 `z.uuid()` rejects `00000000-...` — use `randomUUID()` in tests
- No `supertest` — use Node `fetch` + `createServer(app).listen(0)` for route tests
- PICK_UP_PILE needs non-empty pile — use PLAY_CARDS for first action in tests
- `pg` mock: `{ default: { Pool } }`; `ioredis` mock: `{ default: MockRedis }`

## Dependencies
- Phase 2: `zod`, `pino`, `pino-pretty`, `pg`, `ioredis`, `express` v5, `cors`, `tsx`
- Phase 3: `jsonwebtoken`, `bcryptjs`, `cookie-parser` (+ @types)
- Phase 5: `socket.io`, `@socket.io/redis-adapter`

## TypeScript
- `exactOptionalPropertyTypes: true` — optional props need `| undefined`
- `module: "ES2022"`, `moduleResolution: "bundler"`
- Express.Request augmented via `declare global { namespace Express }`
