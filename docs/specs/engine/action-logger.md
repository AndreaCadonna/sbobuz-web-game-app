# Action Logger — Event-Sourced Game Log

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Section 15

---

## 1. Overview

The Action Logger maintains the ordered, append-only log of all actions and their resulting states for each game. It is the persistence layer of the event-sourced architecture: every `(action, resultingState)` pair is recorded, enabling replay, debugging, spectator mode (future), disconnect recovery, and post-game analysis.

During an active game, the log is buffered in Redis as a list of serialized entries. When the game ends, the buffer is flushed to PostgreSQL for durable storage. The Action Logger never computes game logic — it records the output of the State Reducer.

This is a side-effecting component. It writes to external storage (Redis during the game, PostgreSQL after the game).

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * A single entry in the action log.
 * Each entry captures an action and the state that resulted from applying it.
 */
interface ActionLogEntry {
  /** Monotonic sequence number within the game, starting at 0. */
  index: number;

  /** The action that was applied. */
  action: GameAction;

  /** The full game state AFTER the action was applied. */
  resultingState: GameState;

  /**
   * Events emitted by the reducer during this action's processing.
   * Stored for replay animation and debugging.
   */
  events: GameEvent[];

  /**
   * Wall-clock timestamp of when the action was processed.
   * ISO 8601 format. NOT used for game logic — purely for debugging
   * and human-readable log inspection.
   */
  timestamp: string;
}

/**
 * The complete action log for a game.
 * Conceptually, this is an append-only list.
 */
interface ActionLog {
  /** The game this log belongs to. */
  gameId: string;

  /** The initial state (State₀) before any actions. */
  initialState: GameState;

  /** Ordered list of action entries. */
  entries: ActionLogEntry[];
}

/**
 * Configuration for snapshot frequency during PostgreSQL persistence.
 */
interface LoggerConfig {
  /**
   * How often to store a full state snapshot in the game_actions table.
   * Every Nth action gets a non-null resulting_state_snapshot.
   * Other actions store null (state reconstructable by replaying from last snapshot).
   */
  snapshotInterval: number;  // default: 50
}
```

### 2.2 Types Referenced from Parent Spec

- `GameState` — the state being logged
- `GameAction` — the action being logged
- `GameEvent` — from State Reducer's ReducerResult

### 2.3 Types Referenced from Data Layer Spec

- `GamesRow` — PostgreSQL table for game metadata
- `GameActionsRow` — PostgreSQL table for individual actions

---

## 3. Public Interface

```typescript
/**
 * Creates an Action Logger instance for a specific game.
 *
 * @param gameId - The game identifier.
 * @param initialState - The initial state (State₀) from the State Factory.
 * @param config - Logger configuration (snapshot interval).
 * @returns An ActionLogger instance.
 */
function createActionLogger(
  gameId: string,
  initialState: GameState,
  config?: LoggerConfig
): ActionLogger;

interface ActionLogger {
  /**
   * Appends an action and its resulting state to the log.
   * Called after the State Reducer produces a new state.
   *
   * @param action - The action that was applied.
   * @param resultingState - The state after the action was applied.
   * @param events - Events emitted by the reducer.
   * @returns The log entry that was created (with assigned index).
   */
  append(
    action: GameAction,
    resultingState: GameState,
    events: GameEvent[]
  ): Promise<ActionLogEntry>;

  /**
   * Returns the current action count (number of entries logged).
   */
  getActionCount(): number;

  /**
   * Returns the log entry at a specific index.
   * Used for replay and debugging.
   *
   * @param index - The entry index (0-based).
   * @returns The log entry, or null if index is out of bounds.
   */
  getEntry(index: number): Promise<ActionLogEntry | null>;

  /**
   * Returns all log entries. Used for full replay.
   * During an active game, reads from Redis buffer.
   * After game end, reads from PostgreSQL.
   */
  getAllEntries(): Promise<ActionLogEntry[]>;

  /**
   * Flushes the in-memory/Redis log to PostgreSQL.
   * Called when the game ends (finished or cancelled).
   *
   * Writes:
   * - One row to the `games` table.
   * - N rows to the `game_actions` table (one per entry).
   *
   * After flushing:
   * - Redis keys for this game's log are deleted.
   */
  flush(gameResult: GameResult): Promise<void>;

  /**
   * Destroys the logger, cleaning up resources.
   * If the game ended abnormally (crash), Redis data persists for recovery.
   */
  destroy(): void;
}

