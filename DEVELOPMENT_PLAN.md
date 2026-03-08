# Sbobuz - Development Plan

> Generated: 2026-03-08 | Status: Not Started | Phases: 8 | Tasks: ~80

## Current State Assessment

The project has **zero source code** and **zero configuration files**. What exists is a comprehensive set of specification documents:

| Document | Location | Scope |
|---|---|---|
| Architecture Overview | `architecture-overview.md` | System architecture, ADRs, scaling strategy, tech stack |
| Game Engine Spec | `SBOBUZ_ENGINE_SPEC.md` | Complete card game rules, state model, reducer logic, 20 edge cases |
| Data Layer Spec | `docs/specs/data-layer.md` | PostgreSQL schema, Redis keys, backup/recovery, migrations |
| Auth Module Spec | `docs/specs/auth-module.md` | JWT auth, registration/login flows, session management |
| Lobby Module Spec | `docs/specs/lobby-module.md` | Room lifecycle, invites, ready system, matchmaking (future) |
| Realtime Module Spec | `docs/specs/realtime-module.md` | Socket.IO events, presence, reconnection, state rehydration |
| AI Opponent Spec | `docs/specs/ai-opponent-module.md` | Worker threads, strategies (random + heuristic), legal move enumeration |
| Frontend Client Spec | `docs/specs/frontend-client.md` | Next.js/React SPA, Zustand stores, component hierarchy, animations |
| API Gateway Spec | `docs/specs/api-gateway.md` | Routes, middleware pipeline, error codes, rate limiting |
| Observability Spec | `docs/specs/observability-stack.md` | OTel, Pino, Prometheus, Jaeger, Loki, Grafana dashboards |
| Infrastructure Spec | `docs/specs/infrastructure-deployment.md` | Docker, CI/CD, K8s, Terraform, graceful shutdown |

---

## Dependency Graph

```
Phase 0  [Repository Bootstrap]
    |
Phase 1  [Shared Types + Game Engine]
    |
Phase 2  [Server Infrastructure: Config, DB, Redis, Logger, Health]
    |
Phase 3  [Auth Module + API Gateway Middleware]
    |
Phase 4  [Lobby Module]
    |
Phase 5  [Realtime Module + Game Session + Leaderboard]
   / \
Phase 6  [AI Opponent]     (can parallelize)
Phase 7  [Frontend Client]  (can parallelize)
   \ /
Phase 8  [Observability, CI/CD, Deployment]
```

---

## Phase 0: Repository Bootstrap and Toolchain

**Goal:** Fully configured, build-ready project skeleton with no application code. `npm run build`, `npm run lint`, and `npm run test` all succeed.

### Step 0.1 - Initialize Git Repository and .gitignore
Create `.gitignore` covering Node.js, TypeScript build output, IDE files, environment files, Docker volumes, OS files, and coverage reports. Initialize git.

- **Files:** `.gitignore`

### Step 0.2 - Create Root package.json with Workspace Configuration
Two workspaces: backend (`server/`) and frontend (`app/`), plus shared types (`shared/`).

- `name: "sbobuz"`, `private: true`
- Node.js engine: `>=20.0.0`
- Scripts: `dev`, `build`, `lint`, `test`, `test:integration`, `migrate`, `typecheck`
- DevDependencies: TypeScript 5.x, ESLint (flat config), Prettier, Vitest

- **Files:** `package.json`

### Step 0.3 - Create TypeScript Configuration
Three tsconfig files following project references pattern:

- Root `tsconfig.json` (project references to server, app, shared)
- `server/tsconfig.json` (Node.js 20 target, ES2022 module, strict mode, path aliases)
- `shared/tsconfig.json` (declaration output for shared types)
- `app/tsconfig.json` (Next.js config, extends from root)

Key: strict mode, no implicit any, exact optional property types.

- **Files:** `tsconfig.json`, `server/tsconfig.json`, `shared/tsconfig.json`

### Step 0.4 - Create ESLint Configuration
Flat ESLint config with TypeScript-aware rules, `no-console: error` (Pino only), import ordering, unused variables as errors, explicit return types on exports.

- **Files:** `eslint.config.js`

### Step 0.5 - Create Prettier Configuration
Single quotes, trailing commas, 2-space indent, 100-char print width, semicolons.

- **Files:** `.prettierrc`, `.prettierignore`

### Step 0.6 - Create .nvmrc and .env.example
- `.nvmrc` with `20`
- `.env.example` with all env vars from `infrastructure-deployment.md` Section 2.1

- **Files:** `.nvmrc`, `.env.example`

