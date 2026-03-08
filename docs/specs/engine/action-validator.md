# Action Validator — Game Action Validation Gate

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Section 10

---

## 1. Overview

The Action Validator is the gate between player intent and state mutation. It takes the current GameState and a GameAction, and returns either a validation success (the action may proceed to the State Reducer) or a validation failure with a specific reason code. Rejected actions never touch the state.

Every rule that says "you can't do that" lives here. The validator is exhaustive — if an action passes validation, the State Reducer can assume all preconditions are met and focus on effect resolution.

The Action Validator is a pure function. It reads the state but never modifies it.

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * Result of validating a game action.
 */
type ValidationResult =
  | { valid: true }
  | { valid: false; reason: ValidationError };

/**
 * Structured validation error with a code for programmatic handling
 * and a message for human-readable debugging.
 */
interface ValidationError {
  code: ValidationErrorCode;
  message: string;
}

type ValidationErrorCode =
  // Universal checks
  | 'GAME_NOT_ACTIVE'            // Game phase is 'finished' or 'cancelled'
  | 'WRONG_PHASE'                // Action type not valid in current phase
  | 'NOT_YOUR_TURN'              // Player is not the current player
  | 'PLAYER_NOT_FOUND'           // Player ID not found in game state
  | 'PLAYER_FINISHED'            // Player has already emptied all zones

  // PLAY_CARDS specific
  | 'CARDS_NOT_IN_ZONE'          // One or more cards not found in active zone
  | 'CARDS_NOT_SAME_RANK'        // Cards played are not all the same rank
  | 'CARD_NOT_LEGAL'             // Card rank fails comparison check
  | 'EMPTY_CARD_LIST'            // No cards specified

  // PLAY_BLIND specific
  | 'NOT_IN_FACEDOWN_ZONE'       // Player's active zone is not 'faceDown'
  | 'CARD_INDEX_OUT_OF_BOUNDS'   // cardIndex outside faceDownCards array

  // PICK_UP_PILE specific
  | 'PILE_EMPTY'                 // Cannot pick up empty pile

  // DECLARE_DIRECTION specific
  | 'INVALID_DIRECTION'          // Direction is not 'higher' or 'lower'
  | 'NOT_QUEEN_PLAYER';          // Player did not play the Queen
```

### 2.2 Types Referenced from Parent Spec

- `GameState` — the state being validated against
- `GameAction` and all subtypes — the action being validated
- `GamePhase` — determines which actions are valid
- `Card`, `Rank` — for card verification
- `ActiveZone` — from Active Zone Resolver

---

## 3. Public Interface

```typescript
/**
 * Validates a game action against the current state.
 * Returns a ValidationResult indicating success or failure with a reason.
 *
 * @param state - The current game state.
 * @param action - The action to validate.
 * @returns ValidationResult — { valid: true } or { valid: false, reason }.
 */
function validateAction(state: GameState, action: GameAction): ValidationResult;
```

---

## 4. Behavior Rules

### 4.1 Validation Flow

Every action passes through universal checks first, then action-specific checks:

```
STEP 1 — UNIVERSAL CHECKS (all action types)
    1a. Is the game active?
        phase must NOT be 'finished' or 'cancelled'.
        Exception: CANCEL_GAME is always valid regardless of phase.
        ├─ FAIL → { code: 'GAME_NOT_ACTIVE', message: 'Game is already over' }

    1b. Is the player in the game?
        action.playerId must exist in state.players.
        Exception: CANCEL_GAME may have no playerId (admin cancel).
        ├─ FAIL → { code: 'PLAYER_NOT_FOUND', message: 'Player not in this game' }

    1c. Is it this player's turn?
        action.playerId must match state.turnOrder[state.currentPlayerIndex].
        Exception: DECLARE_DIRECTION — checked separately (must be Queen player).
        Exception: CANCEL_GAME — no turn check.
        Exception: TIMEOUT_FORFEIT — no turn check (system action).
        ├─ FAIL → { code: 'NOT_YOUR_TURN', message: 'It is not your turn' }

    1d. Has this player already finished?
        getActiveZone(player, drawPileEmpty) must not be 'finished'.
        Exception: CANCEL_GAME, TIMEOUT_FORFEIT.
        ├─ FAIL → { code: 'PLAYER_FINISHED', message: 'Player has already finished' }

STEP 2 — PHASE CHECK
    Is the game phase compatible with this action type?

    | Action Type          | Valid Phases                                    |
    |---------------------|-------------------------------------------------|
    | PLAY_CARDS           | 'playing', 'awaiting_post_clear_play'          |
    | PLAY_BLIND           | 'playing', 'awaiting_post_clear_play'          |
    | PICK_UP_PILE         | 'playing'                                       |
    | DECLARE_DIRECTION    | 'awaiting_queen_declaration'                    |
    | TIMEOUT_FORFEIT      | 'playing', 'awaiting_queen_declaration',        |
    |                      | 'awaiting_post_clear_play'                      |
    | CANCEL_GAME          | any phase (always valid)                        |

    ├─ FAIL → { code: 'WRONG_PHASE', message: 'Action {type} not valid in {phase} phase' }

