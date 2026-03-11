/**
 * PlayPile — Displays the discard/play pile.
 *
 * Shows the top card of the pile with a count badge.
 * Displays a fan effect of the top few cards.
 * Acts as a drop target for drag-and-drop card play.
 */
'use client';

import { useCallback, useState } from 'react';

import { Card } from '@/components/game/Card';
import type { Card as CardType } from '@/types/client';

interface PlayPileProps {
  pile: ReadonlyArray<CardType>;
  isDropTarget?: boolean;
  onDropCards?: (cardIds: string[]) => void;
}

export function PlayPile({ pile, isDropTarget = false, onDropCards }: PlayPileProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);

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

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only set false when leaving the container (not entering a child)
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsDragOver(false);
    },
    [],
  );

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
        // Invalid data, ignore
      }
    },
    [isDropTarget, onDropCards],
  );

  const dropTargetClasses = isDragOver
    ? 'ring-2 ring-gold-400 scale-105 motion-reduce:scale-100'
    : '';

  if (pile.length === 0) {
    return (
      <div
        className={`flex h-24 w-16 items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)]/50 transition-all duration-150 motion-reduce:transition-none ${dropTargetClasses}`}
        aria-label="Play pile (empty)"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="text-xs font-medium text-[var(--color-muted)]/50">
          {isDragOver ? 'Drop here' : 'Empty'}
        </span>
      </div>
    );
  }

  // Show the top 3 cards with a slight offset for fan effect
  const visibleCards = pile.slice(-3);
  const totalCount = pile.length;

  return (
    <div
      className={`relative transition-all duration-150 motion-reduce:transition-none ${dropTargetClasses}`}
      aria-label={`Play pile, ${String(totalCount)} cards${isDropTarget ? '. Drop cards here to play' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
        <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold-600 text-[10px] font-bold text-white ring-2 ring-[var(--color-background)] z-10">
          {String(totalCount)}
        </div>
      )}
    </div>
  );
}
