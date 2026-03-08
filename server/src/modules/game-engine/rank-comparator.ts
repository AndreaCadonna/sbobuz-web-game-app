/**
 * Rank Comparator -- Card rank comparison with direction context.
 *
 * Determines whether a card is legally playable on top of the current pile
 * given the rank hierarchy, the active comparison direction, and special card
 * bypass rules.
 *
 * This module is a pure-function leaf component with no outbound dependencies
 * beyond shared types. It never mutates inputs and never performs I/O.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 3 (Card Rank Hierarchy)
 * @see SBOBUZ_ENGINE_SPEC.md Section 5.2 (Card Legality)
 * @see docs/specs/engine/rank-comparator.md
 */

import type { Card, Rank } from '@shared/card.js';

// ---------------------------------------------------------------------------
// Types owned by this component
// ---------------------------------------------------------------------------

/**
 * The comparison direction for the current play.
 *
 * - `'higher'` (default) -- the played card must be >= the pile top.
 * - `'lower'` -- set by a Queen declaration; the played card must be <= the pile top.
 */
export type ComparisonDirection = 'higher' | 'lower';

/**
 * The context needed to evaluate whether a card rank is legal.
 * Encapsulates all flags and pile state relevant to comparison.
 *
 * Built by the Action Validator or State Reducer from the current GameState.
 * The Rank Comparator never inspects GameState directly.
 */
export interface ComparisonContext {
  /** Rank of the top card on the play pile. null if the pile is empty or the top card is a Joker. */
  readonly pileTopRank: Rank | null;

  /** Whether the pile top is a Joker (Jokers have no rank). */
  readonly pileTopIsJoker: boolean;

  /** True if the freePlay flag is active (set by a 2 or Joker). Any card is legal. */
  readonly freePlay: boolean;

  /** The direction override. null means default ('higher'). 'lower' means Queen override active. */
  readonly nextCardOverride: 'lower' | null;
}

/**
 * The reason a card was determined to be legal or illegal.
 * Used for debugging, logging, and client-side UX hints.
 */
export type LegalityReason =
  | 'PILE_EMPTY'
  | 'FREE_PLAY'
  | 'ALWAYS_LEGAL_TWO'
  | 'ALWAYS_LEGAL_JOKER'
  | 'RANK_HIGHER_OR_EQUAL'
  | 'RANK_LOWER_OR_EQUAL'
  | 'RANK_TOO_LOW'
  | 'RANK_TOO_HIGH';

/**
 * Result of a rank comparison check.
 */
export interface ComparisonResult {
  /** Whether the card is legal to play. */
  readonly legal: boolean;

  /** The reason the card is legal or illegal. */
  readonly reason: LegalityReason;
}

// ---------------------------------------------------------------------------
// Rank hierarchy -- single source of truth
// ---------------------------------------------------------------------------

/**
 * The rank hierarchy from lowest (index 0) to highest (index 12).
 *
 * Note: rank '2' sits at index 0 (lowest ordinal), but 2s have a special
 * bypass that makes them always playable. The rank position in this array
 * and the playability of the card are separate concerns.
 *
 * @example
 * ```typescript
 * RANK_ORDER[0];  // '2'
 * RANK_ORDER[12]; // 'A'
 * ```
 */
export const RANK_ORDER: readonly Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;

/**
 * Pre-computed lookup from Rank to its ordinal position for O(1) access.
 * Built once at module load from {@link RANK_ORDER}.
 */
