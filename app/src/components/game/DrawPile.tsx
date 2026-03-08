/**
 * DrawPile — Displays the draw pile with card count.
 *
 * Shows a stack of face-down cards with the remaining count.
 */
'use client';

import { CardBack } from '@/components/game/Card';

interface DrawPileProps {
  count: number;
}

export function DrawPile({ count }: DrawPileProps): React.JSX.Element {
  if (count === 0) {
    return (
      <div
        className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)]"
        aria-label="Draw pile (empty)"
      >
        <span className="text-xs text-[var(--color-muted)]">Empty</span>
      </div>
    );
  }

  return (
    <div className="relative" aria-label={`Draw pile, ${String(count)} cards remaining`}>
      {/* Stacked card backs for depth effect */}
      <div className="relative h-24 w-16">
        {count >= 3 && (
          <div className="absolute inset-0 translate-x-1 translate-y-1">
            <CardBack size="md" />
          </div>
        )}
        {count >= 2 && (
          <div className="absolute inset-0 translate-x-0.5 translate-y-0.5">
            <CardBack size="md" />
          </div>
        )}
        <div className="absolute inset-0">
          <CardBack size="md" />
        </div>
      </div>

      {/* Count badge */}
      <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-600 text-xs font-bold text-white z-10">
        {String(count)}
      </div>
    </div>
  );
}