/**
 * Passed to flush() to construct the games table row.
 */
interface GameResult {
  winnerId: string | null;   // null if cancelled
  phase: 'finished' | 'cancelled';
  endedAt: string;           // ISO 8601
  durationSeconds: number;
}
```

---

## 4. Behavior Rules

### 4.1 Append Flow

```
1. Receive action, resultingState, events from the orchestration layer.

2. Create ActionLogEntry:
   index = current entry count
   action = action
   resultingState = resultingState
   events = events
   timestamp = new Date().toISOString()  // wall clock

3. Serialize entry to JSON.

4. Append to Redis list:
   RPUSH game:{gameId}:actions <serialized entry>

5. Increment internal action counter.

6. Return the created entry.
```

### 4.2 Flush Flow (Game End)

```
1. Receive GameResult with winner, phase, duration.

2. Read all entries from Redis:
   LRANGE game:{gameId}:actions 0 -1

3. Construct games table row:
   {
     id: gameId,
     room_id: from initial state context,
     winner_user_id: gameResult.winnerId,
     phase: gameResult.phase,
     player_ids: state.turnOrder,
     config: state.config,
     rng_seed: state.rngSeed,
     action_count: entries.length,
     duration_seconds: gameResult.durationSeconds,
     started_at: initialState timestamp,
     ended_at: gameResult.endedAt,
   }

4. Construct game_actions table rows (batch):
   For each entry at index i:
   {
     id: generated UUID,
     game_id: gameId,
     index: i,
     action_type: entry.action.type,
     action_payload: entry.action,
     resulting_state_snapshot: (i % snapshotInterval === 0) ? entry.resultingState : null,
     player_id: entry.action.playerId || 'system',
     timestamp: entry.timestamp,
   }

5. Write to PostgreSQL in a transaction:
   a. INSERT into games.
   b. Batch INSERT into game_actions.

6. On success: delete Redis keys.
   DEL game:{gameId}:actions

7. On failure: log error. Do NOT delete Redis keys (data preserved for retry).
   Retry logic: exponential backoff, up to 5 attempts over 5 minutes.
   If all retries fail: leave data in Redis, write to dead-letter list for
   manual recovery.
