/**
 * PlayerHand — Displays the current player's hand cards in a fan layout.
 *
 * Matches wireframe `.hand-fan`: cards overlap with -16px margin and tilt
 * progressively (-6/-3/0/3/6 deg). Selected cards raise and straighten.
 * Selection state is managed by the UI store. Mobile uses a smaller overlap
 * and no drag-and-drop.
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

/**
 * Returns a hand-fan transform for a card at position `index` out of `total`.
 * Spreads the cards across -8deg to +8deg with a subtle Y lift for the outer cards.
 */
function fanTransform(index: number, total: number): string {
  if (total <= 1) return 'rotate(0deg)';
  const mid = (total - 1) / 2;
  const deg = ((index - mid) / mid) * 7; // -7..7 degrees
  const lift = Math.abs(index - mid) / mid * 3; // 0..3 px
  return `rotate(${deg.toFixed(2)}deg) translateY(${lift.toFixed(2)}px)`;
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
      const dragIds = selectedCardIds.includes(cardId) ? selectedCardIds : [cardId];
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
        <p className="font-body text-sm text-ink-soft">No cards in hand</p>
      </div>
    );
  }

  const cardSize = tier === 'full' ? 'md' : 'sm';
  const canDrag = !isMobile && isMyTurn;
  const overlap = isMobile ? '-ml-3' : '-ml-4';
  const total = sortedCards.length;

  return (
    <div className="flex items-end justify-center py-2 px-2" role="group" aria-label="Your hand">
      <div className="flex items-end">
        {sortedCards.map((card, index) => {
          const cardId = card.id;
          const isSelected = selectedCardIds.includes(cardId);
          const transform = isSelected ? 'translateY(-12px) rotate(0deg)' : fanTransform(index, total);
          return (
            <div
              key={cardId}
              className={`relative transition-transform duration-150 motion-reduce:transition-none ${index > 0 ? overlap : ''}`}
              style={{
                transform,
                zIndex: isSelected ? 50 : index,
              }}
            >
              <Card
                card={card}
                isSelected={isSelected}
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
    </div>
  );
}
