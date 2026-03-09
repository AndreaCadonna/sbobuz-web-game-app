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

    // Poll for room list updates every 5 seconds since there is
    // no socket event for lobby-wide room list changes
    const interval = setInterval(() => {
      void fetchRooms();
    }, 5_000);

    return () => clearInterval(interval);
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
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <span className="text-sm font-medium text-[var(--color-muted)]">Loading rooms...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center dark:bg-red-950/50 dark:border-red-800" role="alert">
        <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] p-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-card-bg)]">
          <span className="text-2xl text-[var(--color-muted)]/50" aria-hidden="true">{'\u2663'}</span>
        </div>
        <p className="font-medium text-[var(--color-foreground)]">No rooms available</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Create a room to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" role="list" aria-label="Available game rooms">
      {rooms.map((room) => (
        <div key={room.roomId} role="listitem">
          <RoomCard room={room} onJoin={handleJoin} isJoining={isJoiningRoom} />
        </div>
      ))}
    </div>
  );
}