STEP 3 — ACTION-SPECIFIC CHECKS
    Proceed to the relevant section below.
```

### 4.2 PLAY_CARDS Validation

```
3a. Are card IDs non-empty?
    cardIds.length must be > 0.
    ├─ FAIL → { code: 'EMPTY_CARD_LIST', message: 'Must play at least one card' }

3b. Determine player's active zone.
    activeZone = getActiveZone(player, drawPileEmpty)

3c. Are all specified cards in the player's active zone?
    For 'hand' zone: all cardIds must be found in player.hand.
    For 'faceUp' zone: all cardIds must be found in player.faceUpCards.
    For 'faceDown' zone: PLAY_CARDS is NOT valid from faceDown (use PLAY_BLIND).
    ├─ FAIL → { code: 'CARDS_NOT_IN_ZONE', message: 'Card {id} not in {zone}' }

3d. Are all specified cards the same rank?
    Extract ranks from all cards. They must all be identical.
    (Jokers have no rank — a Joker can only be played alone, not with other cards.
     Two Jokers cannot be played together because they have no shared rank.)
    ├─ FAIL → { code: 'CARDS_NOT_SAME_RANK', message: 'All cards must share the same rank' }

3e. Is the rank legal given the current context?
    Build ComparisonContext from state:
      pileTopRank = top card rank (or null if pile empty)
      pileTopIsJoker = top card is joker
      freePlay = state.freePlay
      nextCardOverride = state.nextCardOverride

    Call isCardLegal(card, context).
    ├─ FAIL → { code: 'CARD_NOT_LEGAL', message: reason from ComparisonResult }
```

### 4.3 PLAY_BLIND Validation

```
3a. Is the player's active zone 'faceDown'?
    activeZone = getActiveZone(player, drawPileEmpty)
    activeZone must be 'faceDown'.
    ├─ FAIL → { code: 'NOT_IN_FACEDOWN_ZONE', message: 'Can only blind play from face-down zone' }

3b. Is cardIndex within bounds?
    cardIndex must be >= 0 AND < player.faceDownCards.length.
    ├─ FAIL → { code: 'CARD_INDEX_OUT_OF_BOUNDS', message: 'Card index {idx} out of bounds (0-{max})' }

NOTE: The revealed card's legality is NOT checked here. It is checked inside the
State Reducer after the card is revealed. The consequences differ:
- Validator rejection → action never happened, state unchanged.
- Reducer illegal reveal → card placed on pile, entire pile picked up by player.
```

### 4.4 PICK_UP_PILE Validation

```
3a. Is the play pile non-empty?
    state.playPile.length must be > 0.
    ├─ FAIL → { code: 'PILE_EMPTY', message: 'Cannot pick up an empty pile' }

NOTE: No legality check. Pickup is always voluntary. A player can pick up even
if they have a legal play available.
```

### 4.5 DECLARE_DIRECTION Validation

```
3a. Is the direction valid?
    action.direction must be 'higher' or 'lower'.
    ├─ FAIL → { code: 'INVALID_DIRECTION', message: 'Direction must be higher or lower' }

3b. Is this the player who played the Queen?
    action.playerId must be the current player (already checked in universal step 1c,
    but for DECLARE_DIRECTION, the "current player" is the Queen player, which is
    state.turnOrder[state.currentPlayerIndex]).
    ├─ FAIL → { code: 'NOT_QUEEN_PLAYER', message: 'Only the Queen player can declare direction' }
