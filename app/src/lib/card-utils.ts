/**
 * Card utility functions for the frontend.
 *
 * Sorting, ranking, and card comparison helpers.
 */
import type { Rank } from '@sbobuz/shared';

import type { Card } from '@/types/client';

/** Rank sort order: low to high. Matches server's RANK_ORDER. */
const RANK_ORDER: readonly Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

const RANK_INDEX = new Map<Rank, number>(
  RANK_ORDER.map((rank, i) => [rank, i]),
);

/** Sort cards by rank ascending. Jokers go to the end. */
export function sortCardsByRank(cards: ReadonlyArray<Card>): Card[] {
  return [...cards].sort((a, b) => {
    if (a.type === 'joker' && b.type === 'joker') return 0;
    if (a.type === 'joker') return 1;
    if (b.type === 'joker') return -1;
    const ai = RANK_INDEX.get(a.rank) ?? -1;
    const bi = RANK_INDEX.get(b.rank) ?? -1;
    if (ai !== bi) return ai - bi;
    // Secondary sort by suit for stability
    return a.suit.localeCompare(b.suit);
  });
}