const RANK_ORDINAL_MAP: ReadonlyMap<Rank, number> = new Map(
  RANK_ORDER.map((rank, index) => [rank, index]),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the ordinal position of a rank in the hierarchy.
 *
 * `'2'` = 0, `'3'` = 1, ..., `'A'` = 12.
 *
 * @param rank - A valid card rank.
 * @returns The zero-based ordinal position.
 * @throws {Error} If the rank is not found in the hierarchy (should never
 *   happen with the `Rank` type, but guards against runtime corruption).
 *
 * @example
 * ```typescript
 * rankToOrdinal('3');  // 1
 * rankToOrdinal('A');  // 12
 * rankToOrdinal('10'); // 8
 * ```
 */
export function rankToOrdinal(rank: Rank): number {
  const ordinal = RANK_ORDINAL_MAP.get(rank);
  if (ordinal === undefined) {
    throw new Error(`Unknown rank: ${String(rank)}`);
  }
  return ordinal;
}

/**
 * Compares two ranks and returns a numeric comparison result.
 *
 * @param a - The first rank to compare.
 * @param b - The second rank to compare.
 * @returns A negative number if `a < b`, 0 if `a === b`, a positive number if `a > b`.
 *
 * @example
 * ```typescript
 * compareRanks('3', 'A');  // negative (3 < A)
 * compareRanks('K', 'K');  // 0
 * compareRanks('A', '3');  // positive (A > 3)
 * ```
 */
export function compareRanks(a: Rank, b: Rank): number {
  return rankToOrdinal(a) - rankToOrdinal(b);
}

/**
 * Determines the effective comparison direction given the current state flags.
 *
 * @param nextCardOverride - The Queen direction override, or null if none is active.
 * @returns `'lower'` if the Queen override is active, otherwise `'higher'`.
 *
 * @example
 * ```typescript
 * getEffectiveDirection(null);    // 'higher'
 * getEffectiveDirection('lower'); // 'lower'
 * ```
 */
export function getEffectiveDirection(nextCardOverride: 'lower' | null): ComparisonDirection {
  return nextCardOverride === 'lower' ? 'lower' : 'higher';
}

/**
 * Determines whether a card is legally playable given the comparison context.
 *
 * This is the primary entry point for legality checks. It evaluates conditions
 * in strict priority order (see rank-comparator.md Section 4.2):
 *
 * 1. Joker -- always legal
 * 2. Rank is '2' -- always legal
 * 3. Pile is empty -- any card is legal
 * 4. freePlay flag active -- any card is legal
 * 5. Pile top is a Joker (freePlay consumed) -- treat as effectively empty
 * 6. Normal rank comparison (higher or lower direction)
 *
 * The first matching condition determines the result. This function never
 * mutates its inputs and has no side effects.
 *
 * @param card - The card being played.
 * @param context - The comparison context (pile top rank, flags).
 * @returns A {@link ComparisonResult} with the legal status and reason.
 *
 * @example
 * ```typescript
 * // Joker is always legal
 * isCardLegal({ type: 'joker', id: 'joker_1' }, someContext);
 * // => { legal: true, reason: 'ALWAYS_LEGAL_JOKER' }
 *
 * // 2 is always legal
 * isCardLegal({ type: 'standard', rank: '2', suit: 'hearts', id: 'hearts_2' }, someContext);
 * // => { legal: true, reason: 'ALWAYS_LEGAL_TWO' }
 * ```
 */
export function isCardLegal(card: Card, context: ComparisonContext): ComparisonResult {
  // STEP 1 -- Is the card a Joker?
  if (card.type === 'joker') {
    return { legal: true, reason: 'ALWAYS_LEGAL_JOKER' };
  }

  // STEP 2 -- Is the card a 2?
  if (card.rank === '2') {
    return { legal: true, reason: 'ALWAYS_LEGAL_TWO' };
  }

  // STEP 3 -- Is the pile empty?
  if (context.pileTopRank === null && !context.pileTopIsJoker) {
    return { legal: true, reason: 'PILE_EMPTY' };
  }

  // STEP 4 -- Is freePlay active?
  if (context.freePlay) {
    return { legal: true, reason: 'FREE_PLAY' };
  }

  // STEP 5 -- Is the pile top a Joker (freePlay already consumed)?
  // The Joker has no rank to compare against. Treat as effectively empty.
  if (context.pileTopIsJoker) {
    return { legal: true, reason: 'PILE_EMPTY' };
  }

  // STEP 6 -- Normal rank comparison.
  // At this point we know:
  //   - card is a standard card with rank != '2'
  //   - pile is non-empty and pile top has a rank
  //   - freePlay is not active
  //   - pile top is not a Joker
  // TypeScript narrows card.type to 'standard' from Step 1 check,
  // and pileTopRank is non-null from Step 3 + Step 5 checks.
  const pileTopRank = context.pileTopRank;
  // This assertion is safe: we checked pileTopRank !== null (Step 3)
  // and pileTopIsJoker === false (Step 5), so pileTopRank must be non-null.
  // TypeScript does not narrow through the compound condition, so we
  // add an explicit guard.
  if (pileTopRank === null) {
    // Unreachable in practice, but satisfies the type checker.
    return { legal: true, reason: 'PILE_EMPTY' };
  }

  const direction = getEffectiveDirection(context.nextCardOverride);
  const comparison = compareRanks(card.rank, pileTopRank);

  if (direction === 'lower') {
    return comparison <= 0
      ? { legal: true, reason: 'RANK_LOWER_OR_EQUAL' }
      : { legal: false, reason: 'RANK_TOO_HIGH' };
  }

  // direction === 'higher'
  return comparison >= 0
    ? { legal: true, reason: 'RANK_HIGHER_OR_EQUAL' }
    : { legal: false, reason: 'RANK_TOO_LOW' };
}
