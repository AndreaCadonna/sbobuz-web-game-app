---
name: event-sourcing
description: Event-sourced architecture and state machine patterns for TypeScript applications. Covers immutable state design, action/event modeling, pure reducers, validation separation, snapshot strategy, deterministic replay, and CQRS patterns. Use this skill whenever designing event-sourced systems, implementing state machines, writing pure reducer functions, modeling game or workflow state transitions, or when the user asks about event sourcing, CQRS, action logs, state replay, or deterministic state reconstruction. Also activate when implementing snapshotting strategies, designing action validation pipelines, or building systems that require complete audit trails and replayability.
origin: ECC
---

# Event-Sourced Architecture

Production patterns for event-sourced systems in TypeScript. These conventions prioritize immutable state, deterministic replay, and clean separation between validation and state transitions.

## When to Activate

- Designing an event-sourced system
- Implementing state machines with typed transitions
- Writing pure reducer functions
- Modeling action/event schemas
- Implementing snapshot and replay mechanisms
- Building systems requiring audit trails
- Designing game engines or workflow systems

## Core Concepts

Event sourcing stores the sequence of actions that produced the current state, not just the state itself. The current state is a derived value — computed by replaying all actions through a pure reducer.

```
Action Log (source of truth):
  [action1, action2, action3, ..., actionN]

Current State (derived):
  state = actions.reduce(reducer, initialState)
```

### Why Event Sourcing

| Benefit | How |
|---------|-----|
| **Complete audit trail** | Every action is recorded with who, what, when |
| **Deterministic replay** | Replay the action log to reconstruct any historical state |
| **Debugging** | "What happened?" → read the action log |
| **Testing** | Feed action sequences to the reducer, assert on output |
| **Undo/time travel** | Replay up to action N-1 to get the state before action N |

### The Tradeoff

Event sourcing adds complexity. Use it when replay, auditability, or time-travel are genuine requirements — not for simple CRUD.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Game Engine                        │
│                                                      │
│  Input ──→ Validator ──→ Reducer ──→ Output          │
│  (action)   (pure,       (pure,       (new state     │
│              rejects      immutable    + events)      │
│              invalid)     transform)                  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Action Log (append-only)            │ │
│  │  [action1, action2, action3, ...]               │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Snapshots (periodic checkpoints)       │ │
│  │  state@action50, state@action100, ...            │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Immutable State

State is never mutated in place. Every action produces a new state object. This makes the system predictable and testable.

```typescript
// GOOD — return new state
function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'play_cards':
      return {
        ...state,
        pile: [...state.pile, ...playedCards],
        players: state.players.map((p) =>
          p.id === action.playerId
            ? { ...p, hand: p.hand.filter((c) => !playedCardIds.has(c.id)) }
            : p,
        ),
        currentPlayerIndex: nextPlayerIndex(state),
      };
  }
}

// NEVER — mutate in place
function reducer(state: GameState, action: GameAction): GameState {
  state.pile.push(...playedCards);  // Mutation!
  state.players[idx].hand.splice(i, 1);  // Mutation!
  return state;
}
```

### TypeScript Immutability

Use `readonly` to enforce immutability at the type level.

```typescript
interface GameState {
  readonly id: string;
  readonly phase: Phase;
  readonly players: readonly PlayerState[];
  readonly pile: readonly Card[];
  readonly currentPlayerIndex: number;
  readonly direction: 'higher' | 'lower';
  readonly seed: number;
  readonly actionLog: readonly ActionLogEntry[];
}
```

## Action Types

Define actions as discriminated unions. Every action has a `type` field that identifies it, plus a typed payload.

```typescript
type GameAction =
  | PlayCardsAction
  | PlayBlindAction
  | PickUpPileAction
  | DeclareDirectionAction
  | TimeoutAction;

interface PlayCardsAction {
  readonly type: 'play_cards';
  readonly playerId: string;
  readonly payload: {
    readonly cardIds: string[];
  };
  readonly timestamp: number;
}

interface PlayBlindAction {
  readonly type: 'play_blind';
  readonly playerId: string;
  readonly payload: {
    readonly index: number;  // Index of face-down card
  };
  readonly timestamp: number;
}

interface PickUpPileAction {
  readonly type: 'pick_up_pile';
  readonly playerId: string;
  readonly timestamp: number;
}

interface DeclareDirectionAction {
  readonly type: 'declare_direction';
  readonly playerId: string;
  readonly payload: {
    readonly direction: 'higher' | 'lower';
  };
  readonly timestamp: number;
}
```

