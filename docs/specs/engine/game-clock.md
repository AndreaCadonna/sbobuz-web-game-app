# Game Clock — Turn Timers, Disconnect Grace, and Auto-Forfeit

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Sections 16, 20

---

## 1. Overview

The Game Clock is the only impure component in the Sbobuz game engine. It manages real-time concerns: turn timers (configurable per room), disconnect grace periods, and auto-forfeit. When a timer expires, the Game Clock generates synthetic game actions (`TIMEOUT_FORFEIT` or `CANCEL_GAME`) and feeds them into the engine pipeline (Action Validator + State Reducer), exactly as if a player had submitted them.

The Game Clock does NOT compute game logic. It does not know what happens when a player times out — that is the State Reducer's job. The Game Clock only knows when to fire and what action to generate. This keeps the impurity (time-dependency) isolated to a single component.

The Game Clock interacts with two external systems: the system clock (for timer scheduling) and Redis (for persisting timer state across server restarts). It receives state updates from the State Reducer to know when to start, reset, or cancel timers.

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * Represents an active turn timer for a game.
 */
interface TurnTimer {
  /** The game this timer belongs to. */
  gameId: string;

  /** The player whose turn is being timed. */
  playerId: string;

  /** When the timer expires (ISO 8601). */
  expiresAt: string;

  /** Duration in seconds (from GameConfig). */
  durationSeconds: number;

  /**
   * The game phase when this timer was started.
   * Used to determine the correct TIMEOUT_FORFEIT behavior.
   */
  phase: GamePhase;
}

/**
 * Callback interface for the Game Clock to notify the engine
 * when a timer expires. The orchestration layer registers this.
 */
interface ClockCallbacks {
  /** Called when a turn timer expires. */
  onTurnTimeout: (gameId: string, playerId: string) => void;

  /** Called when a disconnect grace period expires. */
  onDisconnectTimeout: (gameId: string, playerId: string) => void;
}

/**
 * Configuration for the Game Clock, derived from GameConfig.
 */
interface ClockConfig {
  /** Turn timer duration in seconds. From GameConfig.turnTimerSeconds. */
  turnTimerSeconds: number;

  /**
   * Grace period for disconnected players in seconds.
   * From GameConfig.disconnectGraceSeconds.
   */
  disconnectGraceSeconds: number;
}
```

### 2.2 Types Referenced from Parent Spec

- `GameConfig` — source of timer configuration
- `GameState` — game phase and current player
- `TimeoutForfeitAction` — the synthetic action generated on turn timeout
- `CancelGameAction` — the synthetic action generated on disconnect timeout
- `GamePhase` — determines timer behavior

---

## 3. Public Interface

```typescript
/**
 * Creates a Game Clock instance for a specific game.
 *
 * @param gameId - The game identifier.
 * @param config - Timer configuration from room settings.
 * @param callbacks - Functions to call when timers expire.
 * @returns A GameClock instance with methods to manage timers.
 */
function createGameClock(
  gameId: string,
  config: ClockConfig,
  callbacks: ClockCallbacks
): GameClock;

interface GameClock {
  /**
   * Starts a turn timer for the given player.
   * If a timer is already running for this game, it is cancelled first.
   *
   * @param playerId - The player whose turn is starting.
   * @param phase - The current game phase (affects timeout behavior).
   */
  startTurnTimer(playerId: string, phase: GamePhase): void;

  /**
   * Cancels the current turn timer, if any.
   * Called when a player acts before the timer expires.
   */
  cancelTurnTimer(): void;

  /**
   * Resets the turn timer for the same player (e.g., after King/Sbobuz
   * grants another play). Equivalent to cancel + start with same player.
   *
   * @param phase - The new game phase for the reset timer.
   */
  resetTurnTimer(phase: GamePhase): void;

  /**
   * Returns the remaining time on the current turn timer in milliseconds.
   * Returns 0 if no timer is active.
   */
  getRemainingTime(): number;

  /**
   * Destroys the Game Clock, cancelling all active timers.
   * Called when the game ends (finished or cancelled).
   */
  destroy(): void;
}
```

---

## 4. Behavior Rules

### 4.1 Turn Timer Lifecycle

```
GAME STARTS (State Factory produces initial state)
    → startTurnTimer(firstPlayerId, 'playing')