### Step 0.7 - Create Directory Structure
Full directory skeleton per `architecture-overview.md` Section 4. Each directory gets `.gitkeep`.

```
server/
  modules/auth/
  modules/lobby/
  modules/game-engine/
  modules/realtime/
  modules/ai/
  shared/types/
  shared/errors/
  shared/middleware/
  shared/config/
  infra/database/migrations/
  infra/redis/
  infra/websocket/
shared/types/
infra/docker/
infra/k8s/base/
infra/k8s/overlays/staging/
infra/k8s/overlays/production/
infra/terraform/modules/
infra/terraform/environments/staging/
infra/terraform/environments/production/
observability/grafana/provisioning/
observability/grafana/dashboards/
observability/prometheus/
observability/otel/
docs/adrs/
docs/runbooks/
```

### Step 0.8 - Create Vitest Configuration
Two configs: unit tests (fast, no external deps) and integration tests (requires Postgres + Redis). Coverage thresholds: 80% across branches, functions, lines, statements.

- **Files:** `vitest.config.ts`, `vitest.config.integration.ts`

### Step 0.9 - Verify Toolchain
Run `npm install`, `npm run typecheck`, `npm run lint`, `npm run test` - all pass with zero errors.

---

## Phase 1: Shared Foundation and Game Engine (Pure Logic)

**Goal:** Game engine as a fully tested, pure-function module with zero I/O dependencies. Must be bulletproof before anything else is built.

### Step 1.1 - Define Shared Types
All types from `SBOBUZ_ENGINE_SPEC.md` Sections 8-9 and cross-module types:

- `shared/types/card.ts` - `Card`, `StandardCard`, `JokerCard`, `Suit`, `Rank`
- `shared/types/game-state.ts` - `GameState`, `PlayerState`, `GamePhase`, `GameConfig`
- `shared/types/game-action.ts` - `GameAction` discriminated union (all 6 action types)
- `shared/types/active-zone.ts` - `ActiveZone` type and derived state functions
- `shared/types/user.ts` - `PublicUserProfile`, `UserStatus`
- `shared/types/room.ts` - `RoomState`, `RoomPlayer`, `RoomStatus`, `RoomVisibility`
- `shared/types/api.ts` - `ApiSuccessResponse`, `ApiErrorResponse`, `ErrorCode`
- `shared/types/index.ts` - barrel export

### Step 1.2 - Implement Seeded PRNG
Per engine spec Section 14. Deterministic, never uses `Math.random()`.

- `server/modules/game-engine/rng.ts`
- `server/modules/game-engine/rng.test.ts` - determinism + distribution tests

### Step 1.3 - Implement Rank Comparator
Per engine spec Section 3. Handles rank hierarchy, `freePlay`, `nextCardOverride`, special cards.

- `server/modules/game-engine/rank-comparator.ts`
- `server/modules/game-engine/rank-comparator.test.ts`

### Step 1.4 - Implement Deck Builder and Dealer
Per engine spec Sections 2 and 4. 54-card deck, seeded shuffle, deal 9 cards per player (3 face-down, 3 face-up, 3 hand).

- `server/modules/game-engine/deck.ts`
- `server/modules/game-engine/deck.test.ts`

### Step 1.5 - Implement Starting Player Algorithm
Per engine spec Section 4.1. Multi-step tiebreaker: lowest card, second-lowest, third, positional advantage, random fallback.

- `server/modules/game-engine/starting-player.ts`
- `server/modules/game-engine/starting-player.test.ts`

### Step 1.6 - Implement State Factory
Combines Steps 1.2-1.5. Creates initial `GameState` from player list and RNG seed.

- `server/modules/game-engine/state-factory.ts`
- `server/modules/game-engine/state-factory.test.ts`

### Step 1.7 - Implement Active Zone Resolver
Per engine spec Section 5.3. Determines which zone a player plays from.

- `server/modules/game-engine/active-zone.ts`
- `server/modules/game-engine/active-zone.test.ts`

### Step 1.8 - Implement Sbobuz Detector
Per engine spec Section 12. Checks top 4 cards of play pile for matching rank, joker exclusion.

- `server/modules/game-engine/sbobuz-detector.ts`
- `server/modules/game-engine/sbobuz-detector.test.ts`

### Step 1.9 - Implement Turn Manager
Per engine spec Section 13. Wrapping with negative direction (double-modulo).

- `server/modules/game-engine/turn-manager.ts`
- `server/modules/game-engine/turn-manager.test.ts`

### Step 1.10 - Implement Action Validator
Per engine spec Sections 10.1-10.5. Universal checks + per-action-type validation.

