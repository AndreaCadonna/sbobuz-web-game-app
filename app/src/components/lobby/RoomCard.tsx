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
  CREATED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  WAITING: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  READY: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  IN_GAME: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  COMPLETED: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
  EXPIRED: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
};

export function RoomCard({ room, onJoin, isJoining }: RoomCardProps): React.JSX.Element {
  const canJoin =
    (room.status === 'WAITING' || room.status === 'CREATED') &&
    room.playerCount < room.maxPlayers;

  const handleJoin = useCallback(() => {
    onJoin(room.roomId);
  }, [onJoin, room.roomId]);

  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-card-bg)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium">{room.name}</h3>
          {room.isPrivate && (
            <span className="shrink-0 text-xs text-[var(--color-muted)]" aria-label="Private room">
              Private
            </span>
          )}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[room.status] ?? ''}`}
          >
            {statusLabels[room.status] ?? room.status}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-4 text-sm text-[var(--color-muted)]">
          <span>Host: {room.hostDisplayName}</span>
          <span>
            Players: {room.playerCount}/{room.maxPlayers}
          </span>
          <span>Timer: {room.turnTimerSeconds}s</span>
        </div>
      </div>

      {canJoin && (
        <Button
          variant="secondary"
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
