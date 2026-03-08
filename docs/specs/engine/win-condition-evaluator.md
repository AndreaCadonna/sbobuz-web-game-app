# Win Condition Evaluator — Player Victory Detection

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Sections 5.3, 7 (Step 5)

---

## 1. Overview

The Win Condition Evaluator checks whether a player has emptied all three card zones (hand, face-up, face-down) and is therefore the winner. The win condition in Sbobuz is simple: the first player to have no cards in any zone wins the game immediately.

The evaluator is called by the State Reducer after every state transition that could remove cards from a player's zones. If the check returns true, the game transitions to the `'finished'` phase and no further actions are processed.

The win condition is checked AFTER the draw phase (Step 3 in effect resolution) and AFTER zone recomputation (Step 4). This means a player who plays their last hand card but draws from the draw pile has NOT won — they still have cards in hand.

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * Result of a win condition check.
 */
interface WinCheckResult {
  /** Whether the player has won. */
  won: boolean;

  /** The player ID, if they won. null otherwise. */
  winnerId: string | null;
}
```

### 2.2 Types Referenced from Parent Spec

- `PlayerState` — contains `hand`, `faceUpCards`, `faceDownCards`
- `GameState` — contains `drawPile`, `players`

---

## 3. Public Interface

```typescript
/**
 * Checks if a specific player has won the game.
 * A player wins when all three card zones are empty AND the draw pile is empty.
 *
 * Note: If the draw pile is non-empty, a player cannot win because they would
 * draw cards into their hand during the draw phase.
 *
 * @param player - The player to check.
 * @param drawPileEmpty - Whether the draw pile is empty.
 * @returns WinCheckResult indicating whether the player has won.
 */
function checkWinCondition(player: PlayerState, drawPileEmpty: boolean): WinCheckResult;

/**
 * Checks if any player in the game has won.
 * Iterates through all players and returns the first winner found.
 * In practice, only the current player (who just acted) can win on any given turn.
 *
 * @param players - All players in the game.
 * @param drawPileEmpty - Whether the draw pile is empty.
 * @returns WinCheckResult with the winner's ID, or { won: false, winnerId: null }.
 */
function checkAnyWinner(players: readonly PlayerState[], drawPileEmpty: boolean): WinCheckResult;
```

---

## 4. Behavior Rules

### 4.1 Win Condition Logic

```
A player has won if ALL of the following are true:
  1. player.hand.length === 0
  2. player.faceUpCards.length === 0
  3. player.faceDownCards.length === 0
  4. drawPileEmpty === true

