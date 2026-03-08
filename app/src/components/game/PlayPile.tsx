/**
 * PlayPile — Displays the discard/play pile.
 *
 * Shows the top card of the pile with a count badge.
 * Displays a fan effect of the top few cards.
 */
'use client';

import { Card } from '@/components/game/Card';
import type { Card as CardType } from '@/types/client';

interface PlayPileProps {
  pile: ReadonlyArray<CardType>;
}

export function PlayPile({ pile }: PlayPileProps): React.JSX.Element {
  if (pile.length === 0) {
    return (
      <div
        className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)]"
        aria-label="Play pile (empty)"
      >
        <span className="text-xs text-[var(--color-muted)]">Empty</span>
      </div>
    );
  }

  // Show the top 3 cards with a slight offset for fan effect
  const visibleCards = pile.slice(-3);
  const totalCount = pile.length;

  return (
    <div className="relative" aria-label={`Play pile, ${String(totalCount)} cards`}>
      <div className="relative h-24 w-16">
        {visibleCards.map((card, index) => {
          const cardId = card.type === 'joker' ? card.id : card.id;
          const offset = (index - (visibleCards.length - 1)) * 2;
          const rotation = (index - (visibleCards.length - 1)) * 3;

          return (
            <div
              key={cardId}
              className="absolute inset-0 transition-transform duration-200 motion-reduce:transition-none"
              style={{
                transform: `translateX(${String(offset)}px) rotate(${String(rotation)}deg)`,
                zIndex: index,
              }}
            >
              <Card card={card} size="md" isDisabled />
            </div>
          );
        })}
      </div>

      {/* Card count badge */}
      {totalCount > 1 && (
        <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white z-10">
          {String(totalCount)}
        </div>
      )}
    </div>
  );
}
