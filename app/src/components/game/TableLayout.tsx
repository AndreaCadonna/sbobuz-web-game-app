/**
 * TableLayout — Positions opponents and center piles in a row-based layout.
 *
 * Layout varies by opponent count:
 *   1 opp (2p): [top: opponent] [middle: table]
 *   2 opp (3p): [top: opp1 | opp2] [middle: table]
 *   3 opp (4p): [top: opp1] [middle: opp2 | table | opp3]
 *   4 opp (5p): [top: opp1 | opp2] [middle: opp3 | table | opp4]
 *
 * Mobile (<sm): Horizontal scrollable strip with compact opponent cards.
 * The current player (me) is always at the bottom, rendered outside this component.
 */
'use client';

import { OpponentZone } from '@/components/game/OpponentZone';
import { useViewportTier } from '@/hooks/use-viewport-tier';
import type { SanitizedPlayerState } from '@/types/client';

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

// ── Opponent Card Helper ────────────────────────────────────────

function OpponentCard({
  player,
  currentPlayerId,
  playerNames,
  compact,
  cardSize,
}: {
  player: SanitizedPlayerState;
  currentPlayerId: string | null;
  playerNames: PlayerNameMap;
  compact: boolean;
  cardSize: 'xs' | 'sm';
}): React.JSX.Element {
  return (
    <OpponentZone
      player={player}
      isCurrentTurn={currentPlayerId === player.id}
      displayName={playerNames[player.id] ?? 'Unknown'}
      compact={compact}
      cardSize={cardSize}
    />
  );
}

// ── Component ───────────────────────────────────────────────────

export function TableLayout({
  opponents,
  currentPlayerId,
  playerNames,
  centerContent,
}: TableLayoutProps): React.JSX.Element {
  const tier = useViewportTier();
  const isCompact = tier === 'compact';
  const isMobile = tier === 'mobile';

  const cardSize = 'xs' as const;
  const rowGap = isCompact ? 'gap-2' : 'gap-3';

  // Shared props for rendering an opponent
  const opp = (player: SanitizedPlayerState): React.JSX.Element => (
    <div key={player.id}>
      <OpponentCard
        player={player}
        currentPlayerId={currentPlayerId}
        playerNames={playerNames}
        compact={isCompact}
        cardSize={cardSize}
      />
    </div>
  );

  // ── Mobile: horizontal scroll strip ───────────────────────────
  if (isMobile) {
    return (
      <div aria-label="Game table">
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin">
          {opponents.map((opponent) => (
            <div key={opponent.id} className="min-w-[130px] max-w-[180px] snap-start shrink-0">
              <OpponentCard
                player={opponent}
                currentPlayerId={currentPlayerId}
                playerNames={playerNames}
                compact
                cardSize="xs"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Desktop: row-based layout by opponent count ───────────────

  // 1 opponent (2 players): top row = opponent, second row = table
  if (opponents.length === 1) {
    return (
      <div className={`flex flex-col items-center ${rowGap}`} aria-label="Game table">
        <div className="flex justify-center">
          {opp(opponents[0]!)}
        </div>
        <div className="flex justify-center">
          {centerContent}
        </div>
      </div>
    );
  }

  // 2 opponents (3 players): top row = 2 opponents, second row = table
  if (opponents.length === 2) {
    return (
      <div className={`flex flex-col items-center ${rowGap}`} aria-label="Game table">
        <div className={`flex justify-center ${rowGap}`}>
          {opp(opponents[0]!)}
          {opp(opponents[1]!)}
        </div>
        <div className="flex justify-center">
          {centerContent}
        </div>
      </div>
    );
  }

  // 3 opponents (4 players): top row = opp1, middle row = opp2 | table | opp3
  if (opponents.length === 3) {
    return (
      <div className={`flex flex-col items-center ${rowGap}`} aria-label="Game table">
        <div className="flex justify-center">
          {opp(opponents[0]!)}
        </div>
        <div className={`flex items-center justify-center ${rowGap}`}>
          {opp(opponents[1]!)}
          <div className="flex justify-center">{centerContent}</div>
          {opp(opponents[2]!)}
        </div>
      </div>
    );
  }

  // 4 opponents (5 players): top row = opp1 | opp2, middle row = opp3 | table | opp4
  if (opponents.length === 4) {
    return (
      <div className={`flex flex-col items-center ${rowGap}`} aria-label="Game table">
        <div className={`flex justify-center ${rowGap}`}>
          {opp(opponents[0]!)}
          {opp(opponents[1]!)}
        </div>
        <div className={`flex items-center justify-center ${rowGap}`}>
          {opp(opponents[2]!)}
          <div className="flex justify-center">{centerContent}</div>
          {opp(opponents[3]!)}
        </div>
      </div>
    );
  }

  // Fallback for >4 opponents: all in top row, table below
  return (
    <div className={`flex flex-col items-center ${rowGap}`} aria-label="Game table">
      <div className={`flex flex-wrap justify-center ${rowGap}`}>
        {opponents.map((opponent) => opp(opponent))}
      </div>
      <div className="flex justify-center">
        {centerContent}
      </div>
    </div>
  );
}
