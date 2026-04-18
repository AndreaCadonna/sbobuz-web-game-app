/**
 * FaceUpCards — Displays a player's face-up table cards.
 *
 * Face-up cards are visible to all players and are played after the hand
 * and draw pile are exhausted.
 */
'use client';

import { useCallback } from 'react';

import { Card } from '@/components/game/Card';
import { useViewportTier } from '@/hooks/use-viewport-tier';
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
  const tier = useViewportTier();
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
        <p className="font-body text-xs text-ink-soft">No face-up cards</p>
      </div>
    );
  }

  const cardSize = tier === 'full' ? 'sm' : 'xs';
  const zoneRing = isActiveZone ? 'ring-2 ring-accent-2 ring-offset-2' : '';

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-md bg-paper/50 p-2 ${zoneRing}`}
      role="group"
      aria-label="Your face-up cards"
    >
      <span className="zone-label">
        face-up {isActiveZone ? '(active)' : '(locked while hand active)'}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1">
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
    </div>
  );
}
