/**
 * PlayerHand — Displays the current player's hand cards in a fan layout.
 *
 * Cards are selectable. Selection state is managed by the UI store.
 * The component renders cards with appropriate playable/unplayable states.
 */
'use client';

import { useCallback, useMemo } from 'react';

import { Card } from '@/components/game/Card';
import { sortCardsByRank } from '@/lib/card-utils';
import { useUIStore } from '@/stores/ui-store';
import type { Card as CardType } from '@/types/client';

interface PlayerHandProps {
  cards: ReadonlyArray<CardType>;
  isMyTurn: boolean;
}

export function PlayerHand({ cards, isMyTurn }: PlayerHandProps): React.JSX.Element {
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
      <div className="flex items-center justify-center py-4">
        <p className="text-sm font-medium text-[var(--color-muted)]">No cards in hand</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-end justify-center gap-1 sm:gap-1.5 py-2 px-1"
      role="group"
      aria-label="Your hand"
    >
      {sortedCards.map((card) => {
        const cardId = card.type === 'joker' ? card.id : card.id;
        return (
          <Card
            key={cardId}
            card={card}
            isSelected={selectedCardIds.includes(cardId)}
            isPlayable={isMyTurn}
            isDisabled={!isMyTurn}
            isDraggable={isMyTurn}
            size="md"
            onClick={handleCardClick}
            onDragStart={handleDragStart}
          />
        );
      })}
    </div>
  );
}
