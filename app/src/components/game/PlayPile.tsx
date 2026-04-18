/**
 * PlayPile — Sketchy play pile.
 *
 * Matches wireframe `.pile-stack`: three top cards fanned with rotations and
 * opacity for depth. Accepts drops (drag-and-drop) and taps (mobile).
 */
'use client';

import { useCallback, useState } from 'react';

import { Card } from '@/components/game/Card';
import type { Card as CardType } from '@/types/client';

interface PlayPileProps {
  pile: ReadonlyArray<CardType>;
  isDropTarget?: boolean;
  onDropCards?: (cardIds: string[]) => void;
  size?: 'sm' | 'md';
  /** Card IDs currently selected in the player's hand (for tap-to-play) */
  selectedCardIds?: ReadonlyArray<string>;
}

const CONTAINER_SIZES = {
  sm: 'h-[3.875rem] w-11',
  md: 'h-[5.5rem] w-[3.875rem]',
} as const;

export function PlayPile({
  pile,
  isDropTarget = false,
  onDropCards,
  size = 'md',
  selectedCardIds = [],
}: PlayPileProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);
  const containerClass = CONTAINER_SIZES[size];

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isDropTarget) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [isDropTarget],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isDropTarget) return;
      e.preventDefault();
      setIsDragOver(true);
    },
    [isDropTarget],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!isDropTarget || !onDropCards) return;
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;
      try {
        const cardIds = JSON.parse(data) as string[];
        if (Array.isArray(cardIds) && cardIds.length > 0) {
          onDropCards(cardIds);
        }
      } catch {
        /* invalid data, ignore */
      }
    },
    [isDropTarget, onDropCards],
  );

  const handleTapToPlay = useCallback(() => {
    if (isDropTarget && onDropCards && selectedCardIds.length > 0) {
      onDropCards([...selectedCardIds]);
    }
  }, [isDropTarget, onDropCards, selectedCardIds]);

  const canTapToPlay = isDropTarget && selectedCardIds.length > 0;
  const dropRing = isDragOver ? 'ring-2 ring-accent-3 ring-offset-2' : '';

  if (pile.length === 0) {
    return (
      <button
        type="button"
        onClick={canTapToPlay ? handleTapToPlay : undefined}
        disabled={!canTapToPlay}
        className={`flex ${containerClass} items-center justify-center rounded-md border-2 border-dashed border-line-soft transition-transform motion-reduce:transition-none ${dropRing} ${canTapToPlay ? 'cursor-pointer ring-2 ring-accent-3/60 hover:ring-accent-3' : 'cursor-default'}`}
        aria-label={`Play pile (empty)${canTapToPlay ? '. Tap to play selected cards' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="font-mono text-[10px] uppercase tracking-wider text-line-soft">
          {isDragOver ? 'drop' : canTapToPlay ? 'tap to play' : 'empty'}
        </span>
      </button>
    );
  }

  const visibleCards = pile.slice(-3);
  const totalCount = pile.length;

  return (
    <button
      type="button"
      onClick={canTapToPlay ? handleTapToPlay : undefined}
      disabled={!canTapToPlay}
      className={`relative rounded-md transition-transform motion-reduce:transition-none ${dropRing} ${canTapToPlay ? 'cursor-pointer ring-2 ring-accent-3/60 hover:ring-accent-3' : 'cursor-default'}`}
      aria-label={`Play pile, ${String(totalCount)} cards${isDropTarget ? '. Drop cards here to play' : ''}${canTapToPlay ? '. Tap to play selected cards' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`relative ${containerClass}`}>
        {visibleCards.map((card, index) => {
          // Matches wireframe rotations: -3deg then 2deg then -1deg
          const rotations = [-3, 2, -1];
          const translates = [
            { x: -3, y: 2 },
            { x: 2, y: -1 },
            { x: 0, y: 0 },
          ];
          const offsetIdx = index + (3 - visibleCards.length);
          const rot = rotations[offsetIdx] ?? 0;
          const trans = translates[offsetIdx] ?? { x: 0, y: 0 };
          const opacity = [0.5, 0.7, 1][offsetIdx] ?? 1;
          return (
            <div
              key={card.id}
              className="absolute inset-0"
              style={{
                transform: `translate(${String(trans.x)}px, ${String(trans.y)}px) rotate(${String(rot)}deg)`,
                opacity,
                zIndex: index,
              }}
            >
              <Card card={card} size={size} isDisabled />
            </div>
          );
        })}
      </div>
    </button>
  );
}
