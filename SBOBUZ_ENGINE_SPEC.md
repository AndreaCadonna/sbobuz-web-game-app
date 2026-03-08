# Sbobuz — Game Engine Specification

> **Document Type:** Engine Design Specification
> **Status:** v1.2 — Complete. All design questions resolved. Implementation-ready.
> **Last Updated:** March 2026

---

## 1. Game Overview

Sbobuz is a turn-based card game played with a standard poker deck plus two jokers (54 cards total). Players race to be the first to empty all their cards across three zones: hand, face-up table cards, and face-down table cards.

The core mechanic is simple: play a card equal to or higher than the previous one, or pick up the pile. Special cards break, bend, or invert that rule. The Sbobuz — four of a kind on the pile — is the signature play that clears everything and reverses the game.

**Player count:** 2–5.

**Win condition:** First player to empty all three card zones wins.

---

## 2. Deck Composition

| Cards | Count | Notes |
|---|---|---|
| Standard ranks (2–A) per suit | 52 | 4 suits × 13 ranks |
| Jokers | 2 | No suit, no rank. Unique IDs for tracking. |
| **Total** | **54** | |

---

## 3. Card Rank Hierarchy

From lowest to highest for the default "higher" comparison:

```
3 (lowest) → 4 → 5 → 6 → 7 → 8 → 9 → 10 → J → Q → K → A (highest)
```

**Cards with special behavior that bypass normal comparison:** 2, Queen, King, Joker.

The rank `2` is the *lowest numerical rank* but has a special effect that makes it playable on any card. Don't confuse rank position with playability — they are separate concerns.

---

## 4. Setup & Deal

1. Shuffle the full 54-card deck using a **seeded PRNG**. The seed is stored as part of the initial game state for deterministic replay.
2. For each player, in order:
   - Deal **3 cards face-down** on the table. These are hidden from everyone, including the owning player.
   - Deal **3 cards face-up** on top of the face-down cards. These are visible to all players.
   - Deal **3 cards to the player's hand**. Only the owning player can see these.
3. Remaining cards form the **draw pile** (face-down, center of table).
4. The play pile starts empty.
5. Determine starting player (see Starting Player Algorithm below).

**Card distribution per player:** 9 cards (3 + 3 + 3).
- 2 players: 18 cards dealt, 36 in draw pile.
- 3 players: 27 cards dealt, 27 in draw pile.
- 4 players: 36 cards dealt, 18 in draw pile.
- 5 players: 45 cards dealt, 9 in draw pile.

### 4.1 Starting Player Algorithm

The starting player is determined by who holds the lowest cards in hand. This is a multi-step tiebreaker:

**Step 1 — Compare lowest card.** Each player sorts their 3-card hand by rank (ascending). Compare the lowest card across all players. The player with the single lowest card starts.

**Step 2 — Tiebreaker: second-lowest card.** If two or more players share the same lowest card rank, compare their second-lowest card. The player with the lower second card starts.

**Step 3 — Tiebreaker: third-lowest card.** If still tied, compare the third card in hand.

**Step 4 — Tiebreaker: positional advantage (2 players only).** If exactly two players have identical hand rankings (same three ranks), choose the starting player whose position in the seating order lets the other tied player play soonest after them. If **3 or more** players are tied after step 3, skip directly to step 5 (random).

**Step 5 — Final tiebreaker: random.** If tied players are equidistant (e.g., seated directly opposite in a 4-player game), select randomly among them using the seeded PRNG.

```typescript
// Pseudocode for starting player selection
function determineStartingPlayer(players: PlayerState[], rng: SeededRNG): string {
  // Sort each player's hand by rank ascending
  // Compare hands lexicographically (lowest card first)
  // If tied: choose player whose seat lets other tied players follow soonest
  // If still tied: rng.pick(tiedPlayers)
}
```

**Note:** Only hand cards participate in this comparison. Face-up and face-down cards are irrelevant for starting player selection.

---

## 5. Core Game Rules

### 5.1 Turn Structure

On their turn, a player must do **one** of the following:

