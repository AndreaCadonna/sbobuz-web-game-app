/**
 * FaceDownCards — Displays a player's face-down table cards.
 *
 * Face-down cards are blind-played: the player selects a position (index)
 * without knowing what the card is. Only used when hand and face-up are empty.
 */
'use client';

import { useCallback } from 'react';

import { CardBack } from '@/components/game/Card';

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
      <div className="flex items-center justify-center py-2">
        <p className="text-xs text-[var(--color-muted)]">No face-down cards</p>
      </div>
    );
  }

  return (
    <div
      className={`
        flex flex-wrap items-center justify-center gap-1 py-2 px-1 rounded-md
        ${isActiveZone ? 'bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800' : ''}
      `}
      role="group"
      aria-label="Your face-down cards"
    >
      {isActiveZone && (
        <span className="w-full text-center text-xs text-amber-600 dark:text-amber-400 mb-1">
          Blind play: pick a card
        </span>
      )}
      {Array.from({ length: count }, (_, index) => (
        <button
          key={`facedown-${String(index)}`}
          type="button"
          onClick={() => handleClick(index)}
          disabled={!canInteract}
          aria-label={`Play face-down card at position ${String(index + 1)}`}
          className={`
            transition-transform duration-150 motion-reduce:transition-none
            ${canInteract
              ? 'cursor-pointer hover:-translate-y-1 motion-reduce:hover:translate-y-0 hover:ring-2 hover:ring-amber-400 rounded-lg'
              : 'cursor-default'}
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 rounded-lg
          `}
        >
          <CardBack size="sm" />
        </button>
      ))}
    </div>
  );
}
