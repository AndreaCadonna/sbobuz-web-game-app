# Rank Comparator — Card Rank Comparison with Direction Context

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Sections 3, 5.2, 6

---

## 1. Overview

The Rank Comparator is responsible for determining whether a card is legally playable on top of the current pile, given the rank hierarchy, the active comparison direction, and special card bypass rules. It encapsulates the rank ordering (3 lowest through A highest) and the interplay between normal comparison, the Queen's "lower" override, and the always-legal status of 2s and Jokers.

This component is used by the Action Validator (to gate illegal plays before they reach the reducer) and by the State Reducer (to check legality of blind-played face-down cards after reveal).

The Rank Comparator does NOT handle Sbobuz detection, card effects, or multi-card plays. It answers one question: "Is this rank legal to play on that rank, given the current direction and flags?"

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * The comparison direction for the current play.
 * 'higher' is the default — played card must be >= pile top.
 * 'lower' is set by a Queen declaration — played card must be <= pile top.
 */
type ComparisonDirection = 'higher' | 'lower';

/**
 * The context needed to evaluate whether a card rank is legal.
 * Encapsulates all flags and pile state relevant to comparison.
 */
interface ComparisonContext {
  /** Rank of the top card on the play pile. null if pile is empty. */
  pileTopRank: Rank | null;

  /** Whether the pile top is a Joker (Jokers have no rank). */
  pileTopIsJoker: boolean;

  /** True if freePlay flag is active (set by 2 or Joker). Any card is legal. */
  freePlay: boolean;

  /** The direction override. null means default ('higher'). 'lower' means Queen override active. */
  nextCardOverride: 'lower' | null;
}

/**
 * Result of a rank comparison check.
 */
interface ComparisonResult {
  /** Whether the card is legal to play. */
  legal: boolean;

  /** The reason the card is legal or illegal. For debugging and UI hints. */
  reason: LegalityReason;
}

type LegalityReason =
  | 'PILE_EMPTY'                    // pile is empty, any card is legal
  | 'FREE_PLAY'                     // freePlay flag active, any card is legal
  | 'ALWAYS_LEGAL_TWO'              // 2s are always playable
  | 'ALWAYS_LEGAL_JOKER'            // Jokers are always playable
  | 'RANK_HIGHER_OR_EQUAL'          // card rank >= pile top (default direction)
  | 'RANK_LOWER_OR_EQUAL'           // card rank <= pile top (Queen override)
  | 'RANK_TOO_LOW'                  // card rank < pile top when higher required
  | 'RANK_TOO_HIGH';                // card rank > pile top when lower required
```

### 2.2 Types Referenced from Parent Spec

- `Rank` — `'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'`
- `Card`, `StandardCard`, `JokerCard` — for determining if a card has a rank

---

## 3. Public Interface

```typescript
/**
 * The rank hierarchy from lowest (index 0) to highest (index 12).
 * Used internally for ordinal comparison.
 */
const RANK_ORDER: readonly Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'
];

/**
 * Returns the ordinal position of a rank in the hierarchy.
 * '2' = 0, '3' = 1, ..., 'A' = 12.
 */
function rankToOrdinal(rank: Rank): number;

/**
 * Compares two ranks and returns a number:
 *   negative if a < b
 *   0 if a === b
 *   positive if a > b
 */
function compareRanks(a: Rank, b: Rank): number;

/**
 * Determines whether a card is legally playable given the comparison context.
 * This is the primary entry point for legality checks.
 *
 * For standard cards, the rank is compared against the pile top.
 * For Jokers, the card is always legal.
 *
 * @param card - The card being played.
 * @param context - The comparison context (pile top, flags).
 * @returns ComparisonResult with legal status and reason.
 */
function isCardLegal(card: Card, context: ComparisonContext): ComparisonResult;

/**
 * Determines the effective comparison direction given the current state flags.
 * Returns 'lower' if nextCardOverride is 'lower', otherwise 'higher'.
 */
