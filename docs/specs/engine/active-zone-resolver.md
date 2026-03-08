# Active Zone Resolver — Player Card Zone Determination

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Section 5.3

---

## 1. Overview

The Active Zone Resolver determines which card zone a player should play from, given their current card distribution and the draw pile status. The zone progression follows a strict order: hand, then face-up, then face-down, then finished. However, zone transitions are NOT one-way — if a player in the face-down zone picks up the pile or fails a blind play, cards go into their hand, reverting them to the hand zone.

The active zone is always recomputed from the current state, never tracked as a stored progression marker. This is a derived value, not stored state.

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * The zone a player currently plays from.
 * Computed from the player's card distribution and draw pile status.
 */
type ActiveZone = 'hand' | 'faceUp' | 'faceDown' | 'finished';
```

### 2.2 Types Referenced from Parent Spec

- `PlayerState` — contains `hand`, `faceUpCards`, `faceDownCards`
- `GameState.drawPile` — needed to determine if hand zone is still active

---

## 3. Public Interface

```typescript
/**
 * Determines which zone a player plays from.
 *
 * The logic:
 * - If the player has cards in hand OR the draw pile is not empty → 'hand'
 *   (draw pile not empty means the player will refill their hand after playing)
 * - Else if the player has face-up cards → 'faceUp'
 * - Else if the player has face-down cards → 'faceDown'
 * - Else → 'finished' (player has won or is about to win)
 *
 * @param player - The player whose active zone is being determined.
 * @param drawPileEmpty - Whether the draw pile is empty.
 * @returns The active zone for this player.
 */
function getActiveZone(player: PlayerState, drawPileEmpty: boolean): ActiveZone;

/**
 * Returns the cards available in the player's active zone.
 * For 'hand' → player.hand
 * For 'faceUp' → player.faceUpCards
 * For 'faceDown' → player.faceDownCards
 * For 'finished' → empty array
 *
 * @param player - The player.
 * @param activeZone - The player's active zone (from getActiveZone).
 * @returns The cards in the active zone.
 */
function getActiveZoneCards(player: PlayerState, activeZone: ActiveZone): readonly Card[];
```

---

## 4. Behavior Rules

### 4.1 Zone Resolution Logic

```
1. Does the player have cards in hand (hand.length > 0)?
   ├─ YES → Active zone is 'hand'. STOP.
   └─ NO  → Continue.

2. Is the draw pile non-empty (drawPileEmpty === false)?
   ├─ YES → Active zone is 'hand'. STOP.
   │        (Player's hand is empty now, but will be refilled from draw pile
   │         after their next play. They still play from hand zone.)
   └─ NO  → Continue.

3. Does the player have face-up cards (faceUpCards.length > 0)?
   ├─ YES → Active zone is 'faceUp'. STOP.
   └─ NO  → Continue.

4. Does the player have face-down cards (faceDownCards.length > 0)?
   ├─ YES → Active zone is 'faceDown'. STOP.
   └─ NO  → Continue.