## Validation (Separate from Reduction)

The validator is a gate. It either accepts an action or rejects it with a reason. Rejected actions never touch the state. This separation keeps the reducer simple — it assumes all inputs are valid.

```typescript
interface ValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

function validateAction(state: GameState, action: GameAction): ValidationResult {
  // Universal checks (apply to all actions)
  if (state.phase !== 'playing') {
    return { valid: false, reason: 'GAME_NOT_IN_PROGRESS' };
  }

  if (action.playerId !== getCurrentPlayer(state).id) {
    return { valid: false, reason: 'NOT_YOUR_TURN' };
  }

  // Action-specific checks
  switch (action.type) {
    case 'play_cards':
      return validatePlayCards(state, action);
    case 'play_blind':
      return validatePlayBlind(state, action);
    case 'pick_up_pile':
      return { valid: true }; // Always valid on your turn
    case 'declare_direction':
      return validateDeclareDirection(state, action);
    default:
      return { valid: false, reason: 'UNKNOWN_ACTION' };
  }
}
```

### Validation Pipeline

```
Action received
  │
  ├── Universal checks (phase, turn, game exists)
  │     └── Fail? → Return error, do NOT apply
  │
  ├── Action-specific checks (card legality, valid index)
  │     └── Fail? → Return error, do NOT apply
  │
  └── Pass → Feed to reducer → Get new state → Append to log
```

## Reducer (Pure State Transition)

The reducer is a pure function: `(state, action) → newState`. No I/O, no side effects, no randomness. This is what makes the system deterministic and replayable.

```typescript
function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'play_cards':
      return applyPlayCards(state, action);
    case 'play_blind':
      return applyPlayBlind(state, action);
    case 'pick_up_pile':
      return applyPickUpPile(state, action);
    case 'declare_direction':
      return applyDeclareDirection(state, action);
    default:
      return state; // Unknown actions are no-ops (caught by validator)
  }
}

function applyPlayCards(state: GameState, action: PlayCardsAction): GameState {
  const player = state.players.find((p) => p.id === action.playerId)!;
  const playedCards = action.payload.cardIds.map(
    (id) => player.hand.find((c) => c.id === id)!,
  );

  // Step 1: Remove cards from player's hand
  const updatedPlayers = state.players.map((p) =>
    p.id === action.playerId
      ? { ...p, hand: p.hand.filter((c) => !action.payload.cardIds.includes(c.id)) }
      : p,
  );

  // Step 2: Add cards to pile
  const newPile = [...state.pile, ...playedCards];

  // Step 3: Resolve effects (Kings clear pile, etc.)
  const { pile: resolvedPile, flags } = resolveEffects(newPile, playedCards);

  // Step 4: Check win condition
  const winner = checkWinCondition(updatedPlayers);

  // Step 5: Advance turn (unless effect grants extra turn)
  const nextIndex = flags.extraTurn
    ? state.currentPlayerIndex
    : nextPlayerIndex(state, updatedPlayers);

  return {
    ...state,
    players: updatedPlayers,
    pile: resolvedPile,
    currentPlayerIndex: nextIndex,
    direction: flags.reverseDirection ? reverseDirection(state.direction) : state.direction,
    phase: winner ? 'finished' : state.phase,
    winnerId: winner?.id,
  };
}
```

### Effect Resolution Order

When multiple rules could apply, define the exact priority. This is where bugs hide.

```
STEP 1 — Check for Sbobuz (4-of-a-kind on pile)
    ├─ YES → Clear pile + reverse direction + play again. STOP.
    └─ NO  → Continue.

STEP 2 — Check played card type
    ├─ King → Clear pile + play again.
    ├─ Queen → Set phase to awaiting_queen_declaration.
    ├─ Joker → Free play flag + reverse direction.
    ├─ 2 → Free play flag.
    └─ Other → No special effect.

STEP 3 — Check if free play flag is set
    └─ YES → Next player can play any card (single-use, consumed).

STEP 4 — Advance turn (unless extra turn granted).

STEP 5 — Check win condition.
```

## Snapshot Strategy

For long-running action logs, replay from the beginning becomes slow. Snapshots are periodic checkpoints that let you restore state without replaying the entire log.

