# Sbobuz Game Engine — Component Index

> **Document Type:** Architecture Index
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md)

---

## 1. Overview

The Sbobuz Game Engine is a pure, deterministic, event-sourced logic module that implements the Sbobuz card game. It is decomposed into 11 components, each with a single responsibility. All shared types (Card, GameState, PlayerState, GameAction, GamePhase, GameConfig) are defined in the parent engine spec and referenced by component specs — never duplicated.

This document serves as the index and map for all engine component specs.

---

## 2. Component Quick Reference

| # | Component | Spec File | Pure? | Responsibility |
|---|-----------|-----------|-------|----------------|
| 1 | RNG Module | [rng-module.md](./rng-module.md) | Yes | Seeded PRNG for deterministic shuffle and starting player |
| 2 | Rank Comparator | [rank-comparator.md](./rank-comparator.md) | Yes | Compares card ranks given direction context |
| 3 | Turn Manager | [turn-manager.md](./turn-manager.md) | Yes | Computes next player index with wraparound |
| 4 | Sbobuz Detector | [sbobuz-detector.md](./sbobuz-detector.md) | Yes | Checks if top 4 pile cards share a rank |
| 5 | Active Zone Resolver | [active-zone-resolver.md](./active-zone-resolver.md) | Yes | Determines which zone a player plays from |
| 6 | Win Condition Evaluator | [win-condition-evaluator.md](./win-condition-evaluator.md) | Yes | Checks if a player has emptied all zones |
| 7 | State Factory | [state-factory.md](./state-factory.md) | Yes | Creates initial game state (deck, shuffle, deal, starting player) |
| 8 | Action Validator | [action-validator.md](./action-validator.md) | Yes | Validates actions against current state |
| 9 | State Reducer | [state-reducer.md](./state-reducer.md) | Yes | Applies validated actions to state (heart of the engine) |
| 10 | Game Clock | [game-clock.md](./game-clock.md) | **No** | Turn timers, disconnect grace, auto-forfeit |
| 11 | Action Logger | [action-logger.md](./action-logger.md) | **No** | Appends (action, resultingState) to ordered game log |

---

## 3. Component Dependency Graph

```
                    ┌─────────────┐
                    │ Game Clock   │ (impure — time-dependent)
                    │ generates    │
                    │ TIMEOUT_     │
                    │ FORFEIT      │
                    └──────┬───────┘
                           │ feeds synthetic actions into
                           ▼
┌──────────────┐    ┌─────────────────────────────────────────────┐
│ Realtime     │───>│              STATE REDUCER                  │
│ Module       │    │  (orchestrates all pure components below)   │
│ (upstream)   │    └──┬────┬────┬────┬────┬──────────────────────┘
└──────────────┘       │    │    │    │    │
                       │    │    │    │    │
          ┌────────────┘    │    │    │    └──────────────┐
          ▼                 ▼    │    ▼                   ▼
  ┌──────────────┐ ┌────────┐   │  ┌──────────────┐ ┌──────────┐
  │   Sbobuz     │ │  Rank  │   │  │  Active Zone │ │   Win    │
  │   Detector   │ │Compara-│   │  │  Resolver    │ │Condition │
  │              │ │  tor   │   │  │              │ │Evaluator │
  └──────────────┘ └────────┘   │  └──────────────┘ └──────────┘
                                │
                           ┌────┘
                           ▼
                    ┌─────────────┐
                    │    Turn     │
                    │   Manager   │
                    └─────────────┘

┌──────────────┐    ┌─────────────────────────────────────────────┐
│ Realtime     │───>│           ACTION VALIDATOR                  │
│ Module       │    │  (gates actions before they reach reducer)  │
│ (upstream)   │    └──┬─────────┬───────────────────────────────-┘
└──────────────┘       │         │
                       ▼         ▼
               ┌────────┐ ┌──────────────┐
               │  Rank  │ │  Active Zone │
               │Compara-│ │  Resolver    │
               │  tor   │ │              │
               └────────┘ └──────────────┘

┌──────────────┐
│ Lobby Module │───> STATE FACTORY ───> RNG Module
│ (upstream)   │
└──────────────┘

                    STATE REDUCER ───> ACTION LOGGER (side-effecting)
```

---

## 4. Data Flow

