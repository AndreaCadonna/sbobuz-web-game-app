# Sbobuz Detector — Four-of-a-Kind Pile Condition Check

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Section 12

---

## 1. Overview

The Sbobuz Detector checks whether the top four cards of the play pile share the same rank — the "Sbobuz" condition. This is the signature mechanic of the game: when four of a kind land on the pile, the pile burns, the turn direction reverses, and the completing player plays again.

Sbobuz is a pile condition, not a card type. It is checked after every card placement. Jokers cannot contribute to or trigger a Sbobuz because they have no rank.

The Sbobuz check has the **highest priority** in the effect resolution order. If a Sbobuz triggers, all individual card effects (2's freePlay, Queen's direction, King's clear) are overridden and do not resolve.

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * Result of a Sbobuz detection check.
 */
interface SbobuzCheckResult {
  /** Whether a Sbobuz (four of a kind) was detected. */
  triggered: boolean;

  /**
   * The rank that triggered the Sbobuz, if triggered.
   * null if not triggered.
   */
  rank: Rank | null;
}
```

### 2.2 Types Referenced from Parent Spec

- `Card`, `StandardCard`, `JokerCard` — cards in the play pile
- `Rank` — the rank being matched

---

## 3. Public Interface

```typescript
/**
 * Checks if the top 4 cards of the play pile share the same rank.
 * The play pile convention: last element is the top card (most recently played).
 *
 * @param playPile - The play pile array. Last element = top.
 * @returns SbobuzCheckResult indicating whether Sbobuz triggered and which rank.
 */
function checkSbobuz(playPile: readonly Card[]): SbobuzCheckResult;
```

---

## 4. Behavior Rules

### 4.1 Detection Algorithm

```
1. If playPile.length < 4 → return { triggered: false, rank: null }.

2. Extract the top 4 cards: playPile.slice(-4).

3. If any of the top 4 cards is a Joker → return { triggered: false, rank: null }.
   (Jokers have no rank and cannot participate in Sbobuz.)

4. All 4 cards are StandardCards. Extract their ranks.

5. If all 4 ranks are identical → return { triggered: true, rank: topFour[0].rank }.

6. Otherwise → return { triggered: false, rank: null }.
```

### 4.2 Sbobuz Priority

When Sbobuz triggers, the State Reducer must:
1. Move the entire play pile to the burn pile.
2. Reverse the turn direction (`turnDirection *= -1`).
3. Grant the completing player another turn (enter `'awaiting_post_clear_play'` phase).
4. **Skip all individual card effects.** Four Queens = Sbobuz, not a Queen effect. Four 2s = Sbobuz, not a freePlay effect.

The Sbobuz Detector itself does not perform these actions. It only detects. The State Reducer acts on the result.

### 4.3 Accumulation

Sbobuz can build across multiple players' turns. The detector does not care who played which card — it only examines the current pile state.

### 4.4 Joker Exclusion

A Joker anywhere in the top 4 cards prevents Sbobuz detection. Even if the other 3 cards share a rank, the Joker breaks the sequence. This is because:
- Jokers have no rank to compare.
- The rule requires four cards of the **same rank**, and "no rank" is not a rank.

---

## 5. Edge Cases & Test Scenarios

| # | Scenario | Play Pile (top = rightmost) | Expected Result |
|---|----------|----------------------------|-----------------|
| 1 | Four 7s on top | `[..., 7h, 7d, 7c, 7s]` | `{ triggered: true, rank: '7' }` |
| 2 | Three 7s (not enough) | `[..., 7h, 7d, 7c]` | `{ triggered: false, rank: null }` |
| 3 | Pile has fewer than 4 cards | `[5h, 5d, 5c]` | `{ triggered: false, rank: null }` |
| 4 | Empty pile | `[]` | `{ triggered: false, rank: null }` |
| 5 | Four different ranks on top | `[..., 3h, 5d, 7c, 9s]` | `{ triggered: false, rank: null }` |
| 6 | Joker in top 4 breaks Sbobuz | `[..., 7h, joker_1, 7c, 7s]` | `{ triggered: false, rank: null }` |
| 7 | Joker on top, three 7s below | `[..., 7h, 7d, 7c, joker_1]` | `{ triggered: false, rank: null }` |
| 8 | Four 2s (special card, still Sbobuz) | `[..., 2h, 2d, 2c, 2s]` | `{ triggered: true, rank: '2' }` |
| 9 | Four Queens (Sbobuz overrides Queen effect) | `[..., Qh, Qd, Qc, Qs]` | `{ triggered: true, rank: 'Q' }` |
| 10 | Four Kings (Sbobuz overrides King clear) | `[..., Kh, Kd, Kc, Ks]` | `{ triggered: true, rank: 'K' }` |
| 11 | Four Aces | `[..., Ah, Ad, Ac, As]` | `{ triggered: true, rank: 'A' }` |
| 12 | Sbobuz built across turns: 7, 7, then two 7s played | `[..., 7h, 7d, 7c, 7s]` | `{ triggered: true, rank: '7' }` — same as #1, detector does not care about who played what |
| 13 | Three 7s then a Joker on top | `[..., 7h, 7d, 7c, joker_2]` | `{ triggered: false, rank: null }` |
| 14 | Cards below top 4 are irrelevant | `[3h, 5d, 9c, 7h, 7d, 7c, 7s]` | `{ triggered: true, rank: '7' }` — only top 4 matter |
| 15 | Both Jokers in top 4 | `[..., joker_1, 7h, joker_2, 7d]` | `{ triggered: false, rank: null }` |
| 16 | Exactly 4 cards in pile, all same rank | `[4h, 4d, 4c, 4s]` | `{ triggered: true, rank: '4' }` |
| 17 | Pile with 5+ cards, top 4 match | `[2h, 9h, 9d, 9c, 9s]` | `{ triggered: true, rank: '9' }` |
| 18 | Top 3 match but 4th does not | `[..., 8h, 7d, 7c, 7s]` | `{ triggered: false, rank: null }` |

---

## 6. Integration Points

### 6.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| State Reducer | `checkSbobuz(playPile)` | The play pile after card(s) have been placed |

### 6.2 Outbound

None. The Sbobuz Detector is a leaf component with no outbound dependencies.

### 6.3 Side Effects

None. This is a pure function.

---

## 7. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Should Sbobuz detection happen before or after individual card effects? | Before. Sbobuz is checked first (Step 1 in the effect resolution order). If triggered, individual card effects do not resolve. | Parent spec Section 7: "Sbobuz always wins." Four Queens = Sbobuz, not a Queen effect. This prevents ambiguous interactions. |
| 2 | Can Jokers contribute to Sbobuz? | No. Jokers have no rank and are excluded from the check. | Parent spec Section 6.5: "Joker exclusion — Jokers have no rank. They cannot contribute to or trigger a Sbobuz." |
| 3 | Should the detector return the matched rank? | Yes, for debugging and logging. The rank is useful in game event messages ("Sbobuz! Four 7s!"). | Low cost, high debugging value. |
| 4 | Should the detector dig deeper into the pile if the top card is a Joker? | No. The check examines exactly the top 4 cards. If a Joker is among them, Sbobuz does not trigger. | The rule is about the top 4 cards, not "the top 4 ranked cards." A Joker on top breaks the sequence. See parent spec test scenario #12. |

---

## 8. Implications for Architecture

1. **The Sbobuz Detector is called after every card placement.** This includes both normal plays and blind plays (after the face-down card is added to the pile). It is NOT called after a pile pickup (no cards are added to the pile during pickup).

2. **The detector is stateless.** It examines the pile as-is and returns a result. It does not track Sbobuz progress across turns. Each call is independent.

3. **The State Reducer is responsible for acting on the result.** The detector detects; the reducer resolves. This separation keeps both components simple and testable.
