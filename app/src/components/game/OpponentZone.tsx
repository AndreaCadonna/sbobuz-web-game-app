/**
 * OpponentZone — Displays an opponent's visible state in a two-row layout.
 *
 * Row 1: Name + hand card backs (or badge if >5)
 * Row 2: Face-up cards + face-down card backs (only if any exist)
 */
'use client';

import { Card, CardBack } from '@/components/game/Card';
import type { SanitizedPlayerState } from '@/types/client';

interface OpponentZoneProps {
  player: SanitizedPlayerState;
  isCurrentTurn: boolean;
  displayName: string;
  compact?: boolean;
  cardSize?: 'xs' | 'sm';
}

export function OpponentZone({
  player,
  isCurrentTurn,
  displayName,
  compact = false,
  cardSize = 'sm',
}: OpponentZoneProps): React.JSX.Element {
  const borderClass = isCurrentTurn
    ? 'border-gold-400 bg-gold-50/40 shadow-warm dark:bg-gold-950/20 dark:border-gold-600/60'
    : 'border-[var(--color-border)] bg-[var(--color-card-bg)]';

  const turnDot = isCurrentTurn ? (
    <span
      className="inline-flex h-2 w-2 shrink-0 rounded-full bg-gold-500 animate-pulse motion-reduce:animate-none ring-1 ring-gold-400/30"
      aria-label="Current turn"
    />
  ) : null;

  const size = compact ? 'xs' as const : cardSize;
  const isXs = size === 'xs';
  const fanOverlap = isXs ? '-ml-2' : '-ml-3';

  const hasFaceUp = player.faceUpCards.length > 0;
  const hasFaceDown = player.faceDownCount > 0;
  const hasSecondRow = hasFaceUp || hasFaceDown;

  return (
    <div
      className={`
        rounded-lg border-2 ${isXs ? 'px-1.5 py-1' : 'px-2 py-1.5'}
        transition-all duration-200 motion-reduce:transition-none
        ${borderClass}
      `}
      aria-label={`${displayName}'s cards${isCurrentTurn ? ' (current turn)' : ''}`}
    >
      {/* Row 1: name + hand cards */}
      <div className="flex items-center gap-1.5">
        {turnDot}
        <span className={`${isXs ? 'text-[10px]' : 'text-xs'} font-bold truncate max-w-[70px] shrink-0`}>
          {displayName}
        </span>

        {/* Hand cards (face down) — fanned for 1-5, badge for >5 */}
        {player.handCount > 0 && player.handCount <= 5 && (
          <div className="flex items-center shrink-0 ml-auto" aria-label={`${String(player.handCount)} cards in hand`}>
            {Array.from({ length: player.handCount }, (_, i) => (
              <div
                key={`hand-${String(i)}`}
                className={`first:ml-0 ${fanOverlap}`}
                style={{ zIndex: i }}
              >
                <CardBack size={size} />
              </div>
            ))}
          </div>
        )}
        {player.handCount > 5 && (
          <div className="relative inline-block shrink-0 ml-auto" aria-label={`${String(player.handCount)} cards in hand`}>
            <CardBack size={size} />
            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold-600 text-[8px] font-bold text-white ring-1 ring-[var(--color-background)] z-10">
              {String(player.handCount)}
            </div>
          </div>
        )}
        {player.handCount === 0 && (
          <span className={`${isXs ? 'text-[9px]' : 'text-[10px]'} font-semibold text-[var(--color-muted)] ml-auto`}>
            0 in hand
          </span>
        )}
      </div>

      {/* Row 2: face-up + face-down cards */}
      {hasSecondRow && (
        <div className="flex items-center gap-1.5 mt-1">
          {hasFaceUp && (
            <div className="flex items-center gap-0.5" aria-label="Face-up cards">
              {player.faceUpCards.map((card) => (
                <Card key={card.id} card={card} size={size} isDisabled />
              ))}
            </div>
          )}
          {hasFaceUp && hasFaceDown && (
            <div className="w-px h-4 bg-[var(--color-border)] shrink-0" />
          )}
          {hasFaceDown && (
            <div className="flex items-center gap-0.5" aria-label={`${String(player.faceDownCount)} face-down cards`}>
              {Array.from({ length: player.faceDownCount }, (_, i) => (
                <CardBack key={`fd-${String(i)}`} size={size} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
