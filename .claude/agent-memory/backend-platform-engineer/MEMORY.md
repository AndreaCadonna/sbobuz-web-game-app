# Backend Platform Engineer Memory

## Current Progress
- **Phase 2 Steps 2.1-2.10:** Complete (all server infrastructure)
- **Phase 3 Steps 3.1-3.8:** Complete (middleware + auth module + handlers + routes + wiring)
- **Phase 4 Steps 4.1-4.5:** Complete (lobby module)
- **Phase 5 Steps 5.1-5.8:** Complete (realtime + game session + leaderboard + wiring)
- **Phase 6 Steps 6.1-6.6:** Complete (AI opponent module)
- **Branch:** `feature/phase-6-ai-opponent`
- **Total tests:** 1407 (629 Phase 1 + 195 Phase 2 + 160 Phase 3 + 115 Phase 4 + 206 Phase 5 + 102 Phase 6)
- **Next:** Phase 7 (Frontend Client) or Phase 8 (CI/CD)

## Phase 6 Files - AI Opponent Module (102 tests)
- `server/src/modules/ai/ai.types.ts` - AIPlayer, MoveEvaluation, WorkerRequest/Response, AIConfig, isAIPlayer()
- `server/src/modules/ai/worker-pool.ts` - Worker thread pool (init, compute, shutdown, stats)
- `server/src/modules/ai/worker.ts` - Worker script (loads strategies, handles requests)
- `server/src/modules/ai/ai-player.ts` - AI player registry, creation, game assignment
- `server/src/modules/ai/controller.ts` - Turn handling, move computation, response delay, retry
- `server/src/modules/ai/strategies/random.ts` - Seeded RNG uniform selection (EASY)
- `server/src/modules/ai/strategies/heuristic.ts` - Weighted scoring with variance (MEDIUM)
- `server/src/modules/ai/index.ts` - Barrel export
- `server/src/modules/ai/__tests__/ai-simulation.test.ts` - 350+ AI-vs-AI games across 2-5 players

## Phase 6 Design Decisions
- Strategies run on main thread (not worker threads) — fast enough (<1ms)
- Worker pool exists for future MCTS but not used for EASY/MEDIUM
- Response delays: EASY 1-2s, MEDIUM 1.5-3s, follow-up 500-1000ms
- Controller: `void handleAITurn(...)` for fire-and-forget async
- No new npm dependencies — uses Node.js `worker_threads` stdlib

## Game Engine Edge Case (Phase 6 discovery)
- `enumerateLegalMoves()` returns empty for `awaiting_queen_declaration` when player has no cards
- Player plays last Queen -> `getActiveZone` returns 'finished' before declaration check
- Workaround: submit DECLARE_DIRECTION directly or TIMEOUT_FORFEIT
- Phase 1 engine bug — should be fixed separately

## Phase 6 Testing Gotchas
- `configureAI({ minResponseDelayMs: 0 })` does NOT affect delays — they come from `DIFFICULTY_DELAYS`
- `void handleAITurn(...)` in onGameStarted leaks async chains between tests
- Fix: register callbacks returning `phase: 'finished'` to prevent chains
- `createGame` requires `turnTimerSeconds > 0`
- Some heuristic games need many actions (up to 50000) to complete

## Key Interfaces
- `GameSessionProvider` defined in `game-events.ts`, NOT `types.ts`
- `LegalMoveSet.all` (not `.actions`) for total legal moves
- `TypedSocketIOServer` from `setup.ts`, `TypedSocket` from `types.ts`

## Config
- `loadConfig(env?)` validates+freezes, `getConfig()` singleton, `resetConfig()` for tests
- `ENABLE_AI_OPPONENT` feature flag in config schema
- Game config: `turnTimerSeconds` must be >0 (state-factory validates)

## Testing Gotchas (General)
- `vi.mock()` hoisted — use `vi.hoisted()` for variables in mock factories
- Mock Redis: plain object store + vi.fn()
- Zod v4 `z.uuid()` rejects `00000000-...` — use `randomUUID()` in tests
- No `supertest` — use Node `fetch` + `createServer(app).listen(0)` for route tests
- `pg` mock: `{ default: { Pool } }`; `ioredis` mock: `{ default: MockRedis }`

## Dependencies
- Phase 2: `zod`, `pino`, `pino-pretty`, `pg`, `ioredis`, `express` v5, `cors`, `tsx`
- Phase 3: `jsonwebtoken`, `bcryptjs`, `cookie-parser` (+ @types)
- Phase 5: `socket.io`, `@socket.io/redis-adapter`
- Phase 6: No new dependencies

## TypeScript
- `exactOptionalPropertyTypes: true` — optional props need `| undefined`
- `module: "ES2022"`, `moduleResolution: "bundler"`
- Express.Request augmented via `declare global { namespace Express }`
