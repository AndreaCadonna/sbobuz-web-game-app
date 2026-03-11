/**
 * OpponentZone — Displays an opponent's visible state.
 *
 * Full mode: Shows face-up cards, face-down card count, and hand card count (backs).
 * Compact mode: Shows summary badges (name, hand count, face-up/face-down counts).
 */
'use client';

import { Card, CardBack } from '@/components/game/Card';
import type { SanitizedPlayerState } from '@/types/client';

interface OpponentZoneProps {
  player: SanitizedPlayerState;
  isCurrentTurn: boolean;
  displayName: string;
  compact?: boolean;
}

export function OpponentZone({
  player,
  isCurrentTurn,
  displayName,
  compact = false,
}: OpponentZoneProps): React.JSX.Element {
  if (compact) {
    return (
      <div
        className={`
          rounded-lg border-2 px-2.5 py-1.5 min-w-[110px] max-w-[140px] snap-start
          transition-all duration-200 motion-reduce:transition-none
          ${isCurrentTurn
            ? 'border-gold-400 bg-gold-50/40 shadow-warm dark:bg-gold-950/20 dark:border-gold-600/60'
            : 'border-[var(--color-border)] bg-[var(--color-card-bg)]'}
        `}
        aria-label={`${displayName}'s cards${isCurrentTurn ? ' (current turn)' : ''}`}
      >
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[11px] font-bold truncate max-w-[80px]">
            {displayName}
          </span>
          <div className="flex items-center gap-1">
            {isCurrentTurn && (
              <span className="inline-flex h-2 w-2 rounded-full bg-gold-500 animate-pulse motion-reduce:animate-none ring-1 ring-gold-400/30" aria-label="Current turn" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold text-[var(--color-muted)]">
          <span aria-label={`${String(player.handCount)} cards in hand`}>
            {String(player.handCount)} in hand
          </span>
          {player.faceUpCards.length > 0 && (
            <span aria-label={`${String(player.faceUpCards.length)} face-up`}>
              {String(player.faceUpCards.length)} up
            </span>
          )}
          {player.faceDownCount > 0 && (
            <span aria-label={`${String(player.faceDownCount)} face-down`}>
              {String(player.faceDownCount)} down
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-xl border-2 p-2
        transition-all duration-200 motion-reduce:transition-none
        ${isCurrentTurn
          ? 'border-gold-400 bg-gold-50/40 shadow-warm dark:bg-gold-950/20 dark:border-gold-600/60'
          : 'border-[var(--color-border)] bg-[var(--color-card-bg)]'}
      `}
      aria-label={`${displayName}'s cards${isCurrentTurn ? ' (current turn)' : ''}`}
    >
      {/* Opponent name and hand count */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold truncate max-w-[120px]">
          {displayName}
        </span>
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
          {isCurrentTurn && (
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-gold-500 animate-pulse motion-reduce:animate-none ring-2 ring-gold-400/30" aria-label="Current turn" />
          )}
          <span aria-label={`${String(player.handCount)} cards in hand`}>
            {String(player.handCount)} in hand
          </span>
        </div>
      </div>

      {/* Hand cards (face down) — fanned for 1-5, badge for >5 */}
      {player.handCount > 0 && player.handCount <= 5 && (
        <div className="flex items-center mb-2" aria-label={`${String(player.handCount)} cards in hand`}>
          {Array.from({ length: player.handCount }, (_, i) => (
            <div
              key={`hand-${String(i)}`}
              className="first:ml-0 -ml-3 transition-transform motion-reduce:transition-none"
              style={{
                transform: `rotate(${String((i - (player.handCount - 1) / 2) * 5)}deg)`,
                zIndex: i,
              }}
            >
              <CardBack size="sm" />
            </div>
          ))}
        </div>
      )}
      {player.handCount > 5 && (
        <div className="relative inline-block mb-2" aria-label={`${String(player.handCount)} cards in hand`}>
          <CardBack size="sm" />
          <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold-600 text-[9px] font-bold text-white ring-2 ring-[var(--color-background)] z-10">
            {String(player.handCount)}
          </div>
        </div>
      )}

      {/* Face-up cards */}
      {player.faceUpCards.length > 0 && (
        <div className="mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1 block">Face-up</span>
          <div className="flex gap-1" aria-label="Face-up cards">
            {player.faceUpCards.map((card) => (
              <Card
                key={card.id}
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
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1 block">Face-down</span>
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
