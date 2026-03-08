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
        className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] px-4 py-3"
        aria-label={`Empty player slot ${String(slotIndex + 1)}`}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-card-bg)]">
          <span className="text-sm text-[var(--color-muted)]">?</span>
        </div>
        <span className="text-sm text-[var(--color-muted)]">Waiting for player...</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
        isCurrentUser
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
          : 'border-[var(--color-border)]'
      }`}
      aria-label={`Player: ${player.displayName}${player.isHost ? ', host' : ''}${player.isReady ? ', ready' : ', not ready'}`}
    >
      {/* Avatar placeholder */}
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700 dark:bg-brand-900 dark:text-brand-300">
        {player.displayName.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm font-medium ${isCurrentUser ? 'text-brand-700 dark:text-brand-300' : ''}`}>
            {player.displayName}
            {isCurrentUser && ' (you)'}
          </span>
          {player.isHost && (
            <span className="shrink-0 rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              Host
            </span>
          )}
          {player.isAI && (
            <span className="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              AI{player.aiDifficulty ? ` (${player.aiDifficulty})` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Ready status */}
      <div className="shrink-0">
        {player.isReady ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900" aria-label="Ready">
            <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        ) : (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"
            aria-label="Not ready"
          >
            <span className="h-2 w-2 rounded-full bg-gray-400" />
          </span>
        )}
      </div>

      {/* Connection status */}
      {player.connectionStatus === 'disconnected' && (
        <span className="text-xs text-red-500" aria-label="Disconnected">
          Disconnected
        </span>
      )}
    </div>
  );
}
