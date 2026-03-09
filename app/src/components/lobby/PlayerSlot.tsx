/**
 * PlayerSlot — Displays a player's presence in a room waiting area.
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
        className="flex flex-col items-center gap-2 p-4"
        aria-label={`Empty player slot ${String(slotIndex + 1)}`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <span className="text-lg text-[var(--color-muted)]/50">?</span>
        </div>
        <span className="text-xs font-medium text-[var(--color-muted)]">Waiting...</span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 ${
        isCurrentUser
          ? 'bg-brand-50/60 ring-2 ring-brand-400/50 dark:bg-brand-950/30'
          : ''
      }`}
      aria-label={`Player: ${player.displayName}${player.isHost ? ', host' : ''}${player.isReady ? ', ready' : ', not ready'}`}
    >
      {/* Avatar */}
      <div className="relative">
        <div className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold shadow-sm ${
          isCurrentUser
            ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white'
            : 'bg-gradient-to-b from-gold-200 to-gold-400 text-gold-900 dark:from-gold-700 dark:to-gold-900 dark:text-gold-100'
        }`}>
          {player.displayName.charAt(0).toUpperCase()}
        </div>
        {/* Ready indicator */}
        <div className="absolute -bottom-0.5 -right-0.5">
          {player.isReady ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 ring-2 ring-[var(--color-background)] shadow-sm" aria-label="Ready">
              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </span>
          ) : (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-border)] ring-2 ring-[var(--color-background)]"
              aria-label="Not ready"
            >
              <span className="h-2 w-2 rounded-full bg-[var(--color-muted)]" />
            </span>
          )}
        </div>
      </div>

      {/* Name and badges */}
      <div className="text-center min-w-0 max-w-[100px]">
        <span className={`block truncate text-sm font-semibold ${isCurrentUser ? 'text-brand-700 dark:text-brand-300' : ''}`}>
          {player.displayName}
        </span>
        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
          {isCurrentUser && (
            <span className="text-[10px] font-medium text-[var(--color-muted)]">You</span>
          )}
          {player.isHost && (
            <span className="rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] font-bold text-gold-700 dark:bg-gold-900/50 dark:text-gold-300">
              Host
            </span>
          )}
          {player.isAI && (
            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              AI{player.aiDifficulty ? ` ${player.aiDifficulty}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Connection status */}
      {player.connectionStatus === 'disconnected' && (
        <span className="text-[10px] font-bold text-red-500" aria-label="Disconnected">
          Disconnected
        </span>
      )}
    </div>
  );
}