If drawPileEmpty is false, a player with an empty hand would draw cards
during the draw phase, so they cannot be in a "finished" state.
```

This is equivalent to `getActiveZone(player, drawPileEmpty) === 'finished'`, but the Win Condition Evaluator exists as a separate component for semantic clarity and to return the winner's ID.

### 4.2 When to Check

The win condition is checked at these points in the State Reducer:

1. **After PLAY_CARDS** — Step 8 in the PLAY_CARDS reducer flow. After draw phase and zone recomputation.
2. **After PLAY_BLIND (legal)** — same as PLAY_CARDS, after the standard resolution flow.
3. **After DECLARE_DIRECTION** — Step 5 in the DECLARE_DIRECTION reducer flow. After the Queen player's draw phase.
4. **After King clear, before requiring another play** — if the player has no cards after playing a King, they win immediately (parent spec Section 6.3, edge case).

The win condition is NOT checked:
- After PICK_UP_PILE (the player just gained cards — they cannot have won).
- After PLAY_BLIND with an illegal card (the player just picked up the pile).

### 4.3 Immediate Game End

When a player wins:
1. `GameState.phase` transitions to `'finished'`.
2. No further actions are accepted.
3. The winner's ID is recorded.
4. Remaining players do NOT continue playing.

The game does not check if multiple players could win simultaneously — this is impossible because only one player acts per turn.

---

## 5. Edge Cases & Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Player has 1 hand card, plays it, draw pile has cards | `{ won: false }` — draw pile refills hand. |
| 2 | Player has 1 hand card, plays it, draw pile empty, has face-up cards | `{ won: false }` — face-up cards remain. |
| 3 | Player has 1 face-down card, blind plays it successfully, all zones now empty | `{ won: true, winnerId: player.id }` |
| 4 | Player plays last face-up card, has face-down cards remaining | `{ won: false }` — face-down zone not empty. |
| 5 | Player plays King as their last card | `{ won: true }` — win checked before requiring post-clear play. |
| 6 | Player plays King, has 1 more card left | `{ won: false }` — must play again. |
| 7 | Player picks up pile (can never win after pickup) | Not checked (reducer skips win check after pickup). |
| 8 | Player plays last hand card, draw pile has 1 card | `{ won: false }` — player draws 1 card. |
| 9 | All zones empty but draw pile is not empty | `{ won: false }` — impossible in normal play (player would have drawn), but the evaluator handles it correctly regardless. |
| 10 | Player plays three cards of same rank (multi-play), emptying hand | If draw pile empty and face-up/face-down empty: `{ won: true }`. |
| 11 | Player declares Queen direction (their last card was the Queen) | After declaration, if hand empty and draw pile empty and face-up/face-down empty: `{ won: true }`. |
| 12 | Two-player game, player A empties all zones | `{ won: true, winnerId: 'A' }`. Game ends. Player B does not play. |
| 13 | Five-player game, player in middle of order wins | Game ends immediately. Turn does not advance to next player. |
| 14 | Player has 0 hand, 0 face-up, 1 face-down, draw pile empty | `{ won: false }` — face-down card remains. |
| 15 | Player successfully blind plays their last face-down card (a King) | King clears pile. Win checked before requiring another play. All zones empty → `{ won: true }`. |

---

## 6. Integration Points

### 6.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| State Reducer | `checkWinCondition(player, drawPileEmpty)` | The current player's state after a play action |
| State Reducer | `checkAnyWinner(players, drawPileEmpty)` | All players (belt-and-suspenders check, optional) |

### 6.2 Outbound

None. The Win Condition Evaluator is a leaf component.

### 6.3 Side Effects

None. This is a pure function.

---

## 7. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Should the evaluator check all players or just the acting player? | Primary function checks a single player. A convenience function checks all players. In practice, only the acting player can win. | Single-player check is faster and more semantically clear. The "check all" function exists as a safety net. |
| 2 | Is "King as last card" checked before requiring post-clear play? | Yes. Win condition is checked immediately after a King play. If the player has no cards, they win. The "play again" requirement is not enforced. | Parent spec Section 6.3: "If the player has no remaining cards after playing the King, they win." |
| 3 | Can a player win during the draw phase? | No. The draw phase adds cards. It cannot empty zones. | Logically impossible — drawing adds cards, does not remove them. |
| 4 | Should the evaluator receive the full GameState? | No. It receives PlayerState + drawPileEmpty boolean. | Minimal interface. The evaluator does not need game-level context — only the player's card distribution and whether drawing is possible. |

---

## 8. Implications for Architecture

1. **The win check ordering in the State Reducer is critical.** It must happen AFTER the draw phase. A player who plays their last hand card but draws from the pile has not won. The reducer must sequence: play → draw → recompute zone → check win.

2. **The King edge case (play King as last card = win) means the win check has two call sites in the PLAY_CARDS reducer:** once after the King effect (before entering `'awaiting_post_clear_play'`) and once at the normal Step 8 position. The reducer must check both.

3. **The evaluator's relationship to Active Zone Resolver is intentional overlap.** `getActiveZone(player, drawPileEmpty) === 'finished'` is logically equivalent to `checkWinCondition(player, drawPileEmpty).won === true`. The evaluator wraps this check with the winner's ID and semantic naming for clarity. Implementations may choose to call `getActiveZone` internally.