- `server/modules/game-engine/validator.ts`
- `server/modules/game-engine/validator.test.ts`

### Step 1.11 - Implement State Reducer
The heart of the engine. Per engine spec Sections 11.1-11.4. Pure function: `(currentState, validatedAction) -> newState`.

- `server/modules/game-engine/reducer.ts`
- `server/modules/game-engine/reducer.test.ts`

### Step 1.12 - Implement Win Condition Evaluator
Per engine spec Section 7, Step 5. Integrated into reducer.

### Step 1.13 - Implement Legal Move Enumerator
Per AI opponent spec Section 8. Returns all valid `GameAction` objects for a player.

- `server/modules/game-engine/legal-moves.ts`
- `server/modules/game-engine/legal-moves.test.ts`

### Step 1.14 - Implement State Sanitizer
Per engine spec Section 18. Player-specific views hiding other players' hands.

- `server/modules/game-engine/sanitizer.ts`
- `server/modules/game-engine/sanitizer.test.ts`

### Step 1.15 - Implement Game Engine Module Interface
Compose all components into public interface.

- `server/modules/game-engine/index.ts` - exports `createGame()`, `processAction()`, `enumerateLegalMoves()`, `sanitizeStateForPlayer()`, `getCurrentState()`

### Step 1.16 - Edge Case Integration Tests
All 20 edge case scenarios from engine spec Section 17.

- `server/modules/game-engine/__tests__/edge-cases.test.ts`

### Step 1.17 - Full Game Simulation Tests
Complete games from setup to win using deterministic seeds. Verify termination, winner, replay consistency, 2-5 player games.

- `server/modules/game-engine/__tests__/full-game.test.ts`

---

## Phase 2: Server Infrastructure Foundation

**Goal:** Server composition root, config validation, DB/Redis connectivity, logging, health checks. `npm run dev` starts a server responding to health checks.

### Step 2.1 - Implement Configuration Module
Zod-validated environment configuration, frozen singleton.

- `server/shared/config/schema.ts`, `server/shared/config/index.ts`, `server/shared/config/config.test.ts`

### Step 2.2 - Implement Structured Logger
Pino-based with trace context injection via AsyncLocalStorage.

- `server/shared/logger.ts`, `server/shared/context.ts`

### Step 2.3 - Implement Error Hierarchy
Typed error classes mapping to HTTP status codes.

- `server/shared/errors/` - `AppError`, `AuthenticationError`, `AuthorizationError`, `ValidationError`, `NotFoundError`, `ConflictError`, `RateLimitError`

### Step 2.4 - Implement PostgreSQL Connection Pool
Pool configuration with health checks.

- `server/infra/database/pool.ts`, `server/infra/database/index.ts`

### Step 2.5 - Implement Database Migration Runner
File-based sequential migrations with up/down SQL. Create migrations 001-007 from data-layer spec.

- `server/infra/database/migrator.ts`
- `server/infra/database/migrations/001_create_users.sql` through `007_create_match_results.sql`

### Step 2.6 - Implement Redis Client
Primary and subscriber connections with retry and health check.

- `server/infra/redis/client.ts`, `server/infra/redis/index.ts`

### Step 2.7 - Implement Health Check Endpoints
Three endpoints: `/health/live`, `/health/ready`, `/health/capacity`.

- `server/shared/middleware/health.ts`

### Step 2.8 - Implement Express Server Composition Root
Main `server.ts` wiring everything together with graceful shutdown.

- `server/server.ts`

### Step 2.9 - Create Docker Compose for Local Development
All services: app, postgres, redis, grafana, prometheus, jaeger, loki.

- `docker-compose.yml`, `infra/docker/Dockerfile`

### Step 2.10 - Create npm Scripts
Update `package.json` with working scripts for dev, build, start, migrate, lint, format, typecheck, test.

---

## Phase 3: Auth Module and API Gateway Middleware

**Goal:** Users can register, log in, refresh tokens, and log out. API gateway enforces auth, rate limiting, CORS, input validation.

### Step 3.1 - Implement API Gateway Middleware Pipeline
In order: request-id, CORS, body-parser, rate-limiter, auth, error-handler, validation.

- `server/shared/middleware/` - one file per middleware

### Step 3.2 - Implement Auth Module - User Repository
Database access layer for users and credentials tables.

- `server/modules/auth/repository.ts`

### Step 3.3 - Implement Auth Module - Token Service
JWT issuance/validation, refresh token management in Redis.

- `server/modules/auth/token-service.ts`