5. All zones are empty → Active zone is 'finished'.
```

### 4.2 Zone Transitions are Bidirectional

The critical design insight: a player in the face-down zone can revert to hand zone. This happens when:
- They fail a blind play (illegal card revealed) and pick up the pile into their hand.
- They voluntarily pick up the pile while in the face-up or face-down zone.
- Any other action that puts cards into their hand.

Because the active zone is always recomputed, not stored, these reversions happen automatically.

### 4.3 Draw Pile Interaction

The draw pile affects zone resolution for ALL players, not just the current player. If the draw pile has cards, every player's active zone is 'hand' (assuming they have cards there or will draw). The specific rule: if `hand.length > 0 OR drawPile.length > 0`, the active zone is 'hand'.

This means a player whose hand is temporarily empty (they just played their last hand card) is still in the 'hand' zone if the draw pile is non-empty, because they will immediately draw cards.

---

## 5. Edge Cases & Test Scenarios

| # | Scenario | Hand | Face-Up | Face-Down | Draw Pile | Expected Zone |
|---|----------|------|---------|-----------|-----------|---------------|
| 1 | Normal play, cards in hand | 3 cards | 3 cards | 3 cards | 27 cards | `'hand'` |
| 2 | Hand empty, draw pile has cards | 0 cards | 3 cards | 3 cards | 10 cards | `'hand'` |
| 3 | Hand empty, draw pile empty, has face-up | 0 cards | 2 cards | 3 cards | 0 cards | `'faceUp'` |
| 4 | Hand empty, draw pile empty, face-up empty, has face-down | 0 cards | 0 cards | 2 cards | 0 cards | `'faceDown'` |
| 5 | All zones empty | 0 cards | 0 cards | 0 cards | 0 cards | `'finished'` |
| 6 | Failed blind play — cards moved to hand | 5 cards | 0 cards | 1 card | 0 cards | `'hand'` |
| 7 | Picked up pile in face-up zone | 8 cards | 1 card | 3 cards | 0 cards | `'hand'` |
| 8 | Single card in hand, draw pile empty | 1 card | 0 cards | 0 cards | 0 cards | `'hand'` |
| 9 | Hand just emptied, draw pile has 1 card | 0 cards | 3 cards | 3 cards | 1 card | `'hand'` |
| 10 | Player about to win — last face-down just played | 0 cards | 0 cards | 0 cards | 0 cards | `'finished'` |
| 11 | Face-up has 1 card, everything else empty | 0 cards | 1 card | 0 cards | 0 cards | `'faceUp'` |
| 12 | Face-down has 1 card, everything else empty | 0 cards | 0 cards | 1 card | 0 cards | `'faceDown'` |
| 13 | Draw pile has 36 cards (2-player start), hand has 3 | 3 cards | 3 cards | 3 cards | 36 cards | `'hand'` |
| 14 | 5-player game, draw pile has 9 cards | 2 cards | 3 cards | 3 cards | 9 cards | `'hand'` |
| 15 | Reversion: was in faceDown, picked up pile, now has hand cards | 12 cards | 0 cards | 2 cards | 0 cards | `'hand'` |

---

## 6. Integration Points

### 6.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| Action Validator | `getActiveZone(player, drawPileEmpty)` | PlayerState + draw pile status, to verify player is playing from correct zone |
| State Reducer | `getActiveZone(player, drawPileEmpty)` | After state changes, to recompute the player's zone |
| Win Condition Evaluator | Uses same logic conceptually | Checks if zone is 'finished' |

### 6.2 Outbound

None. The Active Zone Resolver is a leaf component with no outbound dependencies.

### 6.3 Side Effects

None. This is a pure function.

---

## 7. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Should active zone be stored in GameState? | No. It is computed (derived) from PlayerState + draw pile status. Never stored. | Storing derived state risks inconsistency. Recomputing is trivial (O(1)) and always correct. |
| 2 | Should the draw pile status be a boolean parameter or should the function receive the full draw pile? | Boolean (`drawPileEmpty`). | The resolver does not need to know draw pile contents or count — only whether it is empty. Passing a boolean keeps the interface minimal. |
| 3 | Is 'finished' a real zone or a sentinel? | It is a sentinel value indicating the player has no cards left. It is not a playable zone. | The Win Condition Evaluator uses this value to detect a winner. The Action Validator uses it to reject actions from finished players. |

---

## 8. Implications for Architecture

1. **Every component that needs to know a player's active zone must call this function.** No component should inline the zone logic or cache the result across state transitions.

2. **The draw pile is a shared resource that affects all players' zone computations.** When the draw pile empties, the active zone of a player with an empty hand transitions from 'hand' to 'faceUp' (or 'faceDown' or 'finished'). This transition happens for all players simultaneously as a function of the shared draw pile state.

3. **The `getActiveZoneCards` helper is a convenience function** for the Action Validator, which needs to verify that played cards exist in the correct zone. It maps the zone enum back to the concrete array on the PlayerState.