1. **Play one or more cards** of the same rank from their active zone onto the play pile.
2. **Pick up the entire play pile** into their hand (always voluntary — a player can pick up even if they have a legal play).

After playing a card (not picking up):
- If the player's hand has **fewer than 3 cards** and the **draw pile is not empty**, draw cards until the hand has 3 or the draw pile is exhausted.
- The turn passes to the next player in turn order (unless a special effect grants another turn).

### 5.2 Card Legality — The Comparison Rule

A card is **legal to play** if any of the following are true:

| Condition | Description |
|---|---|
| **Play pile is empty** | Any card can be played. |
| **Free play flag is active** | Set by a previously played 2 or Joker. Any card can be played. Flag is consumed. |
| **Queen override is active ("lower")** | Card must be equal to or lower than the pile top. Flag is consumed after this play. |
| **Default rule ("higher")** | Card must be equal to or higher in rank than the pile top. |
| **Card is a 2** | Always legal, regardless of pile top. |
| **Card is a Joker** | Always legal, regardless of pile top. |

When playing **multiple cards of the same rank**, legality is checked once against the shared rank.

### 5.3 Active Zone Progression

A player's cards exist in three zones, played in strict order:

```
HAND → FACE-UP → FACE-DOWN → (empty = win)
```

| Zone | Visibility | Selection | When Active |
|---|---|---|---|
| **Hand** | Private (only owner sees) | Player chooses which card(s) to play | While hand is non-empty, OR while draw pile is non-empty (will refill) |
| **Face-Up** | Public (all players see) | Player chooses which card(s) to play | Hand is empty AND draw pile is empty |
| **Face-Down** | Hidden (nobody sees) | Player picks a **position** (index), card is revealed | Hand empty, face-up empty, draw pile empty |

**Critical:** Zone transitions are not one-way. If a player in the face-down zone fails a blind play or picks up the pile, cards go into their **hand**, reverting them to the hand zone. The active zone is always **recomputed from the current state**, not tracked as a forward-only progression.

```
activeZone = 
  hand.length > 0 OR drawPile.length > 0  → 'hand'
  faceUp.length > 0                        → 'faceUp'
  faceDown.length > 0                      → 'faceDown'
  all empty                                → 'finished' (player wins)
```

### 5.4 Blind Play (Face-Down Cards)

When a player is in the face-down zone:

1. Player selects a card by **position** (index 0, 1, or 2) — they cannot see the card values.
2. The card is **revealed** to all players.
3. The engine checks legality of the revealed card against the pile top.
   - **Legal:** Card is played normally. All special effects apply (Sbobuz check, card effects, etc.).
   - **Illegal:** The revealed card is placed on the play pile, then the player **picks up the entire play pile** (including the just-revealed card) into their hand. Their active zone reverts to **hand**.

### 5.5 Drawing Cards

After a player plays a card (not after picking up the pile):
- If `hand.length < 3` AND `drawPile.length > 0`: draw cards from the draw pile until `hand.length === 3` or the draw pile is empty.
- If `hand.length >= 3` after playing: no draw.

---

## 6. Special Cards

### 6.1 Card: 2 — The Wild Reset

| Property | Value |
|---|---|
| **Rank position** | Lowest numerical rank |
| **Playability** | Can be played on top of **any** card, regardless of pile top or direction |
| **Effect** | Sets `freePlay = true` — the **next** player can play any card |
| **Duration** | Single-use flag, consumed on the next play |

### 6.2 Card: Queen — Direction Override

| Property | Value |
|---|---|
| **Rank position** | Between Jack and King in the hierarchy |
| **Playability** | Normal comparison rules (must be equal or higher/lower than pile top) |
| **Effect** | Player declares whether the **next** card must be **higher** or **lower** (equal is always permitted) |
| **Duration** | Single-use flag, consumed on the next play |
| **Game phase** | After playing a Queen, the game enters `awaiting_queen_declaration` phase. The player who played the Queen declares direction, then the turn advances. |

If the player declares "higher," no flag is set (higher is already the default). If "lower," the `nextCardOverride` flag is set to `'lower'` and consumed by the next play.

### 6.3 Card: King — Pile Clear + Play Again