```
Player Action (from Realtime Module)
    │
    ▼
ACTION VALIDATOR ─── validates against current GameState
    │                 uses: Rank Comparator, Active Zone Resolver
    │
    ├── REJECTED ──> error sent back to Realtime Module
    │
    └── VALID ──────────────┐
                            ▼
                    STATE REDUCER ─── (state, validatedAction) => newState
                            │         uses: Sbobuz Detector, Rank Comparator,
                            │               Turn Manager, Active Zone Resolver,
                            │               Win Condition Evaluator
                            │
                            ▼
                    ACTION LOGGER ─── appends (action, newState) to log
                            │
                            ▼
                    Realtime Module ─── broadcasts sanitized state to players
```

**Game initialization flow:**

```
Lobby Module ──> "start game" signal with player list + config
    │
    ▼
STATE FACTORY ──> creates GameState₀
    │              uses: RNG Module (shuffle, starting player)
    │
    ▼
GAME CLOCK ──> starts turn timer for first player
    │
    ▼
ACTION LOGGER ──> logs initial state (index 0)
    │
    ▼
Realtime Module ──> broadcasts initial sanitized state
```

---

## 5. Purity Classification

### Pure Functions (9 components)

These components have zero side effects. Same inputs always produce the same outputs. They are trivially testable and fully deterministic.

| Component | Input | Output |
|-----------|-------|--------|
| RNG Module | seed (number) | SeededRNG instance with deterministic sequence |
| Rank Comparator | two ranks + direction | comparison result (boolean) |
| Turn Manager | current index + direction + player count | next index |
| Sbobuz Detector | play pile (Card[]) | boolean |
| Active Zone Resolver | PlayerState + draw pile empty flag | ActiveZone |
| Win Condition Evaluator | PlayerState + draw pile empty flag | boolean |
| State Factory | player IDs + seed + config | GameState |
| Action Validator | GameState + GameAction | ValidationResult |
| State Reducer | GameState + validated GameAction | GameState |

### Impure Components (2 components)

| Component | Why Impure | Side Effect |
|-----------|-----------|-------------|
| Game Clock | Reads system clock, manages timers | Generates synthetic TIMEOUT_FORFEIT and CANCEL_GAME actions |
| Action Logger | Writes to external storage | Appends to Redis list, flushes to PostgreSQL on game end |

---

## 6. Implementation Order

Components are ordered by dependency. A component at level N depends only on components at level N-1 or lower.

### Level 0 — No Engine Dependencies (implement first, in parallel)

1. **RNG Module** — standalone PRNG
2. **Rank Comparator** — standalone comparison logic
3. **Turn Manager** — standalone index arithmetic
4. **Sbobuz Detector** — standalone pile check
5. **Active Zone Resolver** — standalone zone computation

### Level 1 — Depends on Level 0

6. **Win Condition Evaluator** — uses Active Zone Resolver concept (checks all zones empty)
7. **State Factory** — uses RNG Module

### Level 2 — Depends on Level 0 + Level 1

8. **Action Validator** — uses Rank Comparator, Active Zone Resolver
9. **State Reducer** — uses Sbobuz Detector, Rank Comparator, Turn Manager, Active Zone Resolver, Win Condition Evaluator

### Level 3 — Depends on Level 2

10. **Action Logger** — consumes output of State Reducer
11. **Game Clock** — feeds synthetic actions into Action Validator + State Reducer

### Integration Checkpoints

- **After Level 0:** Unit test all 5 leaf components independently.
- **After Level 1:** Test State Factory produces valid initial states. Test Win Condition Evaluator with crafted PlayerState objects.
- **After Level 2:** Integration test: create a game, validate an action, reduce it. Verify the full pipeline. Run all 20 edge case scenarios from the parent spec.
- **After Level 3:** Full system test with timers and logging. Simulate a complete game with clock-driven timeouts.

---

## 7. Shared Types Reference

All components reference the following types defined in [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md):

- `Card`, `StandardCard`, `JokerCard` — Section 8 (Card Model)
- `Suit`, `Rank` — Section 8
- `GameState`, `PlayerState` — Section 8
- `GamePhase` — Section 8 / Section 20
- `GameConfig` — Section 8 / Section 20
- `GameAction` and all action subtypes — Section 9
- `ActiveZone` — Section 5.3 (derived type: `'hand' | 'faceUp' | 'faceDown' | 'finished'`)

Components define only the types they OWN. They import shared types by reference.
