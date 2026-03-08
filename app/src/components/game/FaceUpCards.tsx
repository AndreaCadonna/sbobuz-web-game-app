/**
 * FaceUpCards — Displays a player's face-up table cards.
 *
 * Face-up cards are visible to all players and are played
 * after the hand is empty and the draw pile is exhausted.
 */
'use client';

import { useCallback } from 'react';

import { Card } from '@/components/game/Card';
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
      <div className="flex items-center justify-center py-2">
        <p className="text-xs text-[var(--color-muted)]">No face-up cards</p>
      </div>
    );
  }

  return (
    <div
      className={`
        flex flex-wrap items-center justify-center gap-1 py-2 px-1 rounded-md
        ${isActiveZone ? 'bg-brand-50/50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800' : ''}
      `}
      role="group"
      aria-label="Your face-up cards"
    >
      {isActiveZone && (
        <span className="w-full text-center text-xs text-brand-600 dark:text-brand-400 mb-1">
          Playing from face-up cards
        </span>
      )}
      {cards.map((card) => {
        const cardId = card.type === 'joker' ? card.id : card.id;
        return (
          <Card
            key={cardId}
            card={card}
            isSelected={selectedCardIds.includes(cardId)}
            isPlayable={canInteract}
            isDisabled={!canInteract}
            size="sm"
            onClick={handleCardClick}
          />
        );
      })}
    </div>
  );
}
