/**
 * OpponentZone — Sketchy opponent tile.
 *
 * Row 1: avatar + name + hand count (small back cards)
 * Row 2: face-up + face-down cards (if any)
 * Turn glow: 3px green ring matching wireframe `.opp.turn`.
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
  const isXs = (compact ? 'xs' : cardSize) === 'xs';
  const size: 'xs' | 'sm' = compact ? 'xs' : cardSize;

  // Turn glow = green ring like wireframe .opp.turn
  const turnRingStyle = isCurrentTurn
    ? { boxShadow: '0 0 0 3px var(--accent-2), 2px 2px 0 var(--ink)' }
    : undefined;

  const hasFaceUp = player.faceUpCards.length > 0;
  const hasFaceDown = player.faceDownCount > 0;
  const hasSecondRow = hasFaceUp || hasFaceDown;

  return (
    <div
      className={`relative flex min-w-[140px] flex-col gap-1.5 rounded-lg border-2 border-ink bg-paper ${isXs ? 'px-1.5 py-1' : 'px-2 py-2'}`}
      style={turnRingStyle}
      aria-label={`${displayName}'s cards${isCurrentTurn ? ' (current turn)' : ''}`}
    >
      {/* Row 1: avatar-ish circle + name + hand count + conn dot */}
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center justify-center rounded-full border-2 border-ink bg-paper-2 font-display font-bold ${isXs ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-base'}`}
          aria-hidden="true"
        >
          {displayName.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className={`truncate font-display font-bold ${isXs ? 'text-[15px]' : 'text-[18px]'}`}>
            {displayName}
          </span>
          <span className="font-mono text-[10px] text-ink-soft">
            hand: {String(player.handCount)}
          </span>
        </div>
        <span
          className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-ink bg-accent-2"
          aria-hidden="true"
        />
      </div>

      {/* Row 2: face-up (visible) + face-down */}
      {hasSecondRow && (
        <div className="flex flex-col gap-0.5">
          {hasFaceUp && (
            <>
              <div className="zone-label" aria-hidden="true">face-up</div>
              <div className="flex gap-0.5" aria-label="Face-up cards">
                {player.faceUpCards.map((card) => (
                  <Card key={card.id} card={card} size={size} isDisabled />
                ))}
              </div>
            </>
          )}
          {hasFaceDown && (
            <>
              <div className="zone-label" aria-hidden="true">face-down {'\u00B7'} {String(player.faceDownCount)}</div>
              <div className="flex gap-0.5" aria-label={`${String(player.faceDownCount)} face-down cards`}>
                {Array.from({ length: player.faceDownCount }, (_, i) => (
                  <CardBack key={`fd-${String(i)}`} size={size} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
