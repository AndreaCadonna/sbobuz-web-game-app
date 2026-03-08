# Infra Architect Memory -- Sbobuz Project

## Project Overview
- **Type:** Real-time card game platform (Sbobuz)
- **Architecture:** Modular monolith, Node.js + TypeScript, event-sourced game engine
- **Stack:** Next.js frontend, Express backend, Socket.IO, PostgreSQL, Redis, OpenTelemetry
- **Developer:** Solo developer, enterprise-grade engineering standards

## Key Architecture Documents
- `architecture-overview.md` -- system architecture, module boundaries, ADRs
- `SBOBUZ_ENGINE_SPEC.md` -- complete game engine specification (v1.2, implementation-ready)
- `skills/spec-driven-architecture/SKILL.md` -- spec template and methodology
- `docs/specs/data-layer.md` -- PostgreSQL schema, Redis keys, storage split
- `docs/specs/observability-stack.md` -- OTel, Prometheus, Jaeger, Loki, Grafana
- `docs/specs/infrastructure-deployment.md` -- Docker, CI/CD, K8s, scaling phases
- `docs/specs/api-gateway.md` -- routing, auth, rate limiting, middleware pipeline

## Key Design Decisions
- Monolith-first (ADR-001), extract services at Phase 3 (5000+ users)
- Hot path (Redis) vs warm path (PostgreSQL) storage split
- Event-sourced game state, persisted to PG only on game completion
- JWT access tokens (15min) + httpOnly refresh cookies (7 days)
- OTel SDK as single instrumentation API, vendor-neutral
- Typed query builder (Kysely/Drizzle), no full ORM
- Pino for structured logging, console.log banned via ESLint

## Scaling Phases
- Phase 1: Single instance, 0-500 users
- Phase 2: Horizontal scaling, 500-5000 users, Redis pub/sub backplane
- Phase 3: Service extraction, 5000+ users

## Spec Format Preferences
- Follows spec-driven-architecture skill format
- TypeScript interfaces for data models
- Mermaid diagrams for visual architecture
- Tables for decision records and edge cases
- Pseudocode steps for processing logic (numbered, branching)
- Status field: Draft/Review/Approved/Implementation-Ready