```

### 4.3 Snapshot Strategy

Not every action stores the full resulting state in PostgreSQL. Storing full state on every row would balloon storage. Instead:

- Every Nth action (default N = 50) stores a full state snapshot in `resulting_state_snapshot`.
- Other actions store `null` for this column.
- To replay to action index M, find the nearest snapshot at index `floor(M / 50) * 50`, then replay from there.

The snapshot interval of 50 is chosen based on:
- Typical Sbobuz game: 40-150 actions.
- 50-action replay is fast (< 10ms for all 50 reducer calls).
- Most games have at most 3 snapshots in PostgreSQL.

### 4.4 Initial State Logging

The initial state (State₀) is logged as a special entry at index 0 with a synthetic action:

```typescript
const initialEntry: ActionLogEntry = {
  index: 0,
  action: { type: 'GAME_STARTED' as any },  // synthetic, not a real GameAction
  resultingState: initialState,
  events: [],
  timestamp: new Date().toISOString(),
};
```

This ensures the log contains the full initial state for replay starting from index 0.

**Alternative:** Store the initial state separately (not as an action entry). Both approaches work. The "entry at index 0" approach is chosen for simplicity — the log is self-contained without needing a separate initial state record.

---

## 5. Edge Cases & Test Scenarios

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Normal append during active game | Entry appended to Redis list. Index incremented. |
| 2 | Flush after normal game completion (player wins) | All entries written to PostgreSQL. Redis keys deleted. Games row has winner_user_id. |
| 3 | Flush after game cancellation | All entries written to PostgreSQL. Redis keys deleted. Games row has phase = 'cancelled', winner_user_id = null. |
| 4 | PostgreSQL unavailable during flush | Retry with exponential backoff. Redis data preserved. Dead-letter on final failure. |
| 5 | Redis unavailable during active game | Append fails. Orchestration layer should handle: buffer in memory, retry, or escalate. Game can continue in-memory but loses crash recovery. |
| 6 | Server crash mid-game, recovery from Redis | On restart, read Redis list for orphaned game. Rebuild ActionLogger state from Redis entries. Resume. |
| 7 | Game with 300+ actions | Every 50th action has a snapshot. Replay from nearest snapshot. 6 snapshots stored. |
| 8 | Game with 0 actions (started and immediately cancelled) | Only the initial state entry exists. Flushed to PostgreSQL with action_count = 1 (the initial entry). |
| 9 | Concurrent append calls (should not happen in practice) | Appends are sequential per game (one action at a time). Redis RPUSH is atomic. No concurrency issues. |
| 10 | getEntry with out-of-bounds index | Returns null. |
| 11 | Snapshot at exactly index 0 | Index 0 always has a snapshot (it is the initial state). |
| 12 | Snapshot at index 50, 100, 150 | These entries have non-null resulting_state_snapshot. |
| 13 | Flush with no entries (impossible in practice) | Writes games row with action_count = 0. No game_actions rows. |
| 14 | Large game state serialization | GameState is < 5 KB serialized (small deck, few players). Serialization is not a bottleneck. |
| 15 | Duplicate flush calls | Idempotent: if games row already exists (unique constraint on id), the second flush fails gracefully. Redis keys may already be deleted. |

---

## 6. Integration Points

### 6.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| Orchestration layer | `append(action, state, events)` | After each State Reducer call |
| Orchestration layer | `flush(gameResult)` | When game ends (finished or cancelled) |
| Crash recovery | `getAllEntries()` | On server restart, to rebuild game state |

### 6.2 Outbound

| Target | Interface | Data |
|--------|-----------|------|
| Redis | `RPUSH game:{gameId}:actions` | Serialized ActionLogEntry during active game |
| Redis | `DEL game:{gameId}:actions` | Cleanup after successful flush |
| PostgreSQL | `INSERT INTO games` | Game metadata row |
| PostgreSQL | `INSERT INTO game_actions` | Batch action rows |

### 6.3 Side Effects

| Side Effect | Trigger | Description |
|-------------|---------|-------------|
| Redis list append | `append()` | Writes serialized entry to Redis list |
| PostgreSQL batch insert | `flush()` | Writes game and action rows to durable storage |
| Redis key deletion | `flush()` (on success) | Removes game's action buffer from Redis |

---

## 7. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Store full state on every action or use snapshots? | Snapshots every 50 actions. Other entries store null for state. | Storage savings. A game with 100 actions stores 2 snapshots instead of 100 full states. Replay from a 50-action checkpoint is fast (< 10ms). Matches data-layer.md Decision #2. |
| 2 | Buffer in Redis or PostgreSQL during active game? | Redis. Flush to PostgreSQL on game end. | Avoids write pressure on PostgreSQL during gameplay. Redis RPUSH is O(1). Matches data-layer.md Decision #6. |
| 3 | Should the logger store the initial state? | Yes, as entry at index 0. | The log is self-contained. Replay starts from index 0 without needing to call State Factory again. |
| 4 | Should the logger store reducer events? | Yes, alongside each entry. | Events are needed for replay animations (e.g., "show Sbobuz animation at action 47"). Without events, the replay system would need to re-derive them. |
| 5 | What if flush fails permanently? | Dead-letter queue in Redis. Manual recovery by ops. | Game data in Redis survives for up to 2 hours (TTL). Ops can manually trigger a retry or extract data. |

---

## 8. Implications for Architecture

1. **The Action Logger is called AFTER the State Reducer, not before.** The orchestration flow is: validate → reduce → log → broadcast. The logger records the result, not the intent.

2. **The logger's Redis buffer aligns with the data-layer.md key schema.** The key `game:{gameId}:actions` is documented in the data layer spec and has a 2-hour TTL safety net.

3. **The flush operation is the bridge between hot path (Redis) and warm path (PostgreSQL).** This is the moment when ephemeral game data becomes durable history. It must be reliable (retries, dead-letter) because this is the only chance to persist the game record.

4. **The snapshot interval (50) is a tunable constant.** It can be changed without affecting the log format. Reducing it (e.g., to 10) speeds up replay at the cost of more storage. Increasing it (e.g., to 100) saves storage but slows replay for mid-game checkpoints.

5. **Crash recovery depends on Redis data surviving.** The orchestration layer on restart must check for orphaned `game:*:actions` keys and decide whether to resume or cancel each game. The Action Logger provides the `getAllEntries()` method for this purpose.

6. **The logger does not sanitize state.** It stores the FULL game state, including all players' hidden cards. This data is server-side only and never sent to clients. The Realtime Module handles sanitization before broadcasting.
