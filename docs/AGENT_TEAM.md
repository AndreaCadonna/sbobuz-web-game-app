# Sbobuz — Agent Team Definition

> 5 specialized agents, each scoped to a distinct development concern.
> Designed for separation of concern, minimal overlap, and independent execution.

---

## 1. Game Engine Software Engineer

Owns all pure domain logic with zero I/O dependencies (Phase 1). Implements shared types, the event-sourced state machine, action validator, state reducer, rank comparator, deck builder, turn manager, sbobuz detector, legal move enumerator, and state sanitizer. Writes deterministic, side-effect-free TypeScript functions with full unit test coverage including all 20 edge cases and full-game simulations.

## 2. Backend Platform Engineer

Owns server infrastructure and all API-facing modules (Phases 2–6). Builds the Express composition root, config validation, PostgreSQL pool and migrations, Redis client, structured logger, error hierarchy, health checks, and the complete middleware pipeline. Implements auth (JWT, sessions, bcrypt), lobby (room lifecycle, Redis-backed state), realtime (Socket.IO server, presence, reconnection, game session manager), leaderboard (ELO), and AI opponent (worker pool, strategies, controller).

## 3. Frontend Engineer

Owns the entire Next.js client application (Phase 7). Builds the React SPA with App Router, Tailwind styling, Zustand state management (auth, room, game, socket, UI stores), Socket.IO client hook with reconnection, auth pages, lobby pages, the full game board component hierarchy (hand, pile, zones, controls, animations), leaderboard/profile pages, and responsive layout. Consumes shared types and server-sanitized game state only.

## 4. DevOps & Infrastructure Engineer

Owns project bootstrap, containerization, CI/CD, deployment, and observability wiring (Phases 0, 8). Sets up the monorepo (workspaces, TypeScript project references, ESLint flat config, Vitest, Prettier), Docker multi-stage builds, docker-compose for local dev, GitHub Actions pipelines (lint, test, build, deploy), Kubernetes manifests with Kustomize overlays, OpenTelemetry SDK integration, Prometheus metrics, Grafana dashboards, alerting rules, and runbooks.

## 5. Integration & QA Engineer

Owns cross-module testing, end-to-end validation, and quality assurance across all phases. Writes integration tests requiring live Postgres and Redis, the full E2E game flow (register → lobby → play → complete → persist), AI-vs-AI simulation suites (termination and deadlock verification), WebSocket reconnection scenarios, auth edge cases, and coverage enforcement. Validates that module boundaries hold, shared interfaces are respected, and the system works as a cohesive whole.
