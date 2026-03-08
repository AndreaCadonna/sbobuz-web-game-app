# Sbobuz — Agentic Engineering Workflow

## Execution Model

Follow `DEVELOPMENT_PLAN.md` phase by phase, step by step. Never skip ahead. Each step lists its output files — the step is done when those files exist, compile, and pass tests.

Before implementing any step, read its referenced spec in `docs/specs/` and the relevant sections of `SBOBUZ_ENGINE_SPEC.md` or `architecture-overview.md`. The full navigation map is in `docs/WORKFLOW_MAP.md`.

## Agent Routing

| Phase | Agent | Domain |
|-------|-------|--------|
| 0 | `devops-infra-engineer` | Repo bootstrap, tooling, Docker |
| 1 | `game-engine-engineer` | Pure game logic, shared types |
| 1 (design/decompose) | `game-engine-architect` | Spec refinement, task breakdown |
| 2 | `backend-platform-engineer` | Server infra, DB, Redis, logging |
| 3 | `backend-platform-engineer` | Auth, JWT, API gateway |
| 4 | `backend-platform-engineer` | Lobby module |
| 5 | `backend-platform-engineer` | Socket.IO, game sessions, leaderboard |
| 6 | `backend-platform-engineer` | AI opponent worker pool |
| 7 | `frontend-engineer` | Next.js, components, Zustand |
| 8 | `devops-infra-engineer` | CI/CD, K8s, observability |
| Cross-module QA | `integration-qa-engineer` | Integration tests, E2E, coverage |
| Architecture design | `infra-architect` | System design, ADRs (no code) |

**Rule:** Launch the agent for the task's phase. Use `integration-qa-engineer` after completing any module to validate boundaries. Use `game-engine-architect` when a step needs decomposition before implementation.

## Skill Activation

Agents auto-activate skills from `skills/` based on task context. Key mappings:

- **Phase 0:** `git-workflow`, `typescript-node-backend`, `docker-containerization`
- **Phase 1:** `event-sourcing`, `testing-strategy`
- **Phase 2:** `typescript-node-backend`, `postgresql-data-layer`, `redis-patterns`, `observability-monitoring`
- **Phase 3:** `auth-security`, `api-design`
- **Phase 4:** `redis-patterns`, `api-design`
- **Phase 5:** `websocket-realtime`, `redis-patterns`
- **Phase 6:** `typescript-node-backend`, `testing-strategy`
- **Phase 7:** `nextjs-frontend`
- **Phase 8:** `cicd-pipeline`, `kubernetes-deployment`, `docker-containerization`, `observability-monitoring`

Always: `spec-driven-architecture`, `git-workflow`, `testing-strategy`

## Task Decomposition

1. **Sequential by default** — Steps within a phase run in order (later steps depend on earlier ones)
2. **Parallel when independent** — Launch multiple agents concurrently only when steps have zero shared files
3. **Background for long-running** — Use `run_in_background: true` for test suites, linting, or build verification while continuing the next step
4. **Subagents for research** — Use `Explore` agent to find patterns or understand existing code before modifying it

## Context Window Hygiene

- Start `/clear` before each new phase
- One step = one agent invocation where possible; avoid accumulating unrelated context
- After completing a step, summarize what was built in a brief message, then move on
- Use agent memory (`/.claude/agent-memory/<agent>/`) — agents persist learnings across sessions
- For large steps, break into sub-steps and clear between them

## Git Flow

Use the `git-workflow` skill — it defines branching, commit conventions, and PR process. Summary:

- **Branch per phase:** `feature/phase-N-description` off `main`
- **Conventional commits:** `feat:`, `fix:`, `test:`, `chore:`, `docs:`
- **Commit after each passing step** — atomic, reviewable history
- **PR at phase completion** — squash-merge to `main`
- No force pushes. No `--no-verify`. Fix hooks, don't skip them.

## Dev Plan Updates

After completing each phase:

1. Update `DEVELOPMENT_PLAN.md` — mark completed steps with `[x]`, add actual file paths if they differ from planned
2. Update `MEMORY.md` — set `Current Progress` to reflect the new state
3. Commit these updates: `docs: update dev plan — Phase N complete`

## Locked Decisions (never override)

- Pino logger only (`no-console: error`)
- Typed query builder, no ORM
- HS256 JWT, bcrypt cost 12
- Socket.IO + Redis adapter
- Kustomize (not Helm), rolling updates
- 30s disconnect grace, full state sync on reconnect
- Event-sourced game engine, server-authoritative
