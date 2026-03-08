# Workflow Map — Repository Navigation Guide

Quick-reference for finding the right doc, spec, agent, or skill for any task.

---

## Repository Structure

```
sbobuz-web-game-app/
├── CLAUDE.md                          # ← START HERE — workflow instructions
├── DEVELOPMENT_PLAN.md                # Master execution plan (8 phases, ~80 steps)
├── SBOBUZ_ENGINE_SPEC.md              # Game rules & types (v1.2)
├── architecture-overview.md           # System architecture & 10 ADRs
│
├── docs/
│   ├── WORKFLOW_MAP.md                # ← THIS FILE
│   └── specs/                         # Module specifications
│       ├── engine/                    # 11 game engine component specs
│       │   ├── README.md              # Component index & dependency graph
│       │   ├── state-reducer.md       # Core state machine
│       │   ├── state-factory.md       # Initial game state
│       │   ├── action-validator.md    # Action validation rules
│       │   ├── rank-comparator.md     # Card rank hierarchy
│       │   ├── rng-module.md          # Seeded PRNG
│       │   ├── sbobuz-detector.md     # Four-of-a-kind detection
│       │   ├── turn-manager.md        # Turn order
│       │   ├── active-zone-resolver.md # Play zone determination
│       │   ├── win-condition-evaluator.md # Win detection
│       │   ├── game-clock.md          # Turn timers
│       │   └── action-logger.md       # Post-game logging
│       │
│       ├── auth-module.md             # JWT, registration, sessions
│       ├── api-gateway.md             # REST routes, middleware
│       ├── lobby-module.md            # Room lifecycle, matchmaking
│       ├── realtime-module.md         # Socket.IO, presence, reconnection
│       ├── data-layer.md              # PostgreSQL schema, Redis keys
│       ├── ai-opponent-module.md      # AI strategies, worker threads
│       ├── frontend-client.md         # Next.js SPA architecture
│       ├── observability-stack.md     # OTel, Prometheus, Grafana
│       └── infrastructure-deployment.md # Docker, K8s, CI/CD
│
├── .claude/
│   ├── agents/                        # 7 agent role definitions
│   │   ├── backend-platform-engineer.md
│   │   ├── devops-infra-engineer.md
│   │   ├── frontend-engineer.md
│   │   ├── game-engine-architect.md
│   │   ├── game-engine-engineer.md
│   │   ├── infra-architect.md
│   │   └── integration-qa-engineer.md
│   └── agent-memory/                  # Persistent agent memory (per-role)
│
└── skills/                            # 15 domain skill modules
    ├── api-design/
    ├── auth-security/
    ├── cicd-pipeline/
    ├── docker-containerization/
    ├── event-sourcing/
    ├── git-workflow/
    ├── kubernetes-deployment/
    ├── nextjs-frontend/
    ├── observability-monitoring/
    ├── postgresql-data-layer/
    ├── redis-patterns/
    ├── spec-driven-architecture/
    ├── testing-strategy/
    ├── typescript-node-backend/
    └── websocket-realtime/
```

---

## How to Find What You Need

### "I'm about to implement step X.Y"

1. Open `DEVELOPMENT_PLAN.md`, find step X.Y
2. Read the step's description — it names the output files and references specs
3. Read the referenced spec in `docs/specs/`
4. For engine components, also check `docs/specs/engine/README.md` for the dependency graph
5. For types, check `SBOBUZ_ENGINE_SPEC.md` (sections 2–20)
6. For architectural context, check `architecture-overview.md`

### "Which agent handles this?"

| Task Type | Agent |
|-----------|-------|
| Game engine logic, shared types, pure functions | `game-engine-engineer` |
| Decompose a complex feature into specs | `game-engine-architect` |
| Express, DB, Redis, auth, lobby, realtime, AI | `backend-platform-engineer` |
| Next.js, React, Tailwind, Zustand, client Socket.IO | `frontend-engineer` |
| Repo setup, Docker, CI/CD, K8s, observability infra | `devops-infra-engineer` |
| High-level architecture design, ADRs | `infra-architect` |
| Cross-module integration tests, E2E, coverage | `integration-qa-engineer` |

