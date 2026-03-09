/**
 * RoomCard — Displays a single room summary in the room list.
 */
'use client';

import { useCallback } from 'react';

import { Button } from '@/components/ui/Button';
import type { RoomSummary } from '@/types/client';

interface RoomCardProps {
  room: RoomSummary;
  onJoin: (roomId: string) => void;
  isJoining: boolean;
}

const statusLabels: Record<string, string> = {
  CREATED: 'New',
  WAITING: 'Waiting',
  READY: 'Ready',
  IN_GAME: 'In Game',
  COMPLETED: 'Completed',
  EXPIRED: 'Expired',
};

const statusColors: Record<string, string> = {
  CREATED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800',
  WAITING: 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-800',
  READY: 'bg-gold-100 text-gold-700 dark:bg-gold-900/50 dark:text-gold-300 ring-1 ring-gold-200 dark:ring-gold-800',
  IN_GAME: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-800',
  COMPLETED: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 ring-1 ring-gray-200 dark:ring-gray-700',
  EXPIRED: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 ring-1 ring-gray-200 dark:ring-gray-700',
};

export function RoomCard({ room, onJoin, isJoining }: RoomCardProps): React.JSX.Element {
  const canJoin =
    (room.status === 'WAITING' || room.status === 'CREATED') &&
    room.playerCount < room.maxPlayers;

  const handleJoin = useCallback(() => {
    onJoin(room.roomId);
  }, [onJoin, room.roomId]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-[var(--color-border)] p-4 transition-all duration-200 hover:bg-[var(--color-card-bg)] hover:border-gold-300/50 hover:shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold">{room.name}</h3>
          {room.isPrivate && (
            <span className="shrink-0 text-xs font-medium text-[var(--color-muted)]" aria-label="Private room">
              Private
            </span>
          )}
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[room.status] ?? ''}`}
          >
            {statusLabels[room.status] ?? room.status}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>Host: {room.hostDisplayName}</span>
          <span>
            Players: {room.playerCount}/{room.maxPlayers}
          </span>
          <span>Timer: {room.turnTimerSeconds}s</span>
        </div>
      </div>

      {canJoin && (
        <Button
          variant="primary"
          size="sm"
          onClick={handleJoin}
          isLoading={isJoining}
          aria-label={`Join room ${room.name}`}
        >
          Join
        </Button>
      )}
    </div>
  );
}
