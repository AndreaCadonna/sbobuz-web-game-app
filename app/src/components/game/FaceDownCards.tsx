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
        <p className="text-xs font-medium text-[var(--color-muted)]">No face-down cards</p>
      </div>
    );
  }

  return (
    <div
      className={`
        flex flex-wrap items-center justify-center gap-1 py-2.5 px-3 rounded-xl
        transition-all duration-200
        ${isActiveZone
          ? 'bg-gold-50/60 ring-2 ring-gold-400/40 dark:bg-gold-950/20 dark:ring-gold-700/40'
          : ''}
      `}
      role="group"
      aria-label="Your face-down cards"
    >
      {isActiveZone && (
        <span className="w-full text-center text-xs font-bold text-gold-600 dark:text-gold-400 mb-1">
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
            transition-all duration-200 motion-reduce:transition-none rounded-xl
            ${canInteract
              ? 'cursor-pointer hover:-translate-y-1 motion-reduce:hover:translate-y-0 hover:ring-2 hover:ring-gold-400 hover:shadow-card-hover'
              : 'cursor-default'}
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2
          `}
        >
          <CardBack size="sm" />
        </button>
      ))}
    </div>
  );
}