### Step 3.4 - Implement Auth Module - Session Service
Redis-backed session tracking.

- `server/modules/auth/session-service.ts`

### Step 3.5 - Implement Auth Module - Handlers
Register, login, refresh, logout, me.

- `server/modules/auth/handlers.ts`, `server/modules/auth/schemas.ts`

### Step 3.6 - Implement Auth Module - Route Registration
Express router with all `/api/v1/auth/*` routes.

- `server/modules/auth/routes.ts`

### Step 3.7 - Auth Module Tests
Unit + integration tests, all 20 edge case scenarios from auth spec Section 9.

### Step 3.8 - Wire Auth Module into Server
Apply middleware pipeline, mount auth routes, verify end-to-end flow.

---

## Phase 4: Lobby Module

**Goal:** Users can create rooms, join via link or public list, toggle ready, host can start a game.

### Step 4.1 - Implement Room Repository
Redis-backed active room CRUD, PostgreSQL archive on game start.

- `server/modules/lobby/room-repository.ts`

### Step 4.2 - Implement Room Service
Business logic for room lifecycle: create, join, leave, ready, start, kick.

- `server/modules/lobby/room-service.ts`

### Step 4.3 - Implement Route Handlers and Validation
REST endpoints for all lobby operations.

- `server/modules/lobby/handlers.ts`, `server/modules/lobby/schemas.ts`, `server/modules/lobby/routes.ts`

### Step 4.4 - Lobby Module Tests
Room lifecycle, edge cases (host transfer, room expiry, private codes), Redis integration.

### Step 4.5 - Wire Lobby Module into Server
Mount lobby routes, verify room creation and listing.

---

## Phase 5: Realtime Module and Game Integration

**Goal:** WebSocket connections work. Players can connect, play a complete game, handle disconnects, receive state updates in real time.

### Step 5.1 - Implement Socket.IO Server Setup
Socket.IO server creation, Redis adapter, JWT auth on handshake, per-socket rate limiting.

- `server/infra/websocket/setup.ts`, `server/infra/websocket/auth-middleware.ts`, `server/infra/websocket/rate-limiter.ts`

### Step 5.2 - Implement Connection Manager
Track connections, enforce one-per-user, heartbeat sweep.

- `server/modules/realtime/connection-manager.ts`

### Step 5.3 - Implement Presence Manager
Presence tracking, 30-second grace period, reconnection handling.

- `server/modules/realtime/presence-manager.ts`

### Step 5.4 - Implement Event Handlers
Room events, game action relay, presence events.

- `server/modules/realtime/handlers/room-events.ts`, `game-events.ts`, `presence-events.ts`

### Step 5.5 - Implement Game Session Manager
Connects Game Engine (pure logic) to Realtime Module (I/O). In-memory state, Redis snapshots, turn timers.

- `server/modules/game-engine/session-manager.ts`

### Step 5.6 - Implement Leaderboard Module
ELO calculation, rating updates on game end.

- `server/modules/leaderboard/rating-service.ts`, `repository.ts`, `routes.ts`

### Step 5.7 - End-to-End Game Flow Integration Tests
Full flow without browser: register, create room, join, ready, start, play turns via WebSocket, complete game, verify persistence.

### Step 5.8 - Wire Everything into Server
Attach Socket.IO, mount all routes, initialize game session manager.

---

## Phase 6: AI Opponent Module

**Goal:** Players can play against AI at Easy and Medium difficulty.

### Step 6.1 - Implement Worker Pool Manager
Worker creation, dispatch, timeout, crash recovery, queue management.

- `server/modules/ai/worker-pool.ts`, `server/modules/ai/worker.ts`

### Step 6.2 - Implement Random Strategy (Easy)
Uniform random selection from legal moves with seeded RNG.

- `server/modules/ai/strategies/random.ts`

### Step 6.3 - Implement Heuristic Strategy (Medium)
Weighted scoring, random variance, queen declaration heuristic.

- `server/modules/ai/strategies/heuristic.ts`

### Step 6.4 - Implement AI Controller
Turn notification handler, response delay, action submission, retry logic.

- `server/modules/ai/controller.ts`, `server/modules/ai/ai-player.ts`

### Step 6.5 - Integrate AI with Lobby and Game Engine
Lobby support for AI players, turn change callbacks, state broadcast including AI actions.

### Step 6.6 - AI-vs-AI Simulation Tests
Thousands of games: verify termination, no deadlocks, collect duration statistics.

---

## Phase 7: Frontend Client

**Goal:** Fully functional React/Next.js SPA for auth, room management, and real-time gameplay.