function getEffectiveDirection(nextCardOverride: 'lower' | null): ComparisonDirection;
```

---

## 4. Behavior Rules

### 4.1 Rank Hierarchy

The rank hierarchy for comparison purposes, from lowest to highest:

```
2 (index 0) < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A (index 12)
```

Note: rank 2 is at the bottom of the hierarchy, but 2s have a special bypass that makes them always playable. The rank position and the playability are separate concerns.

### 4.2 Legality Evaluation Order

The `isCardLegal` function evaluates conditions in this priority order. The first matching condition determines the result.

```
STEP 1 — Is the card a Joker?
    ├─ YES → LEGAL (reason: ALWAYS_LEGAL_JOKER). STOP.
    └─ NO  → Continue.

STEP 2 — Is the card a 2?
    ├─ YES → LEGAL (reason: ALWAYS_LEGAL_TWO). STOP.
    └─ NO  → Continue.

STEP 3 — Is the pile empty? (pileTopRank === null AND pileTopIsJoker === false)
    ├─ YES → LEGAL (reason: PILE_EMPTY). STOP.
    └─ NO  → Continue.

STEP 4 — Is freePlay active?
    ├─ YES → LEGAL (reason: FREE_PLAY). STOP.
    └─ NO  → Continue.

STEP 5 — Is the pile top a Joker? (pileTopIsJoker === true)
    ├─ YES → This means freePlay should have been set by the Joker.
    │        If we reach here, freePlay was already consumed.
    │        Treat as normal comparison with the card BELOW the Joker.
    │        NOTE: This case should not occur in practice because
    │        the Joker always sets freePlay, and freePlay is checked
    │        in Step 4. If it does occur (e.g., flags were consumed
    │        by a previous play in the same turn), fall through to
    │        normal comparison. The pile top rank is effectively
    │        unknown — treat as pile empty → LEGAL (reason: PILE_EMPTY).
    └─ NO  → Continue.

STEP 6 — Normal rank comparison.
    Determine effective direction:
    ├─ nextCardOverride === 'lower':
    │   Is card rank ≤ pile top rank?
    │   ├─ YES → LEGAL (reason: RANK_LOWER_OR_EQUAL).
    │   └─ NO  → ILLEGAL (reason: RANK_TOO_HIGH).
    └─ Default ('higher'):
        Is card rank ≥ pile top rank?
        ├─ YES → LEGAL (reason: RANK_HIGHER_OR_EQUAL).
        └─ NO  → ILLEGAL (reason: RANK_TOO_LOW).