| Property | Value |
|---|---|
| **Rank position** | Second highest (below Ace) |
| **Playability** | Normal comparison rules |
| **Effect** | Clears (burns) the entire play pile. The player who played the King **must play another card** immediately. |
| **Duration** | Immediate. Game enters `awaiting_post_clear_play` phase. |
| **Edge case** | If the player has no remaining cards after playing the King, they win (win condition checked before requiring another play). |
| **Edge case** | Playing a King on an empty pile still grants another play. |
| **Edge case** | Playing another King as the follow-up triggers another clear + play again (chainable). |

### 6.4 Card: Joker — Wild Reset + Direction Reversal

| Property | Value |
|---|---|
| **Playability** | Can be played on top of **any** card (same as 2) |
| **Effect** | Sets `freePlay = true` (same as 2) AND **reverses the turn order** |
| **Duration** | `freePlay` is single-use. Turn reversal is permanent until another reversal. |

### 6.5 Sbobuz — Four of a Kind

**This is not a card — it's a pile condition.** Sbobuz triggers when the **top four cards of the play pile share the same rank**, regardless of how they got there.

| Property | Value |
|---|---|
| **Trigger** | Top 4 cards on play pile are the same rank (checked after every card placement) |
| **Effect** | Burns the entire play pile. Reverses turn order. The player who completed the Sbobuz plays again. |
| **Priority** | **Highest.** Sbobuz overrides ALL individual card effects. Four Queens = Sbobuz, not a Queen effect. Four 2s = Sbobuz, not a free-play effect. |
| **Accumulation** | Can build across multiple players' turns. Player A plays one 7, Player B plays one 7, Player C plays two 7s = Sbobuz triggered by Player C. |
| **Joker exclusion** | Jokers have no rank. They cannot contribute to or trigger a Sbobuz. |

**Detection logic:** After any card(s) are added to the play pile, check if the top 4 cards exist and share the same rank. If yes, Sbobuz triggers.

---

## 7. Effect Priority & Resolution Order

When cards land on the play pile, the engine resolves effects in this exact order:

```
STEP 1 — SBOBUZ CHECK (highest priority)
    Are the top 4 cards of the pile the same rank?
    ├─ YES → Burn pile. Reverse turn direction. Same player plays again.
    │        STOP. No individual card effect resolves.
    └─ NO  → Continue to Step 2.

STEP 2 — INDIVIDUAL CARD EFFECT
    What rank was played?
    ├─ 2      → Set freePlay = true (next player can play anything)
    ├─ Joker  → Set freePlay = true + reverse turn direction
    ├─ Queen  → Enter 'awaiting_queen_declaration' phase
    ├─ King   → Burn pile. Enter 'awaiting_post_clear_play' phase (play again)
    └─ Other  → No special effect

STEP 3 — DRAW PHASE
    Does the player's hand have fewer than 3 cards AND is the draw pile non-empty?
    ├─ YES → Draw until hand = 3 or draw pile empty
    └─ NO  → Skip

STEP 4 — ZONE TRANSITION
    Recompute active zone based on current card distribution.

STEP 5 — WIN CONDITION
    Are all of the player's zones empty?
    ├─ YES → Game over. This player wins.
    └─ NO  → Continue

STEP 6 — TURN ADVANCE
    Unless a special effect grants another turn (King clear, Sbobuz):
    → Advance to next player in current turn direction.
```

The key invariant: **Sbobuz always wins.** If four of a kind lands on the pile, the individual card effects are irrelevant. The pile burns, direction flips, player goes again. End of story.

---

## 8. Game State Model

The game state is a single, serializable, immutable object that captures the complete truth of the game at any moment. No hidden state, no side channels. If you can't reconstruct the board from this object, something is missing.

