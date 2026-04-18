/**
 * PlayerSlot — Sketchy seat tile in a room waiting area.
 *
 * Matches wireframe `.seat`: 2px ink border, 8px radius, paper bg.
 * Empty seats = dashed. AI = blue avatar. Host = yellow avatar.
 * Current user = blue inset ring.
 */
'use client';

import type { RoomPlayer } from '@sbobuz/shared';

interface PlayerSlotProps {
  player: RoomPlayer | null;
  isCurrentUser: boolean;
  slotIndex: number;
}

export function PlayerSlot({
  player,
  isCurrentUser,
  slotIndex,
}: PlayerSlotProps): React.JSX.Element {
  if (!player) {
    return (
      <div
        className="flex min-h-[150px] items-center justify-center rounded-lg border-2 border-dashed border-line-soft bg-paper/0 p-3.5 text-center font-display text-[22px] text-line-soft"
        aria-label={`Empty player slot ${String(slotIndex + 1)}`}
      >
        + invite /
        <br />
        + add bot
      </div>
    );
  }

  const avatarColor = player.isAI
    ? 'bg-accent-3 text-paper'
    : player.isHost
      ? 'bg-accent-y text-ink'
      : 'bg-paper-2 text-ink';

  const ringClass = isCurrentUser
    ? 'shadow-[inset_0_0_0_3px_var(--accent-3)]'
    : '';

  return (
    <div
      className={`relative flex min-h-[150px] flex-col gap-2 rounded-lg border-2 border-ink bg-paper p-3.5 ${ringClass}`}
      aria-label={`Player: ${player.displayName}${player.isHost ? ', host' : ''}${player.isReady ? ', ready' : ', not ready'}`}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink font-display text-[22px] font-bold ${avatarColor}`}
        >
          {player.isAI ? '\u{1F916}' : player.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-[22px] font-semibold leading-tight">
            {player.displayName}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {player.isHost && <span className="pill yellow">host</span>}
            {player.isAI && (
              <span className="pill">
                bot{player.aiDifficulty ? ` (${player.aiDifficulty})` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom strip: ready + hint */}
      <div className="mt-auto flex items-center justify-between">
        {player.isReady ? (
          <span className="pill green">
            {player.isAI ? 'auto-ready' : '\u2713 ready'}
          </span>
        ) : (
          <span className="pill gray">not ready</span>
        )}
        <span className="font-mono text-[10px] text-line-soft">
          {isCurrentUser ? 'you' : ''}
          {player.connectionStatus === 'disconnected' && (
            <span className="ml-2 text-accent">offline</span>
          )}
        </span>
      </div>
    </div>
  );
}