```

### 4.3 Multi-Card Plays

When a player plays multiple cards of the same rank, legality is checked **once** against the shared rank. The Rank Comparator receives a single card (or rank) — the caller is responsible for verifying all cards share the same rank before calling this function.

### 4.4 Joker on Pile Top

A Joker on the pile top has no rank. The Joker's effect (freePlay = true) should have been set when the Joker was played. If `freePlay` is true, Step 4 handles it. If `freePlay` was already consumed (the Joker was played by a previous player and the current player is the one after the "free play" recipient), then the pile top is the Joker but freePlay is false. In this case, the comparison should look at the card below the Joker. However, the Rank Comparator does not dig into the pile — it only sees `pileTopRank` and `pileTopIsJoker`. The caller (Action Validator / State Reducer) is responsible for providing the correct `pileTopRank` by looking below the Joker if needed, or providing `pileTopIsJoker: true` with `pileTopRank: null`.

**Resolution:** When the pile top is a Joker and freePlay is false, the ComparisonContext should set `pileTopRank: null` and `pileTopIsJoker: true`. The Rank Comparator treats this as a "pile effectively empty" scenario (any card is legal), because the Joker has no rank to compare against.

---

## 5. Edge Cases & Test Scenarios

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Play a 3 on empty pile | Legal (PILE_EMPTY). |
| 2 | Play a 5 on pile top 7 (default direction) | Illegal (RANK_TOO_LOW). 5 < 7. |
| 3 | Play a 7 on pile top 7 (default direction) | Legal (RANK_HIGHER_OR_EQUAL). Equal is always allowed. |
| 4 | Play a 9 on pile top 7 (default direction) | Legal (RANK_HIGHER_OR_EQUAL). |
| 5 | Play a J on pile top K with Queen override 'lower' | Illegal? No — J(10) < K(11). Wait: lower means card must be <= pile top. J ordinal=9, K ordinal=11. 9 <= 11 → Legal (RANK_LOWER_OR_EQUAL). |
| 6 | Play a K on pile top J with Queen override 'lower' | K ordinal=11, J ordinal=9. 11 <= 9 is false → Illegal (RANK_TOO_HIGH). |
| 7 | Play a 2 on pile top A (default direction) | Legal (ALWAYS_LEGAL_TWO). 2 bypasses comparison despite being the lowest rank. |
| 8 | Play a 2 on pile top A with Queen override 'lower' | Legal (ALWAYS_LEGAL_TWO). 2 bypasses all comparison. |
| 9 | Play a Joker on pile top A (default direction) | Legal (ALWAYS_LEGAL_JOKER). |
| 10 | Play a Joker on pile top A with Queen override 'lower' | Legal (ALWAYS_LEGAL_JOKER). Joker bypasses everything. |
| 11 | Play a 5 on pile with freePlay active | Legal (FREE_PLAY). |
| 12 | Play a 3 on pile top K with freePlay active | Legal (FREE_PLAY). freePlay overrides normal comparison. |
| 13 | Play a Q on pile top J (default direction) | Legal (RANK_HIGHER_OR_EQUAL). Q ordinal=10, J ordinal=9. 10 >= 9. Queen's comparison effect triggers AFTER the play, not during legality check. |
| 14 | Play a Q on pile top K (default direction) | Illegal (RANK_TOO_LOW). Q ordinal=10, K ordinal=11. 10 >= 11 is false. |
| 15 | Play a Q on pile top K with Queen override 'lower' | Q ordinal=10, K ordinal=11. 10 <= 11 → Legal (RANK_LOWER_OR_EQUAL). |
| 16 | Pile top is a Joker, freePlay is true | Legal (FREE_PLAY). The freePlay flag is checked before pile top rank. |
| 17 | Pile top is a Joker, freePlay is false, playing a 5 | pileTopRank is null, pileTopIsJoker is true. Falls through to Step 5 → treated as effectively empty → Legal (PILE_EMPTY). |
| 18 | Compare A vs 3 in 'higher' direction | A ordinal=12, 3 ordinal=1. 12 >= 1 → Legal. |
| 19 | Compare 3 vs A in 'lower' direction | 3 ordinal=1, A ordinal=12. 1 <= 12 → Legal. |
| 20 | Equal ranks in 'lower' direction | 7 on 7. 7 <= 7 → Legal. Equal is always allowed regardless of direction. |

---

## 6. Integration Points

### 6.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| Action Validator | `isCardLegal(card, context)` | Card being validated, comparison context built from GameState |
| State Reducer | `isCardLegal(card, context)` | Used during blind play to check revealed card's legality |

### 6.2 Outbound

None. The Rank Comparator is a leaf component with no outbound dependencies.

### 6.3 Side Effects

None. This is a pure function module.

---

## 7. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Should the comparator know about multi-card plays? | No. The caller ensures all cards share the same rank and passes a single card for comparison. | Single responsibility. The comparator compares one rank against the pile. Multi-card validation belongs in the Action Validator. |
| 2 | Should the comparator handle special card effects (e.g., Queen setting direction)? | No. It only reads the current flags. It never sets flags. | Effects are the State Reducer's responsibility. The comparator is stateless — it evaluates legality from a snapshot of the current context. |
| 3 | How to handle Joker on pile top when freePlay is already consumed? | Treat as effectively empty pile (any card is legal). The caller provides `pileTopRank: null` and `pileTopIsJoker: true`. | A Joker has no rank. Without freePlay, there is nothing to compare against. This is consistent with the rule that any card can be played on an empty pile. |
| 4 | Is "equal" always legal? | Yes. In both 'higher' and 'lower' directions, equal rank is permitted. The spec says "equal to or higher" and "equal to or lower." | Consistent with engine spec Section 5.2. |

---

## 8. Implications for Architecture

1. **The RANK_ORDER array is the single source of truth for rank hierarchy.** No other component should hardcode rank orderings. If the rank hierarchy ever changes, only this component needs updating.

2. **The ComparisonContext abstraction decouples the comparator from GameState.** The caller (Action Validator or State Reducer) builds the context from the game state. The comparator never imports or inspects GameState directly. This keeps it testable in isolation.

3. **The ComparisonResult includes a reason string** intended for both debugging and client-side UX hints. The Action Validator can forward this reason to the Realtime Module, which can pass it to the client for displaying "why can't I play this card?" feedback.
