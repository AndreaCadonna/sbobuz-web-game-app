/**
 * PlayerHand — Displays the current player's hand cards in a fan layout.
 *
 * Cards are selectable. Selection state is managed by the UI store.
 * Mobile: uses sm-size cards with negative-margin overlap, no drag-and-drop.
 * Desktop: uses md-size cards with flex-wrap layout, drag-and-drop enabled.
 */
'use client';

import { useCallback, useMemo } from 'react';

import { Card } from '@/components/game/Card';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useViewportTier } from '@/hooks/use-viewport-tier';
import { sortCardsByRank } from '@/lib/card-utils';
import { useUIStore } from '@/stores/ui-store';
import type { Card as CardType } from '@/types/client';

interface PlayerHandProps {
  cards: ReadonlyArray<CardType>;
  isMyTurn: boolean;
}

export function PlayerHand({ cards, isMyTurn }: PlayerHandProps): React.JSX.Element {
  const isMobile = useIsMobile();
  const tier = useViewportTier();
  const selectedCardIds = useUIStore((s) => s.selectedCardIds);
  const selectCard = useUIStore((s) => s.selectCard);
  const deselectCard = useUIStore((s) => s.deselectCard);
  const setSelectedCards = useUIStore((s) => s.setSelectedCards);

  const handleCardClick = useCallback(
    (cardId: string) => {
      if (!isMyTurn) return;
      if (selectedCardIds.includes(cardId)) {
        deselectCard(cardId);
      } else {
        selectCard(cardId);
      }
    },
    [isMyTurn, selectedCardIds, selectCard, deselectCard],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, cardId: string) => {
      // If the dragged card isn't selected, select only it
      const dragIds = selectedCardIds.includes(cardId)
        ? selectedCardIds
        : [cardId];

      if (!selectedCardIds.includes(cardId)) {
        setSelectedCards([cardId]);
      }

      e.dataTransfer.setData('application/json', JSON.stringify(dragIds));
      e.dataTransfer.effectAllowed = 'move';
    },
    [selectedCardIds, setSelectedCards],
  );

  const sortedCards = useMemo(() => sortCardsByRank(cards), [cards]);

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center py-2 sm:py-4">
        <p className="text-sm font-medium text-[var(--color-muted)]">No cards in hand</p>
      </div>
    );
  }

  // mobile=sm, compact desktop=sm, full desktop=md
  const cardSize = tier === 'full' ? 'md' : 'sm';
  const canDrag = !isMobile && isMyTurn;

  return (
    <div
      className={
        isMobile
          ? 'flex items-end justify-center py-1 px-1 overflow-x-auto scrollbar-thin'
          : 'flex flex-wrap items-end justify-center gap-1.5 py-2 px-1'
      }
      role="group"
      aria-label="Your hand"
    >
      {sortedCards.map((card, index) => {
        const cardId = card.id;
        return (
          <div
            key={cardId}
            className={isMobile && index > 0 ? '-ml-2 relative' : 'relative'}
            style={isMobile ? { zIndex: selectedCardIds.includes(cardId) ? 50 : index } : undefined}
          >
            <Card
              card={card}
              isSelected={selectedCardIds.includes(cardId)}
              isPlayable={isMyTurn}
              isDisabled={!isMyTurn}
              isDraggable={canDrag}
              size={cardSize}
              onClick={handleCardClick}
              onDragStart={canDrag ? handleDragStart : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