PLAYER ACTS (action received and processed)
    → cancelTurnTimer()
    → After state reduction:
        IF newState.phase === 'finished' or 'cancelled':
            destroy()
        ELSE IF same player plays again (King, Sbobuz):
            resetTurnTimer(newState.phase)
        ELSE IF phase === 'awaiting_queen_declaration':
            startTurnTimer(queenPlayerId, 'awaiting_queen_declaration')
        ELSE:
            startTurnTimer(newCurrentPlayerId, newState.phase)

TIMER EXPIRES
    → callbacks.onTurnTimeout(gameId, playerId)
    → Orchestration layer creates TimeoutForfeitAction:
        { type: 'TIMEOUT_FORFEIT', playerId }
    → Feeds it through Action Validator → State Reducer
    → New state comes back → start timer for next player

GAME ENDS
    → destroy() — cancel all timers
```

### 4.2 Disconnect Grace Period

The disconnect grace period is managed by the Realtime Module, NOT the Game Clock. The Realtime Module uses Redis key TTL expiration for this purpose (see `realtime-module.md` Section 5.5).

However, the Game Clock interacts with disconnection in one way: **when a player disconnects, their turn timer continues running.** The game does not pause. If the turn timer expires before the player reconnects, the TIMEOUT_FORFEIT fires normally.

If the Realtime Module's disconnect grace period expires (30 seconds), it generates a `CANCEL_GAME` action:
```typescript
{ type: 'CANCEL_GAME', reason: 'disconnect_timeout', disconnectedPlayerId: userId }
```

This action flows through the standard pipeline. The Game Clock does not generate CANCEL_GAME — it only generates TIMEOUT_FORFEIT.

### 4.3 Timer Precision

- Timers use `setTimeout` for scheduling.
- Timer resolution is not guaranteed to be precise (JavaScript event loop). A timer set for 30 seconds may fire at 30.001 seconds. This is acceptable.
- The `expiresAt` timestamp is the authoritative deadline. If a player acts at 29.999 seconds and the action arrives before the timeout fires, the action is valid and the timer is cancelled.
- Race condition handling: if a timer fires AND a player action arrives simultaneously, the first one to acquire the game state lock wins. If the player action wins, the timer callback becomes a no-op (the timer was already cancelled). If the timer wins, the player action is rejected because it is no longer their turn.

### 4.4 Redis Persistence

Timer state is persisted to Redis for crash recovery:

```
Key: game:{gameId}:turn_timer
Value: JSON { playerId, expiresAt, gameId }
TTL: turnTimerSeconds + 5 seconds (buffer)
```

On server restart:
1. Scan for `game:*:turn_timer` keys.
2. For each key, calculate remaining time from `expiresAt`.
3. If expired, immediately fire TIMEOUT_FORFEIT.
4. If not expired, schedule a new `setTimeout` for the remaining duration.

---

## 5. Edge Cases & Test Scenarios

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Player acts before timer expires | Timer cancelled. Action processed normally. New timer started for next player. |
| 2 | Timer expires — player on 'playing' phase with non-empty pile | TIMEOUT_FORFEIT generated. Reducer auto-picks up pile. Turn advances. New timer for next player. |
| 3 | Timer expires — player on 'playing' phase with empty pile | TIMEOUT_FORFEIT generated. Reducer skips turn. Turn advances. New timer for next player. |
| 4 | Timer expires — player on 'awaiting_queen_declaration' | TIMEOUT_FORFEIT generated. Reducer auto-declares 'higher'. Turn advances. |
| 5 | Timer expires — player on 'awaiting_post_clear_play' | TIMEOUT_FORFEIT generated. Reducer skips (no forced play). Turn advances. |
| 6 | King played — same player plays again | Timer reset for same player with same duration. Phase is 'awaiting_post_clear_play'. |
| 7 | Sbobuz triggered — same player plays again | Timer reset for same player. Phase is 'awaiting_post_clear_play'. |
| 8 | Game ends (player wins) | All timers cancelled via destroy(). |
| 9 | Game cancelled (disconnect timeout) | All timers cancelled via destroy(). |
| 10 | Server crash mid-turn | On restart, timer restored from Redis. Remaining time calculated. If already expired, TIMEOUT_FORFEIT fires immediately. |
| 11 | Player disconnects, turn timer still running | Timer continues. If timer expires before reconnection, TIMEOUT_FORFEIT fires. |
| 12 | Turn timer set to very short (5 seconds) | Works normally. Faster timeout. |
| 13 | Turn timer set to long (120 seconds) | Works normally. Slower timeout. |
| 14 | Race: action and timeout arrive simultaneously | First to process wins. Loser is a no-op. |
| 15 | Multiple startTurnTimer calls without cancel | Each call cancels the previous timer first. Only one timer active at a time per game. |

---

## 6. Integration Points

### 6.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| Orchestration layer | `startTurnTimer(playerId, phase)` | After each state reduction, when turn changes |
| Orchestration layer | `cancelTurnTimer()` | When a player's action is received |
| Orchestration layer | `destroy()` | When game ends |

### 6.2 Outbound

| Target | Interface | Data |
|--------|-----------|------|
| Orchestration layer (via callbacks) | `onTurnTimeout(gameId, playerId)` | Timer expired, generate TIMEOUT_FORFEIT |
| Redis | `SET game:{gameId}:turn_timer` | Persist timer for crash recovery |
| Redis | `DEL game:{gameId}:turn_timer` | Clean up timer on cancel/destroy |

### 6.3 Side Effects

| Side Effect | Trigger | Description |
|-------------|---------|-------------|
| `setTimeout` scheduling | `startTurnTimer` | Schedules a callback for the future |
| `clearTimeout` | `cancelTurnTimer`, `destroy` | Cancels a scheduled callback |
| Redis write | `startTurnTimer` | Persists timer state for recovery |
| Redis delete | `cancelTurnTimer`, `destroy` | Removes timer key |

---

## 7. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Should the Game Clock be a singleton or per-game? | Per-game instance. Each game has its own Game Clock. | Isolation. One game's timer issues do not affect another. Cleanup is straightforward — destroy the clock when the game ends. |
| 2 | Should the Game Clock directly modify GameState? | No. It generates synthetic actions that flow through the standard pipeline (validator → reducer). | Keeps the reducer as the single state transition authority. The clock is just an action source. |
| 3 | Should disconnect grace be managed by the Game Clock? | No. The Realtime Module manages disconnect grace via Redis TTL. | Separation of concerns. The Realtime Module owns connection presence. The Game Clock owns turn timing. They interact indirectly: the Realtime Module generates CANCEL_GAME; the Game Clock generates TIMEOUT_FORFEIT. |
| 4 | What happens if the server restarts and Redis has an expired timer? | TIMEOUT_FORFEIT is fired immediately on startup recovery. | The player exceeded their time limit. The game continues from the last consistent state. |
| 5 | Is the turn timer configurable per room? | Yes. The duration comes from `GameConfig.turnTimerSeconds`, which is set by the room host during room creation. | Parent spec Section 20, Decision #3: "Configurable per room." |

---

## 8. Implications for Architecture

1. **The Game Clock is the only source of time-dependent behavior in the engine.** This isolation means the entire engine (minus the clock) can be tested without real-time concerns. The clock can be replaced with a mock for testing.

2. **The orchestration layer is the glue.** It sits between the Game Clock and the engine pipeline. When a timer fires, the orchestration layer creates the synthetic action, feeds it through validation and reduction, receives the new state, and tells the clock to start the next timer. This flow is: Clock → Orchestration → Validator → Reducer → Orchestration → Clock.

3. **Redis timer persistence is a best-effort recovery mechanism.** If Redis loses the timer key, the game enters a state where no timer is running. The orchestration layer should detect this (e.g., no timer key exists but the game is active) and restart the timer from the current state.

4. **The Game Clock does not need to know about game rules.** It does not know what a King does or what a Sbobuz is. It only knows: "start timer," "cancel timer," "timer expired." The orchestration layer tells it when to start and cancel based on the reducer's output.
