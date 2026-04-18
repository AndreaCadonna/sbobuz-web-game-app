/**
 * DrawPile — Sketchy draw pile stack.
 *
 * Shows 2 stacked card backs with a count badge below.
 */
'use client';

import { CardBack } from '@/components/game/Card';

interface DrawPileProps {
  count: number;
  size?: 'sm' | 'md';
}

const CONTAINER_SIZES = {
  sm: 'h-[3.875rem] w-11',
  md: 'h-[5.5rem] w-[3.875rem]',
} as const;

export function DrawPile({ count, size = 'md' }: DrawPileProps): React.JSX.Element {
  const containerClass = CONTAINER_SIZES[size];

  if (count === 0) {
    return (
      <div
        className={`flex ${containerClass} items-center justify-center rounded-md border-2 border-dashed border-line-soft`}
        aria-label="Draw pile (empty)"
      >
        <span className="font-mono text-[10px] uppercase tracking-wider text-line-soft">empty</span>
      </div>
    );
  }

  return (
    <div className="relative" aria-label={`Draw pile, ${String(count)} cards remaining`}>
      <div className={`relative ${containerClass}`}>
        {count >= 2 && (
          <div className="absolute inset-0" style={{ transform: 'translate(-2px, -2px)' }}>
            <CardBack size={size} />
          </div>
        )}
        <div className="absolute inset-0" style={{ transform: 'translate(2px, 2px)' }}>
          <CardBack size={size} />
        </div>
      </div>
    </div>
  );
}