```typescript
interface GameConfig {
  turnTimerSeconds: number;        // set by host during room creation
  disconnectGraceSeconds: number;  // how long to wait before cancelling
}

interface GameState {
  // --- Identity ---
  gameId: string;
  phase: GamePhase;
  config: GameConfig;

  // --- Deck & Piles ---
  drawPile: Card[];       // face-down draw deck (index 0 = top)
  playPile: Card[];       // center pile (last element = top)
  burnPile: Card[];       // removed cards (King clear, Sbobuz)

  // --- Players ---
  players: PlayerState[];
  turnOrder: string[];        // player IDs in current sequence
  currentPlayerIndex: number; // index into turnOrder
  turnDirection: 1 | -1;     // 1 = normal, -1 = reversed

  // --- Single-Use Flags ---
  freePlay: boolean;              // true = next card can be anything (2 / Joker effect)
  nextCardOverride: 'lower' | null; // Queen effect, consumed on next play

  // --- Metadata ---
  rngSeed: number;
  actionCount: number;
}

type GamePhase =
  | 'setup'
  | 'playing'
  | 'awaiting_queen_declaration'  // Queen played, waiting for direction choice
  | 'awaiting_post_clear_play'   // King/Sbobuz cleared pile, player plays again
  | 'finished'                    // normal end — a player won
  | 'cancelled';                  // aborted — disconnect timeout, etc.

interface PlayerState {
  id: string;
  hand: Card[];           // private, player chooses
  faceUpCards: Card[];    // public, player chooses
  faceDownCards: Card[];  // hidden, player picks by position
}
```

### Card Model

```typescript
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface StandardCard {
  type: 'standard';
  rank: Rank;
  suit: Suit;
  id: string;   // unique identifier for tracking (e.g., "hearts_7")
}

interface JokerCard {
  type: 'joker';
  id: 'joker_1' | 'joker_2';
}

type Card = StandardCard | JokerCard;
```

### Derived State (Computed, Never Stored)

These values are computed from the state, not stored in it:

```typescript
function getActiveZone(player: PlayerState, drawPileEmpty: boolean): ActiveZone {
  if (player.hand.length > 0 || !drawPileEmpty) return 'hand';
  if (player.faceUpCards.length > 0) return 'faceUp';
  if (player.faceDownCards.length > 0) return 'faceDown';
  return 'finished';
}

function getPlayPileTopCard(playPile: Card[]): Card | null {
  return playPile.length > 0 ? playPile[playPile.length - 1] : null;
}

function getCurrentPlayer(state: GameState): PlayerState {
  const playerId = state.turnOrder[state.currentPlayerIndex];
  return state.players.find(p => p.id === playerId);
}
```

---

## 9. Action Types

Every player intent is a typed, validated action. The engine accepts only these shapes.

```typescript
type GameAction =
  | PlayCardsAction
  | PlayBlindAction
  | PickUpPileAction
  | DeclareDirectionAction
  | TimeoutForfeitAction
  | CancelGameAction;

interface PlayCardsAction {
  type: 'PLAY_CARDS';
  playerId: string;
  cardIds: string[];       // one or more cards of the same rank
}

interface PlayBlindAction {
  type: 'PLAY_BLIND';
  playerId: string;
  cardIndex: number;       // position in faceDownCards array (0, 1, or 2)
}

interface PickUpPileAction {
  type: 'PICK_UP_PILE';
  playerId: string;
}

interface DeclareDirectionAction {
  type: 'DECLARE_DIRECTION';
  playerId: string;
  direction: 'higher' | 'lower';
}

interface TimeoutForfeitAction {
  type: 'TIMEOUT_FORFEIT';
  playerId: string;
}

interface CancelGameAction {
  type: 'CANCEL_GAME';
  reason: 'disconnect_timeout' | 'admin';
  disconnectedPlayerId?: string;
}
```

---

## 10. Action Validation Rules

Every action passes through the validator before reaching the reducer. Rejected actions never touch the state.

### 10.1 Universal Checks (All Actions)

- Is the game phase compatible with this action type?
- Is it this player's turn (or this player's pending declaration)?
- Is the player still in the game (not finished)?

### 10.2 PLAY_CARDS

- Are all specified cards in the player's current active zone?
- Are all specified cards the **same rank**?
- Is the rank legal given the current pile top and active flags?
  - `freePlay === true` → any rank legal
  - `nextCardOverride === 'lower'` → rank must be ≤ pile top
  - Default → rank must be ≥ pile top
  - Card is a 2 or Joker → always legal
  - Pile is empty → always legal