### "Which skill applies?"

| Skill | When to Use |
|-------|-------------|
| `spec-driven-architecture` | Always — read spec before code |
| `git-workflow` | Every commit, branch, PR |
| `testing-strategy` | Every module — test patterns, coverage |
| `event-sourcing` | Game engine state (Phase 1) |
| `typescript-node-backend` | Express, config, error handling (Phases 2–6) |
| `postgresql-data-layer` | Schema, migrations, queries (Phase 2+) |
| `redis-patterns` | Cache, pub/sub, sessions (Phases 2–5) |
| `auth-security` | JWT, validation, CORS (Phase 3) |
| `api-design` | REST endpoints (Phases 3–4) |
| `websocket-realtime` | Socket.IO setup (Phase 5) |
| `nextjs-frontend` | React/Next.js components (Phase 7) |
| `docker-containerization` | Dockerfiles, Compose (Phases 0, 8) |
| `cicd-pipeline` | GitHub Actions (Phase 8) |
| `kubernetes-deployment` | K8s manifests, Kustomize (Phase 8) |
| `observability-monitoring` | OTel, metrics, dashboards (Phase 8) |

---

## Spec Cross-Reference Chain

When implementing any step, follow this lookup chain:

```
DEVELOPMENT_PLAN.md (step X.Y)
  → identifies output files + references a spec
    → docs/specs/<module>.md (detailed design, interfaces, edge cases)
      → SBOBUZ_ENGINE_SPEC.md (canonical type definitions, game rules)
      → architecture-overview.md (module boundaries, ADRs, data flow)
        → skills/<skill>/SKILL.md (implementation patterns, anti-patterns)
```

### Engine Component Dependency Order

From `docs/specs/engine/README.md`:

```
Level 0 (no deps):     rng-module, rank-comparator
Level 1 (Level 0):     state-factory, action-validator, sbobuz-detector,
                        active-zone-resolver, turn-manager
Level 2 (Level 1):     state-reducer, win-condition-evaluator
Level 3 (Level 2):     game-clock, action-logger
```

Implement bottom-up. Level 0 components can be built in parallel.

---

## Phase Completion Checklist

After completing every phase:

- [ ] All step output files exist and compile (`tsc --noEmit`)
- [ ] All tests pass (`npm test`)
- [ ] Coverage meets threshold (engine: 100%, modules: 80%+)
- [ ] `integration-qa-engineer` validates cross-module boundaries
- [ ] Update `DEVELOPMENT_PLAN.md` — mark steps `[x]`
- [ ] Update `MEMORY.md` — current progress
- [ ] Commit: `docs: update dev plan — Phase N complete`
- [ ] PR to `main` with phase summary

---

## Parallel Work Opportunities

Steps that can safely run concurrently (no shared output files):

| Phase | Parallel Groups |
|-------|----------------|
| 0 | Steps 0.1–0.4 (config files) then 0.5–0.8 (tooling) |
| 1 | Level 0 engine components (rng + rank-comparator) |
| 1 | Level 1 components (after Level 0 done) |
| 2 | Config + Logger (independent of DB + Redis setup) |
| 7 | Auth pages + Lobby pages (after stores are done) |
| 8 | CI/CD pipeline + K8s manifests (independent) |

---

## Agent Memory Locations

Each agent persists learnings at `.claude/agent-memory/<agent-name>/`:

| Agent | Memory Path |
|-------|-------------|
| `game-engine-architect` | `.claude/agent-memory/game-engine-architect/MEMORY.md` |
| `game-engine-engineer` | `.claude/agent-memory/game-engine-engineer/MEMORY.md` |
| `backend-platform-engineer` | `.claude/agent-memory/backend-platform-engineer/MEMORY.md` |
| `frontend-engineer` | `.claude/agent-memory/frontend-engineer/MEMORY.md` |
| `devops-infra-engineer` | `.claude/agent-memory/devops-infra-engineer/MEMORY.md` |
| `infra-architect` | `.claude/agent-memory/infra-architect/MEMORY.md` |
| `integration-qa-engineer` | `.claude/agent-memory/integration-qa-engineer/MEMORY.md` |