```typescript
interface Snapshot {
  readonly state: GameState;
  readonly actionIndex: number;  // Index of the last action included
  readonly createdAt: number;
}

// Take a snapshot every N actions or every M seconds
const SNAPSHOT_INTERVAL_ACTIONS = 10;
const SNAPSHOT_INTERVAL_SECONDS = 30;

async function maybeSnapshot(
  gameId: string,
  state: GameState,
  actionIndex: number,
  lastSnapshotIndex: number,
): Promise<void> {
  if (actionIndex - lastSnapshotIndex >= SNAPSHOT_INTERVAL_ACTIONS) {
    await redis.set(
      `game:${gameId}:snapshot`,
      JSON.stringify({ state, actionIndex, createdAt: Date.now() }),
    );
  }
}
```

### Restoration from Snapshot

```typescript
async function restoreGameState(gameId: string): Promise<GameState> {
  // Try snapshot first
  const snapshotRaw = await redis.get(`game:${gameId}:snapshot`);
  let state: GameState;
  let startIndex: number;

  if (snapshotRaw) {
    const snapshot: Snapshot = JSON.parse(snapshotRaw);
    state = snapshot.state;
    startIndex = snapshot.actionIndex + 1;
  } else {
    state = createInitialState(gameId, seed, players);
    startIndex = 0;
  }

  // Replay actions after snapshot
  const actions = await getActionsFrom(gameId, startIndex);
  for (const action of actions) {
    state = reducer(state, action);
  }

  return state;
}
```

## Deterministic Replay

For replay to work, the system must be deterministic. The same action log + seed must always produce the same state.

### Rules for Determinism

- **No `Math.random()`** — Use a seeded PRNG. Store the seed in the initial state.
- **No `Date.now()` in the reducer** — Timestamps come from action metadata, not from the clock.
- **No I/O in the reducer** — No database reads, no network calls. Everything the reducer needs is in the state and the action.
- **No floating point arithmetic** for comparisons — Use integer math or fixed-point.

```typescript
// Seeded PRNG for deterministic shuffles
function createPRNG(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

function shuffle<T>(array: readonly T[], random: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

## Action Log Storage

### During Game (Hot Path — Redis)

Active games store their action log in Redis for fast append and read.

```typescript
async function appendAction(gameId: string, action: GameAction): Promise<void> {
  await redis.rpush(
    `game:${gameId}:actions`,
    JSON.stringify(action),
  );
}
```

### After Game (Cold Path — PostgreSQL)

When a game ends, persist the complete action log to PostgreSQL for permanent storage, analytics, and replay.

```typescript
async function persistActionLog(gameId: string, actions: GameAction[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < actions.length; i++) {
      await client.query(
        `INSERT INTO game_actions (game_id, sequence_number, player_id, action_type, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [gameId, i, actions[i].playerId, actions[i].type, JSON.stringify(actions[i].payload)],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

## Testing Event-Sourced Systems

Event-sourced systems are exceptionally testable. Feed action sequences to the reducer and assert on the resulting state.

```typescript
describe('game engine', () => {
  it('completes a full game scenario', () => {
    const initial = createInitialState('game-1', 12345, ['alice', 'bob']);

    const actions: GameAction[] = [
      { type: 'play_cards', playerId: 'alice', payload: { cardIds: ['7-hearts'] } },
      { type: 'play_cards', playerId: 'bob', payload: { cardIds: ['9-spades'] } },
      { type: 'play_cards', playerId: 'alice', payload: { cardIds: ['K-diamonds'] } },
      // King clears pile, alice plays again
      { type: 'play_cards', playerId: 'alice', payload: { cardIds: ['3-clubs'] } },
    ];

    const finalState = actions.reduce(reducer, initial);

    expect(finalState.pile).toEqual([card('3', 'clubs')]);
    expect(finalState.currentPlayerIndex).toBe(1); // bob's turn
  });
});
```

## Checklist

Before shipping event-sourced code:

- [ ] State is immutable — never mutated in place
- [ ] Reducer is pure — no I/O, no side effects, no randomness
- [ ] Validation is separate from reduction
- [ ] Actions are typed with discriminated unions
- [ ] Effect resolution order is explicit and documented
- [ ] Seeded PRNG used for all randomness (no `Math.random()`)
- [ ] No `Date.now()` inside the reducer — timestamps in action metadata
- [ ] Snapshot strategy prevents unbounded replay cost
- [ ] Action log persisted to durable storage after game ends
- [ ] Replay produces identical state from same seed + actions
