/**
 * FaceDownCards — Displays a player's face-down table cards.
 *
 * Sketchy card backs with an active-zone ring (blue-ish highlight when
 * it's the player's turn to play from face-down).
 */
'use client';

import { useCallback } from 'react';

import { CardBack } from '@/components/game/Card';
import { useViewportTier } from '@/hooks/use-viewport-tier';

interface FaceDownCardsProps {
  count: number;
  isMyTurn: boolean;
  isActiveZone: boolean;
  onPlayBlind?: (cardIndex: number) => void;
}

export function FaceDownCards({
  count,
  isMyTurn,
  isActiveZone,
  onPlayBlind,
}: FaceDownCardsProps): React.JSX.Element {
  const tier = useViewportTier();
  const canInteract = isMyTurn && isActiveZone;

  const handleClick = useCallback(
    (index: number) => {
      if (canInteract && onPlayBlind) {
        onPlayBlind(index);
      }
    },
    [canInteract, onPlayBlind],
  );

  if (count === 0) {
    return (
      <div className="flex items-center justify-center py-1.5 sm:py-2">
        <p className="font-body text-xs text-ink-soft">No face-down cards</p>
      </div>
    );
  }

  const cardSize = tier === 'full' ? 'sm' : 'xs';
  const zoneRing = isActiveZone
    ? 'ring-2 ring-accent-3 ring-offset-2'
    : '';

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-md bg-paper/50 p-2 ${zoneRing}`}
      role="group"
      aria-label="Your face-down cards"
    >
      <span className="zone-label">
        face-down {isActiveZone ? '(blind play)' : '(locked)'}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={`facedown-${String(index)}`}
            type="button"
            onClick={() => handleClick(index)}
            disabled={!canInteract}
            aria-label={`Play face-down card at position ${String(index + 1)}`}
            className={`
              rounded-md transition-transform duration-150 motion-reduce:transition-none
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-3 focus-visible:ring-offset-2
              ${canInteract ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'}
            `}
          >
            <CardBack size={cardSize} />
          </button>
        ))}
      </div>
    </div>
  );
}