- Is the game phase `'playing'` or `'awaiting_post_clear_play'`?

### 10.3 PLAY_BLIND

- Is the player's active zone `'faceDown'`?
- Is the `cardIndex` within bounds of `faceDownCards`?
- Game phase must be `'playing'` or `'awaiting_post_clear_play'`.
- **Note:** The revealed card's legality is NOT checked here. It's checked after reveal inside the reducer, with different consequences (pile pickup on failure).

### 10.4 PICK_UP_PILE

- Is the play pile non-empty? (Can't pick up nothing.)
- Game phase must be `'playing'`.
- **No legality check required** — pickup is always voluntary.

### 10.5 DECLARE_DIRECTION

- Game phase must be `'awaiting_queen_declaration'`.
- Must be the player who played the Queen.
- Direction must be `'higher'` or `'lower'`.

---

## 11. State Reducer — Complete Logic

The reducer is a pure function: `(currentState, validatedAction) → newState`. No mutations. No side effects. Deterministic.

### 11.1 PLAY_CARDS

```
1. Remove card(s) from player's active zone.
2. Push card(s) onto playPile.
3. Consume single-use flags (nextCardOverride → null, freePlay → false).
4. SBOBUZ CHECK: top 4 cards of pile share same rank?
   ├─ YES:
   │   a. Move entire playPile to burnPile.
   │   b. Flip turnDirection (×= -1).
   │   c. Set phase = 'awaiting_post_clear_play'.
   │   d. SKIP individual card effects. Go to step 6.
   └─ NO: continue.
5. Resolve individual card effect:
   ├─ 2         → freePlay = true
   ├─ Joker     → freePlay = true, turnDirection *= -1
   ├─ Queen     → phase = 'awaiting_queen_declaration'. STOP (no draw, no advance).
   ├─ King      → move playPile to burnPile, phase = 'awaiting_post_clear_play'.
   └─ Other     → no effect.
6. DRAW PHASE: while hand.length < 3 AND drawPile not empty → draw.
7. Recompute activeZone.
8. WIN CHECK: all zones empty?
   ├─ YES → phase = 'finished'. Record winner. STOP.
   └─ NO  → continue.
9. If phase is 'awaiting_post_clear_play' → same player plays again. STOP.
10. Advance currentPlayerIndex by turnDirection (wrapping).
```

### 11.2 PLAY_BLIND

```
1. Remove card at faceDownCards[cardIndex]. This is the revealed card.
2. Push revealed card onto playPile.
3. Check legality of revealed card vs pile top (using same rules as PLAY_CARDS validation):
   ├─ LEGAL:
   │   Continue from PLAY_CARDS step 3 (consume flags, Sbobuz check, effects, etc.)
   └─ ILLEGAL:
       a. Move entire playPile (including the revealed card) into player's hand.
       b. Clear playPile.
       c. Clear freePlay and nextCardOverride flags.
       d. Recompute activeZone (now 'hand').
       e. Advance to next player.
```

### 11.3 PICK_UP_PILE

```
1. Move entire playPile into player's hand.
2. Clear playPile.
3. Clear freePlay and nextCardOverride flags.
4. Recompute activeZone (now 'hand').
5. Advance to next player.
```

### 11.4 DECLARE_DIRECTION

```
1. If direction === 'lower' → set nextCardOverride = 'lower'.
   If direction === 'higher' → nextCardOverride stays null (higher is default).
2. Set phase = 'playing'.
3. DRAW PHASE (for the Queen player): while hand.length < 3 AND drawPile not empty → draw.
4. Recompute activeZone.
5. WIN CHECK: all zones empty?
   ├─ YES → phase = 'finished'. Record winner. STOP.
   └─ NO  → Advance to next player.
```

---

## 12. Sbobuz Detection

Sbobuz is a **pile condition**, not a card type. It's checked after every card placement.

```typescript
function checkSbobuz(playPile: Card[]): boolean {
  if (playPile.length < 4) return false;

  const topFour = playPile.slice(-4);

  // Jokers cannot contribute to Sbobuz
  if (topFour.some(c => c.type === 'joker')) return false;

  // All four must share the same rank
  const rank = topFour[0].rank;
  return topFour.every(c => c.type === 'standard' && c.rank === rank);
}
```

**Accumulation scenarios:**

| Turn Sequence | Result |
|---|---|
| P1 plays 7, P2 plays 7, P3 plays two 7s | Sbobuz — P3 triggered it |
| P1 plays three 9s onto a pile with one 9 on top | Sbobuz — P1 triggered it |
| P1 plays 7, P2 plays Joker, P3 plays 7 | NOT Sbobuz — Joker breaks the sequence |
| P1 plays four 5s at once | Sbobuz — immediate |

---

## 13. Turn Advancement

```typescript
function advanceTurn(state: GameState): number {
  const playerCount = state.turnOrder.length;
  return ((state.currentPlayerIndex + state.turnDirection) % playerCount + playerCount) % playerCount;
}
```

The double-modulo handles negative indices when `turnDirection === -1`.

**Turn direction reversals** (Joker, Sbobuz) are permanent until the next reversal. They don't reset on pile clear or any other event. Multiple reversals cancel out: `turnDirection *= -1` applied twice returns to the original direction.

---

## 14. Seeded RNG

All randomness in the engine flows through a seeded pseudorandom number generator. The seed is stored in the initial game state.

**Where RNG is used:**
- Deck shuffle during setup.
- Starting player selection (if random).
- No other randomness exists after setup (the game is fully deterministic from the action sequence).

**Why this matters:**
- **Replay:** Given the seed and action log, the entire game can be reconstructed move by move.
- **Debugging:** Any bug can be reproduced deterministically.
- **Spectator mode:** Late joiners receive the current state; the full history is replayable.

`Math.random()` is **never called** inside the engine. All random operations use the seeded generator.

---

## 15. Event-Sourced Architecture

The game engine is event-sourced. Game state is **never mutated in place**. Every action produces a new immutable state. The game is a sequence of `(action, resultingState)` pairs.

```
State₀ → Action₁ → State₁ → Action₂ → State₂ → ... → Stateₙ (terminal)
```

### Action Log

Every action and its resulting state are appended to an ordered log:

```typescript
interface ActionLogEntry {
  index: number;          // monotonic sequence number
  action: GameAction;
  resultingState: GameState;
  timestamp: string;      // ISO 8601 — wall clock, not used for logic
}
```

### What Event Sourcing Enables

| Capability | How |
|---|---|
| **Replay** | Feed action log into engine from State₀ to reconstruct any point |
| **Spectator mode** | Send current state to late joiners, then stream live actions |
| **Disconnect recovery** | Player reconnects → server sends current state (full rehydration) |
| **Debugging** | Full action history for every game, deterministically reproducible |
| **Undo (if rules allow)** | Pop last action, revert to previous state |
| **Post-game analysis** | Walk through any game move by move |

### Storage Strategy

- **During game:** Active state lives in-memory on the server process, periodically snapshotted to Redis.
- **After game:** Complete action log persisted to PostgreSQL for history, replay, and debugging.

---

## 16. Core Engine Components

| Component | Responsibility | Pure Function? |
|---|---|---|
| **State Factory** | Creates the initial game state from player list + RNG seed. Handles deck creation, shuffle, and deal. | Yes |
| **Action Validator** | Takes `(state, action)` → returns `valid` or `rejected with reason`. Every rule that says "you can't do that" lives here. | Yes |
| **State Reducer** | Takes `(state, validatedAction)` → returns new state. The heart of the engine. Contains effect resolution, Sbobuz detection, draw logic, zone transitions, win checks. | Yes |
| **Sbobuz Detector** | Checks if top 4 pile cards share a rank. Called by the reducer after every card placement. | Yes |
| **Rank Comparator** | Compares card ranks given the current direction context. Handles the rank hierarchy and special-card overrides. | Yes |
| **Turn Manager** | Computes next player index given current index and turn direction. Handles wraparound. | Yes |
| **Win Condition Evaluator** | Checks if a player has emptied all zones. Called after every state transition. | Yes |
| **Active Zone Resolver** | Determines which zone a player should play from given their card distribution and draw pile status. | Yes |
| **RNG Module** | Seeded PRNG for shuffle and starting player selection. Deterministic given the same seed. | Yes |
| **Game Clock** | Turn timers (configurable per room), inactivity timeout, disconnect grace period, auto-forfeit, game cancellation. The only component that introduces real time. Generates synthetic actions (`TIMEOUT_FORFEIT`) fed into the engine. | No (time-dependent) |
| **Action Logger** | Appends `(action, resultingState)` to the ordered game log. | Side-effecting |

**Key architectural property:** Every component except the Game Clock and Action Logger is a pure function. Same inputs, same outputs, every time. This makes the engine trivially testable and fully deterministic.

---

## 17. Edge Cases & Test Scenarios

These are the compound scenarios that should have explicit test coverage from day one.

| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Player plays a 2 on top of three 2s on pile | Sbobuz triggers. Pile burns, direction reverses, player goes again. No freePlay is set (Sbobuz overrides). |
| 2 | Four Queens played/accumulated on pile | Sbobuz triggers. No queen direction declaration. Sbobuz overrides all card effects. |
| 3 | Player plays Queen, declares "lower," next player plays a 2 | Legal — 2 is always playable. `nextCardOverride` consumed. 2 sets `freePlay = true` for the player after. |
| 4 | King clears pile, follow-up is another King | Second King clears empty pile (no-op on burn), player must play again. Chainable indefinitely. |
| 5 | King is played as last card — player has no cards left | Win condition checked before requiring post-clear play. Player wins. |
| 6 | Blind play reveals illegal card | Card goes on pile, then player picks up entire pile (including revealed card) into hand. Active zone reverts to hand. |
| 7 | Blind play reveals a Queen (legal) | Queen effect triggers normally. Game enters `awaiting_queen_declaration` for that player. |
| 8 | Blind play reveals a King (legal) | King effect triggers. Pile clears. Player must play again (now from hand if they picked up, or next face-down). |
| 9 | Player picks up pile with special cards in it | Cards go into hand. No effects trigger — effects only fire on play. |
| 10 | Sbobuz completed across multiple turns | Sbobuz triggered by the player who completes the four-of-a-kind, not the player who started the sequence. |
| 11 | Joker reverses direction, then Sbobuz also reverses | Two reversals = back to original direction. `turnDirection *= -1` applied twice. |
| 12 | Player plays Joker, pile now has 4 of same rank underneath | Joker has no rank → cannot be part of Sbobuz. Only the 4 standard cards below it matter. But the Joker is now on top, so the top-4 check looks at Joker + 3 cards = NOT Sbobuz. The Joker breaks the sequence on the pile top. |
| 13 | Draw pile empties mid-hand | Player keeps 1-2 cards in hand, plays them out, then transitions to face-up zone. No draw after playing. |
| 14 | Player in face-up zone plays multiple same-rank cards | Legal — same multi-play rule applies to face-up cards. |
| 15 | Player picks up pile while in face-up zone | Pile goes to hand. Active zone reverts to hand. |
| 16 | Last two players, one finishes | Remaining player doesn't need to play. Game ends immediately when first player empties all zones. |
| 17 | Sbobuz on empty pile | Impossible — pile needs at least 4 cards. After a clear, pile is empty. |
| 18 | Queen played, player declares "lower," pile is then cleared by another player's King before the "lower" target plays | `nextCardOverride` flag is still set. But the pile is empty, so any card is legal regardless. Flag consumed on next play (even though it had no effect). |
| 19 | Player voluntarily picks up a small pile for strategic reasons | Legal — pickup is always voluntary. No "you have a legal play" check. |
| 20 | All cards of a rank are split across face-down cards of different players | Those ranks can never form a Sbobuz on the pile (since face-down plays are one at a time and turns alternate). Not a bug — just a game state reality. |

---

## 18. Client-Server Contract

The client is a **renderer only**. It never computes game logic.

| Responsibility | Server | Client |
|---|---|---|
| Game state computation | ✅ Sole authority | ❌ Never |
| Move validation | ✅ Rejects illegal actions | Optional (for UX hints only) |
| Randomness | ✅ Seeded PRNG | ❌ Never |
| Card visibility | ✅ Sends only what each player should see | ✅ Displays what it receives |
| Effect resolution | ✅ All effects computed server-side | ❌ Animates results |
| State storage | ✅ In-memory + Redis snapshots | ❌ Ephemeral render state only |

**What the server sends to each client:**
- The player's own hand (visible).
- All players' face-up cards (visible).
- Face-down card **count** per player (not the card values).
- Play pile top card (or top N for animation).
- Draw pile card count.
- Current player, turn direction, phase, flags.
- All other players' hand card **count** (not values).

**What the server never sends:**
- Other players' hand contents.
- Any player's face-down card values (until revealed by blind play).
- The draw pile card order.

---

## 19. Integration Points

The game engine is a pure logic module that integrates with the broader platform:

```
Realtime Module (WebSocket) → receives player actions
    → Game Engine (validate + reduce) → returns new state
        → Realtime Module → broadcasts state to room
        → Action Logger → appends to game log
        → Redis → snapshots active state
        → PostgreSQL (on game end) → persists final log
```

The engine has **no knowledge** of WebSockets, HTTP, databases, or any I/O. It takes a state and an action, returns a new state. Everything else is plumbing that wraps it.

---

## 20. Resolved Design Decisions

All open questions have been closed. These are the final rulings:

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Starting player selection | Lowest card in hand, with lexicographic tiebreaker (2nd, 3rd card), then positional advantage for exactly 2 tied players, then seeded random for 3+ ties or equidistant players | Rewards low cards in hand; deterministic except in true ties |
| 2 | Player disconnect | Grace period to reconnect. If timer expires, game is **cancelled** (not forfeited). | Prevents unfair wins from network issues. Cancelled games don't affect ratings. |
| 3 | Turn timer | **Configurable per room/lobby.** Set by host when creating the room. | Different play styles — casual rooms want longer timers, competitive wants shorter. |
| 4 | Spectator mode | **No spectators for now.** Not in scope for initial release. | Reduces complexity in the realtime module. Can be added later since event-sourced architecture supports it naturally. |
| 5 | Minimum players | **2** | Minimum viable game. |
| 6 | Maximum players | **5** | 5 players = 9 cards in draw pile. 6 would leave 0 draw pile, removing the draw mechanic entirely. |
| 7 | Supported games | **Sbobuz only.** | No need for a generic card game engine abstraction. Build for Sbobuz, extract generic pieces later only if a second game is added. |
| 8 | Multi-card face-up play | **Yes.** Same rule as hand — multiple face-up cards of the same rank can be played together. | Consistent rule across hand and face-up zones. Face-down is one-at-a-time by nature (blind). |

### Implications for Architecture

- **Sbobuz-only scope** means the engine interfaces don't need to be generic. No strategy pattern for "game rules" — the rules are Sbobuz, hardcoded and well-tested.
- **No spectators** means the realtime module only broadcasts to players in the game room. No read-only socket connections.
- **Configurable turn timer** means the `GameClock` component receives its timeout duration from room configuration, not from a global constant. The room config is set during lobby phase and immutable once the game starts.
- **Game cancellation on disconnect** means we need a `'cancelled'` terminal state in addition to `'finished'`. Cancelled games are stored for debugging but don't count for leaderboards or ELO.

### Updated GamePhase Type

```typescript
type GamePhase =
  | 'setup'
  | 'playing'
  | 'awaiting_queen_declaration'
  | 'awaiting_post_clear_play'
  | 'finished'                     // normal game end — someone won
  | 'cancelled';                   // game aborted (disconnect timeout, etc.)
```

### Updated GameState — Room Config

```typescript
interface GameConfig {
  turnTimerSeconds: number;        // configurable per room
  disconnectGraceSeconds: number;  // how long to wait before cancelling
  maxPlayers: 5;                   // fixed at 5
  minPlayers: 2;                   // fixed at 2
}

interface GameState {
  // ... all existing fields ...
  config: GameConfig;
}
```

---
