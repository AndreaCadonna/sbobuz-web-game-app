/**
 * OpponentZone — Displays an opponent's visible state.
 *
 * Shows face-up cards, face-down card count, and hand card count (backs).
 * Opponents' hands are hidden (shown as card backs with count badge).
 */
'use client';

import { Card, CardBack } from '@/components/game/Card';
import type { SanitizedPlayerState } from '@/types/client';

interface OpponentZoneProps {
  player: SanitizedPlayerState;
  isCurrentTurn: boolean;
  /** Display name for the opponent, resolved from room state */
  displayName: string;
}

export function OpponentZone({
  player,
  isCurrentTurn,
  displayName,
}: OpponentZoneProps): React.JSX.Element {
  return (
    <div
      className={`
        rounded-lg border p-3
        transition-colors duration-200 motion-reduce:transition-none
        ${isCurrentTurn
          ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30'
          : 'border-[var(--color-border)] bg-[var(--color-card-bg)]'}
      `}
      aria-label={`${displayName}'s cards${isCurrentTurn ? ' (current turn)' : ''}`}
    >
      {/* Opponent name and hand count */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium truncate max-w-[120px]">
          {displayName}
        </span>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          {isCurrentTurn && (
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-500 animate-pulse motion-reduce:animate-none" aria-label="Current turn" />
          )}
          <span aria-label={`${String(player.handCount)} cards in hand`}>
            {String(player.handCount)} in hand
          </span>
        </div>
      </div>

      {/* Hand cards (face down) */}
      {player.handCount > 0 && (
        <div className="flex items-center gap-0.5 mb-2" aria-label="Hand cards (hidden)">
          {Array.from({ length: Math.min(player.handCount, 5) }, (_, i) => (
            <CardBack key={`hand-${String(i)}`} size="sm" />
          ))}
          {player.handCount > 5 && (
            <span className="ml-1 text-xs text-[var(--color-muted)]">+{String(player.handCount - 5)}</span>
          )}
        </div>
      )}

      {/* Face-up cards */}
      {player.faceUpCards.length > 0 && (
        <div className="mb-2">
          <span className="text-xs text-[var(--color-muted)] mb-1 block">Face-up</span>
          <div className="flex gap-1" aria-label="Face-up cards">
            {player.faceUpCards.map((card) => (
              <Card
                key={card.type === 'joker' ? card.id : card.id}
                card={card}
                size="sm"
                isDisabled
              />
            ))}
          </div>
        </div>
      )}

      {/* Face-down count */}
      {player.faceDownCount > 0 && (
        <div>
          <span className="text-xs text-[var(--color-muted)] mb-1 block">Face-down</span>
          <div className="flex gap-1" aria-label={`${String(player.faceDownCount)} face-down cards`}>
            {Array.from({ length: player.faceDownCount }, (_, i) => (
              <CardBack key={`fd-${String(i)}`} size="sm" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