### Step 7.1 - Initialize Next.js Application
Next.js 14+ (App Router), Tailwind CSS, shared types import.

### Step 7.2 - Implement State Management (Zustand)
Stores: `auth-store`, `room-store`, `game-store`, `socket-store`, `ui-store`.

### Step 7.3 - Implement Socket.IO Client Hook
Connection management, event listeners, heartbeat, reconnection with token refresh.

### Step 7.4 - Implement Auth Pages
Login form, registration form, auth flow hook with token refresh interceptor.

### Step 7.5 - Implement Lobby Pages
Room list, create room, room view with player list, ready buttons, start game.

### Step 7.6 - Implement Game Board Components
`GameBoard`, `PlayerHand`, `OpponentZone`, `PlayPile`, `DrawPile`, `FaceUpCards`, `FaceDownCards`, `GameControls`, `TurnIndicator`, `GameOverModal`.

### Step 7.7 - Implement Card Component and Animations
Card rendering (suit, rank, face-down state), CSS transitions for play/pickup/deal.

### Step 7.8 - Implement Game Logic Integration
Wire game board to Socket.IO events: state updates, action sending, error feedback, reconnection sync.

### Step 7.9 - Implement Leaderboard and Profile Pages
Top 100 rankings, player stats, match history.

### Step 7.10 - Implement Responsive Layout and Navigation
Header, footer, mobile-responsive game board.

---

## Phase 8: Observability, CI/CD, and Deployment

**Goal:** Production-ready observability, automated CI/CD, containerized deployment.

### Step 8.1 - Implement OpenTelemetry SDK
Trace provider, metric provider, auto-instrumentation. Must load before other imports.

- `server/infra/otel/setup.ts`

### Step 8.2 - Implement Prometheus Metrics
System, business, error, and capacity metrics. `/metrics` endpoint on port 9464.

- `server/infra/otel/metrics.ts`

### Step 8.3 - Create Observability Configuration
Prometheus scrape config, Grafana datasources and dashboards.

### Step 8.4 - Create GitHub Actions CI Pipeline
Lint, typecheck, unit tests, integration tests (with service containers), build check, deploy pipeline.

- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

### Step 8.5 - Create Production Dockerfile
Multi-stage build (deps -> build -> production).

### Step 8.6 - Create Kubernetes Manifests
Base manifests + staging/production overlays with HPA and PDB.

### Step 8.7 - Create Alerting Rules
Critical, warning, and informational alerts.

### Step 8.8 - Create Runbooks
Runbook stubs for each critical alert scenario.

---

## Key Decisions (Locked by Specs)

| Decision | Spec Reference |
|---|---|
| Modular monolith architecture | `architecture-overview.md` ADR-001 |
| Event-sourced game state | `SBOBUZ_ENGINE_SPEC.md` Section 15, ADR-005 |
| Server-authoritative game logic | `SBOBUZ_ENGINE_SPEC.md` Section 18 |
| HS256 JWT (upgrade path to RS256) | `auth-module.md` Decision #1 |
| bcrypt cost factor 12 | `auth-module.md` Decision #5 |
| Typed query builder, no ORM | `data-layer.md` Decision #4 |
| Pino structured logger, console.log banned | `observability-stack.md` Decision #5 |
| Socket.IO with Redis adapter | `realtime-module.md` Decision #1 |
| Worker threads for AI | `ai-opponent-module.md` Decision #1 |
| 30-second disconnect grace period | `realtime-module.md` Decision #2 |
| Full state sync on reconnect | `realtime-module.md` Decision #3 |
| Path-based API versioning (/api/v1) | `api-gateway.md` Decision #3 |
| Rolling update deployment | `infrastructure-deployment.md` Decision #6 |
| Kustomize, not Helm | `infrastructure-deployment.md` Decision #3 |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Game engine bugs causing invalid states | Medium | Critical | Phase 1 focuses entirely on engine testing. 20 edge case tests + full game simulations. Pure functions = deterministic debugging. |
| WebSocket complexity (reconnection, presence) | High | High | Socket.IO handles most hard parts. Redis adapter for multi-instance. Start single-instance, add complexity incrementally. |
| Solo developer bottleneck | High | Medium | Spec-driven approach = each step is self-contained. AI agents can execute independently. |
| Scope creep | Medium | Medium | Specs explicitly defer: OAuth, email verification, password reset, spectator mode, matchmaking, MCTS AI. |
| Performance under load | Low (Phase 1) | Medium | Phase 1 targets 500 users. Pure-function game engine is trivially fast. Scaling deferred to Phase 2 triggers. |
