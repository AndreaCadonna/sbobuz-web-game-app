/**
 * FaceUpCards — Displays a player's face-up table cards.
 *
 * Face-up cards are visible to all players and are played
 * after the hand is empty and the draw pile is exhausted.
 * Uses xs-size cards on mobile, sm on desktop.
 */
'use client';

import { useCallback } from 'react';

import { Card } from '@/components/game/Card';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useUIStore } from '@/stores/ui-store';
import type { Card as CardType } from '@/types/client';

interface FaceUpCardsProps {
  cards: ReadonlyArray<CardType>;
  isMyTurn: boolean;
  isActiveZone: boolean;
}

export function FaceUpCards({
  cards,
  isMyTurn,
  isActiveZone,
}: FaceUpCardsProps): React.JSX.Element {
  const isMobile = useIsMobile();
  const selectedCardIds = useUIStore((s) => s.selectedCardIds);
  const selectCard = useUIStore((s) => s.selectCard);
  const deselectCard = useUIStore((s) => s.deselectCard);

  const canInteract = isMyTurn && isActiveZone;

  const handleCardClick = useCallback(
    (cardId: string) => {
      if (!canInteract) return;
      if (selectedCardIds.includes(cardId)) {
        deselectCard(cardId);
      } else {
        selectCard(cardId);
      }
    },
    [canInteract, selectedCardIds, selectCard, deselectCard],
  );

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center py-1.5 sm:py-2">
        <p className="text-xs font-medium text-[var(--color-muted)]">No face-up cards</p>
      </div>
    );
  }

  const cardSize = isMobile ? 'xs' : 'sm';

  return (
    <div
      className={`
        flex flex-wrap items-center justify-center gap-1 py-1.5 px-2 sm:py-2.5 sm:px-3 rounded-xl
        transition-all duration-200
        ${isActiveZone
          ? 'bg-brand-50/60 ring-2 ring-brand-400/40 dark:bg-brand-950/20 dark:ring-brand-700/40'
          : ''}
      `}
      role="group"
      aria-label="Your face-up cards"
    >
      {isActiveZone && (
        <span className="w-full text-center text-[10px] sm:text-xs font-bold text-brand-600 dark:text-brand-400 mb-1">
          <span className="sm:hidden">Face-up cards</span>
          <span className="hidden sm:inline">Playing from face-up cards</span>
        </span>
      )}
      {cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          isSelected={selectedCardIds.includes(card.id)}
          isPlayable={canInteract}
          isDisabled={!canInteract}
          size={cardSize}
          onClick={handleCardClick}
        />
      ))}
    </div>
  );
}