```

### 4.6 TIMEOUT_FORFEIT Validation

```
No action-specific checks beyond the universal and phase checks.
TIMEOUT_FORFEIT is a system-generated action from the Game Clock.
The playerId must match the current player (the one who timed out).
```

### 4.7 CANCEL_GAME Validation

```
No validation checks. CANCEL_GAME is always valid in any phase.
It can be triggered by:
- Disconnect timeout (system action).
- Admin action.
```

---

## 5. Edge Cases & Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Play a card when game is finished | `{ valid: false, code: 'GAME_NOT_ACTIVE' }` |
| 2 | Play a card when it is not your turn | `{ valid: false, code: 'NOT_YOUR_TURN' }` |
| 3 | Play a card that is not in your hand | `{ valid: false, code: 'CARDS_NOT_IN_ZONE' }` |
| 4 | Play two cards of different ranks | `{ valid: false, code: 'CARDS_NOT_SAME_RANK' }` |
| 5 | Play a 5 on a 7 (rank too low, default direction) | `{ valid: false, code: 'CARD_NOT_LEGAL' }` |
| 6 | Play a 2 on any card | `{ valid: true }` — 2 is always legal |
| 7 | Play a Joker on any card | `{ valid: true }` — Joker is always legal |
| 8 | Play a card during 'awaiting_queen_declaration' phase | `{ valid: false, code: 'WRONG_PHASE' }` |
| 9 | Declare direction during 'playing' phase | `{ valid: false, code: 'WRONG_PHASE' }` |
| 10 | Pick up empty pile | `{ valid: false, code: 'PILE_EMPTY' }` |
| 11 | Blind play from hand zone (active zone is not faceDown) | `{ valid: false, code: 'NOT_IN_FACEDOWN_ZONE' }` |
| 12 | Blind play with cardIndex = 5 when faceDownCards has 3 | `{ valid: false, code: 'CARD_INDEX_OUT_OF_BOUNDS' }` |
| 13 | Play cards during 'awaiting_post_clear_play' phase | `{ valid: true }` — this phase accepts plays (player must play again after King/Sbobuz) |
| 14 | Declare direction 'higher' | `{ valid: true }` |
| 15 | Declare direction 'lower' | `{ valid: true }` |
| 16 | Declare invalid direction 'sideways' | `{ valid: false, code: 'INVALID_DIRECTION' }` |
| 17 | Play a card with freePlay active (any card legal) | `{ valid: true }` |
| 18 | Play a K on Q with Queen 'lower' override | K ordinal 11 > Q ordinal 10 → `{ valid: false, code: 'CARD_NOT_LEGAL' }` |
| 19 | Play a J on Q with Queen 'lower' override | J ordinal 9 <= Q ordinal 10 → `{ valid: true }` |
| 20 | Cancel game when game is already finished | `{ valid: true }` — CANCEL_GAME always valid |
| 21 | Play empty card list (cardIds = []) | `{ valid: false, code: 'EMPTY_CARD_LIST' }` |
| 22 | Player who has finished tries to play | `{ valid: false, code: 'PLAYER_FINISHED' }` |
| 23 | Play two Jokers together | `{ valid: false, code: 'CARDS_NOT_SAME_RANK' }` — Jokers have no rank, cannot share a rank |
| 24 | PLAY_CARDS from faceDown zone | `{ valid: false, code: 'CARDS_NOT_IN_ZONE' }` — must use PLAY_BLIND for face-down cards |
| 25 | Play face-up card when active zone is face-up | `{ valid: true }` — same legality rules apply to face-up plays |
| 26 | Play multiple same-rank face-up cards | `{ valid: true }` — multi-play allowed from face-up zone |

---

## 6. Integration Points

### 6.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| Realtime Module (via orchestration layer) | `validateAction(state, action)` | Current GameState, incoming GameAction |

### 6.2 Outbound

| Target | Interface | Data |
|--------|-----------|------|
| Active Zone Resolver | `getActiveZone(player, drawPileEmpty)` | PlayerState, boolean |
| Rank Comparator | `isCardLegal(card, context)` | Card, ComparisonContext |

### 6.3 Side Effects

None. This is a pure function.

---

## 7. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Should the validator check Sbobuz conditions? | No. Sbobuz is a post-play condition checked by the State Reducer. The validator only checks pre-play legality. | Sbobuz cannot be predicted before cards land on the pile. It is a consequence, not a precondition. |
| 2 | Should the validator check card effects (Queen entering declaration phase, King clearing pile)? | No. Effects are the reducer's responsibility. The validator only determines if the action is ALLOWED. | Separation of concerns. "Can you do this?" vs "What happens when you do?" |
| 3 | Should PLAY_BLIND validate the revealed card's legality? | No. The card is revealed inside the reducer. The validator only checks that the player is in the face-down zone and the index is valid. | The consequence of an illegal blind play is different from a rejected action (pile pickup vs. action rejection). |
| 4 | Can a player play two Jokers together? | No. Multi-card plays require all cards to share the same rank. Jokers have no rank, so they cannot share a rank. | Consistent with the rank-based multi-play rule. Jokers are played one at a time. |
| 5 | Can a player PLAY_CARDS from the face-down zone? | No. Face-down cards must use PLAY_BLIND (select by index, not by card ID). | Players cannot see face-down cards, so they cannot select specific cards by ID. |

---

## 8. Implications for Architecture

1. **The Action Validator is the ONLY component that rejects player actions.** If an action passes the validator, the State Reducer processes it without further legality checks (except for blind play reveal, which has different consequences than rejection).

2. **The ValidationResult's error code is propagated to the Realtime Module** and sent to the client as part of the `game:action_rejected` event. The codes are designed to be programmatically useful for the client to show appropriate error UI.

3. **TIMEOUT_FORFEIT and CANCEL_GAME are system-generated actions** that bypass most validation. They are not player-initiated and are trusted inputs from the Game Clock and server infrastructure respectively.

4. **The validator's dependency on Active Zone Resolver and Rank Comparator is intentional.** These are the two pieces of logic needed to answer "can this player play this card right now?" The validator does not duplicate their logic — it delegates.
