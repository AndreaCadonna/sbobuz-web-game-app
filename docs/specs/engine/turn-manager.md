# Turn Manager — Player Turn Index Computation

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Section 13

---

## 1. Overview

The Turn Manager computes the next player index in the turn sequence, given the current index, turn direction, and player count. It handles forward and reverse traversal with wraparound. This is the only component responsible for index arithmetic on the turn order.

The Turn Manager is a single pure function. It does not track whose turn it is — that state lives in `GameState.currentPlayerIndex`. It simply computes the next value.

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * Input parameters for computing the next turn index.
 */
interface TurnAdvanceInput {
  /** Current index into the turnOrder array. */
  currentIndex: number;

  /** Direction of play: 1 = forward, -1 = reversed. */
  direction: 1 | -1;

  /** Total number of players in the turnOrder array. */
  playerCount: number;
}
```

### 2.2 Types Referenced from Parent Spec

- `GameState.currentPlayerIndex` — the index this component advances
- `GameState.turnDirection` — `1 | -1`
- `GameState.turnOrder` — `string[]`, player IDs in sequence

---

## 3. Public Interface

```typescript
/**
 * Computes the next player index after advancing by the turn direction.
 * Handles wraparound in both directions using double-modulo.
 *
 * @param currentIndex - The current player's index in turnOrder (0-based).
 * @param direction - 1 for forward, -1 for reversed.
 * @param playerCount - Total number of players.
 * @returns The next player's index in turnOrder.
 *
 * @example
 * advanceTurn(2, 1, 4)  // → 3
 * advanceTurn(3, 1, 4)  // → 0 (wraps forward)
 * advanceTurn(0, -1, 4) // → 3 (wraps backward)
 */
function advanceTurn(currentIndex: number, direction: 1 | -1, playerCount: number): number;
```

---

## 4. Behavior Rules

### 4.1 Index Computation

The formula for the next index uses double-modulo to handle negative values correctly in JavaScript:

```
nextIndex = ((currentIndex + direction) % playerCount + playerCount) % playerCount
```

**Why double-modulo:** JavaScript's `%` operator returns negative values for negative operands. When `direction === -1` and `currentIndex === 0`, the naive `(0 + -1) % 4` yields `-1`, not `3`. The double-modulo normalizes the result to the range `[0, playerCount - 1]`.

### 4.2 Direction Semantics

- `direction === 1`: Normal play order. Index increases (0 → 1 → 2 → 3 → 0).
- `direction === -1`: Reversed play order. Index decreases (3 → 2 → 1 → 0 → 3).

### 4.3 Direction Reversal

The Turn Manager does not perform direction reversals. It receives the current direction as input. Direction changes (from Joker or Sbobuz) are applied by the State Reducer before calling this function.

Multiple reversals cancel out:
```
direction *= -1  // reverse
direction *= -1  // reverse again = back to original
```

---

## 5. Validation Rules

| Check | Condition | Error |
|-------|-----------|-------|
| Player count is at least 2 | `playerCount >= 2` | `'INVALID_PLAYER_COUNT: need at least 2 players'` |
| Player count is at most 5 | `playerCount <= 5` | `'INVALID_PLAYER_COUNT: maximum 5 players'` |
| Current index is in bounds | `currentIndex >= 0 && currentIndex < playerCount` | `'INDEX_OUT_OF_BOUNDS: currentIndex must be in [0, playerCount)'` |
| Direction is valid | `direction === 1 \|\| direction === -1` | `'INVALID_DIRECTION: must be 1 or -1'` |

---

## 6. Edge Cases & Test Scenarios

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| 1 | Normal forward, mid-sequence | `(1, 1, 4)` | `2` |
| 2 | Normal forward, wrap around | `(3, 1, 4)` | `0` |
| 3 | Reverse, mid-sequence | `(2, -1, 4)` | `1` |
| 4 | Reverse, wrap around | `(0, -1, 4)` | `3` |
| 5 | Two players, forward | `(0, 1, 2)` | `1` |
| 6 | Two players, forward wrap | `(1, 1, 2)` | `0` |
| 7 | Two players, reverse | `(0, -1, 2)` | `1` |
| 8 | Two players, reverse wrap | `(1, -1, 2)` | `0` |
| 9 | Five players, forward from last | `(4, 1, 5)` | `0` |
| 10 | Five players, reverse from first | `(0, -1, 5)` | `4` |
| 11 | Three players, forward all positions | `(0,1,3)→1`, `(1,1,3)→2`, `(2,1,3)→0` | Full cycle |
| 12 | Three players, reverse all positions | `(2,-1,3)→1`, `(1,-1,3)→0`, `(0,-1,3)→2` | Full reverse cycle |
| 13 | Direction changed mid-game | Forward to index 2, then direction flips to -1, advance from 2 | `(2, -1, 4)` → `1` |
| 14 | Double reversal returns to original | Two consecutive `direction *= -1` applied; advance produces same result as original direction | Verified by symmetry |

---

## 7. Integration Points

### 7.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| State Reducer | `advanceTurn(currentIndex, direction, playerCount)` | Current index, direction, count from GameState |

### 7.2 Outbound

None. The Turn Manager is a leaf component with no outbound dependencies.

### 7.3 Side Effects

None. This is a pure function.

---

## 8. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Should the Turn Manager skip players who have finished? | No. All players remain in turnOrder. The State Reducer checks the win condition separately. Once a player wins, the game ends. | There is no "eliminated but still playing" state in Sbobuz. The game ends as soon as one player empties all zones. |
| 2 | Should the Turn Manager accept GameState directly? | No. It receives primitive values (index, direction, count). | Keeps the component decoupled from the GameState shape. Easier to test. Single responsibility. |
| 3 | Should direction be an enum or a number? | Number literal type `1 \| -1`. | Enables direct arithmetic (`index + direction`). An enum would require mapping. |

---

## 9. Implications for Architecture

1. **The Turn Manager is intentionally minimal.** It performs one arithmetic operation. This is by design — turn advancement logic should not accumulate complexity. Any conditional turn logic (skip, stay, etc.) belongs in the State Reducer, which decides *whether* to call `advanceTurn`.

2. **Player elimination is not modeled.** Sbobuz has no concept of eliminated players who remain at the table. The first player to empty all zones wins, and the game ends. If future rules added elimination, the Turn Manager would need a `skipIndices` parameter.
