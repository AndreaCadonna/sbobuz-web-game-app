/**
 * TableLayout — Positions opponents around a virtual table.
 *
 * Desktop (sm+): Uses absolute positioning within a relative container.
 * Mobile (<sm): Horizontal scrollable strip with compact opponent cards.
 * The current player is always at the bottom (rendered outside this component).
 */
'use client';

import { useMemo } from 'react';

import { OpponentZone } from '@/components/game/OpponentZone';
import type { SanitizedPlayerState } from '@/types/client';

// ── Position Helpers ────────────────────────────────────────────

interface SlotPosition {
  top: string;
  left: string;
  translate: string;
}

/**
 * Returns absolute positions for opponents around the table.
 * Index 0 = top/left-most, proceeding clockwise.
 */
function getOpponentPositions(opponentCount: number): SlotPosition[] {
  switch (opponentCount) {
    case 1:
      // 2 players: single opponent centered at top
      return [{ top: '2%', left: '50%', translate: '-50%' }];
    case 2:
      // 3 players: two opponents across the top
      return [
        { top: '2%', left: '28%', translate: '-50%' },
        { top: '2%', left: '72%', translate: '-50%' },
      ];
    case 3:
      // 4 players: one top-center, two at sides
      return [
        { top: '2%', left: '50%', translate: '-50%' },
        { top: '42%', left: '2%', translate: '0' },
        { top: '42%', left: '98%', translate: '-100%' },
      ];
    case 4:
      // 5 players: two across top, two at sides
      return [
        { top: '2%', left: '25%', translate: '-50%' },
        { top: '2%', left: '75%', translate: '-50%' },
        { top: '42%', left: '2%', translate: '0' },
        { top: '42%', left: '98%', translate: '-100%' },
      ];
    default:
      // Fallback: stack at top
      return Array.from({ length: opponentCount }, (_, i) => ({
        top: '2%',
        left: `${String(((i + 1) / (opponentCount + 1)) * 100)}%`,
        translate: '-50%',
      }));
  }
}

// ── Props ───────────────────────────────────────────────────────

interface PlayerNameMap {
  [playerId: string]: string;
}

interface TableLayoutProps {
  opponents: ReadonlyArray<SanitizedPlayerState>;
  currentPlayerId: string | null;
  playerNames: PlayerNameMap;
  centerContent: React.ReactNode;
}

// ── Component ───────────────────────────────────────────────────

export function TableLayout({
  opponents,
  currentPlayerId,
  playerNames,
  centerContent,
}: TableLayoutProps): React.JSX.Element {
  const positions = useMemo(
    () => getOpponentPositions(opponents.length),
    [opponents.length],
  );

  return (
    <>
      {/* Mobile: horizontal scroll strip with compact opponent cards */}
      <div className="sm:hidden" aria-label="Game table">
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin">
          {opponents.map((opponent) => (
            <OpponentZone
              key={opponent.id}
              player={opponent}
              isCurrentTurn={currentPlayerId === opponent.id}
              displayName={playerNames[opponent.id] ?? 'Unknown'}
              compact
            />
          ))}
        </div>
      </div>

      {/* Desktop: absolute positioned layout */}
      <div className="hidden sm:block relative min-h-[22rem] w-full overflow-hidden" aria-label="Game table">
        {/* Opponent zones at computed positions */}
        {opponents.map((opponent, index) => {
          const pos = positions[index];
          if (!pos) return null;

          return (
            <div
              key={opponent.id}
              className="absolute w-[180px] z-10 max-h-[40%] overflow-hidden"
              style={{
                top: pos.top,
                left: pos.left,
                transform: `translateX(${pos.translate})`,
              }}
            >
              <OpponentZone
                player={opponent}
                isCurrentTurn={currentPlayerId === opponent.id}
                displayName={playerNames[opponent.id] ?? 'Unknown'}
              />
            </div>
          );
        })}

        {/* Center table area — play/draw piles */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          {centerContent}
        </div>
      </div>
    </>
  );
}
