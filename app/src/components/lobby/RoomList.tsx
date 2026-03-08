/**
 * RoomList — Displays the list of available game rooms.
 */
'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { RoomCard } from '@/components/lobby/RoomCard';
import { useRoomStore } from '@/stores/room-store';

export function RoomList(): React.JSX.Element {
  const router = useRouter();
  const rooms = useRoomStore((s) => s.rooms);
  const isLoadingRooms = useRoomStore((s) => s.isLoadingRooms);
  const isJoiningRoom = useRoomStore((s) => s.isJoiningRoom);
  const error = useRoomStore((s) => s.error);
  const fetchRooms = useRoomStore((s) => s.fetchRooms);
  const joinRoom = useRoomStore((s) => s.joinRoom);

  useEffect(() => {
    void fetchRooms();
  }, [fetchRooms]);

  const handleJoin = useCallback(
    async (roomId: string) => {
      const success = await joinRoom(roomId);
      if (success) {
        router.push(`/lobby/${roomId}`);
      }
    },
    [joinRoom, router],
  );

  if (isLoadingRooms) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <span className="ml-3 text-[var(--color-muted)]">Loading rooms...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
        {error}
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-[var(--color-muted)]">No rooms available</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Create a room to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Available game rooms">
      {rooms.map((room) => (
        <div key={room.roomId} role="listitem">
          <RoomCard room={room} onJoin={handleJoin} isJoining={isJoiningRoom} />
        </div>
      ))}
    </div>
  );
}
