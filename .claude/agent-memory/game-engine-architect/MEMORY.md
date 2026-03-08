# Game Engine Architect — Agent Memory

## Project: Sbobuz Web Game App

### Spec Conventions
- All specs live in `docs/specs/`. Engine component specs in `docs/specs/engine/`.
- Spec template defined in `skills/spec-driven-architecture/SKILL.md`.
- Status must be "Implementation-Ready" — no TBDs, no open questions.
- Use TypeScript for type definitions, pseudocode for logic.
- Reference parent spec (`SBOBUZ_ENGINE_SPEC.md`) for shared types — never duplicate Card, GameState, PlayerState.
- Existing module specs (realtime, data-layer, lobby, auth, etc.) use "Draft" status.

### Engine Architecture
- 11 components: 9 pure functions + Game Clock (impure) + Action Logger (side-effecting).
- Parent spec: `SBOBUZ_ENGINE_SPEC.md` (770 lines, v1.2, Implementation-Ready).
- Shared types defined in parent spec Sections 8-9: Card, GameState, PlayerState, GameAction, GamePhase, GameConfig.
- See `docs/specs/engine/README.md` for dependency graph, data flow, implementation order.

### Key Design Decisions
- Event-sourced: every action produces new immutable state. `(state, action) => newState`.
- Sbobuz always overrides individual card effects (highest priority in resolution).
- Active zone is always recomputed (derived), never stored.
- Draw pile: index 0 = top. Play pile: last element = top.
- RNG: Mulberry32, immutable state, only used during State Factory.
- Turn timer: configurable per room, from GameConfig.
- Disconnect: game cancelled (not forfeited) on grace period expiry.

### Component Dependency Levels
- Level 0 (no deps): RNG, Rank Comparator, Turn Manager, Sbobuz Detector, Active Zone Resolver
- Level 1: Win Condition Evaluator, State Factory
- Level 2: Action Validator, State Reducer (heart of engine)
- Level 3: Game Clock, Action Logger

### Integration Boundaries
- Engine has NO knowledge of WebSockets, HTTP, databases, or I/O.
- Realtime Module calls engine via: processAction, getCurrentState, sanitizeStateForPlayer.
- Lobby Module triggers game creation via State Factory.
- Action Logger flushes to PostgreSQL on game end (data-layer.md schema).
- Game Clock persists timers to Redis for crash recovery.

### Detailed Notes
- See [engine-patterns.md](./engine-patterns.md) for reducer patterns and flag handling.
