/**
 * DrawPile — Displays the draw pile with card count.
 *
 * Shows a stack of face-down cards with the remaining count.
 * Accepts a size prop for responsive display (sm on mobile, md on desktop).
 */
'use client';

import { CardBack } from '@/components/game/Card';

interface DrawPileProps {
  count: number;
  size?: 'sm' | 'md';
}

const CONTAINER_SIZES = {
  sm: 'h-[4.5rem] w-12',
  md: 'h-24 w-16',
} as const;

export function DrawPile({ count, size = 'md' }: DrawPileProps): React.JSX.Element {
  const containerClass = CONTAINER_SIZES[size];

  if (count === 0) {
    return (
      <div
        className={`flex ${containerClass} items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)]/50`}
        aria-label="Draw pile (empty)"
      >
        <span className="text-xs font-medium text-[var(--color-muted)]/50">Empty</span>
      </div>
    );
  }

  const stackOffset = size === 'sm' ? { x1: '0.75', y1: '0.75', x2: '0.5', y2: '0.5' } : { x1: '1', y1: '1', x2: '0.5', y2: '0.5' };

  return (
    <div className="relative" aria-label={`Draw pile, ${String(count)} cards remaining`}>
      {/* Stacked card backs for depth effect */}
      <div className={`relative ${containerClass}`}>
        {count >= 3 && (
          <div className={`absolute inset-0 translate-x-[${stackOffset.x1}] translate-y-[${stackOffset.y1}]`} style={{ transform: `translate(${size === 'sm' ? '3px' : '4px'}, ${size === 'sm' ? '3px' : '4px'})` }}>
            <CardBack size={size} />
          </div>
        )}
        {count >= 2 && (
          <div className="absolute inset-0" style={{ transform: `translate(${size === 'sm' ? '1.5px' : '2px'}, ${size === 'sm' ? '1.5px' : '2px'})` }}>
            <CardBack size={size} />
          </div>
        )}
        <div className="absolute inset-0">
          <CardBack size={size} />
        </div>
      </div>

      {/* Count badge */}
      <div className={`absolute -top-2 -right-2 flex ${size === 'sm' ? 'h-5 w-5 text-[8px]' : 'h-6 w-6 text-[10px]'} items-center justify-center rounded-full bg-brand-700 font-bold text-white ring-2 ring-[var(--color-background)] z-10`}>
        {String(count)}
      </div>
    </div>
  );
}
