/**
 * RoomList — Displays the list of available game rooms.
 *
 * Sketchy-wireframe grid with a header row on top and 1 row per room.
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
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-paper-2 border-t-ink" />
          <span className="font-body text-sm text-ink-soft">Loading rooms...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sk sk-alt border-accent text-accent" role="alert">
        <p className="font-body text-sm font-semibold">{error}</p>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="sk sk-dashed p-12 text-center">
        <p className="font-display text-2xl text-ink">No rooms open</p>
        <p className="mt-1 font-body text-sm text-ink-soft">
          Create a room to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5" role="list" aria-label="Available game rooms">
      {/* Header row — matches wireframe column names */}
      <div
        className="hidden sm:grid grid-cols-[2fr_1.2fr_1fr_0.9fr_0.8fr] items-center gap-3 rounded-md border-2 border-dashed border-line-soft bg-paper-2 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-ink-soft"
        aria-hidden="true"
      >
        <div>room name</div>
        <div>host</div>
        <div>players</div>
        <div>timer</div>
        <div>join</div>
      </div>

      {rooms.map((room) => (
        <div key={room.roomId} role="listitem">
          <RoomCard room={room} onJoin={handleJoin} isJoining={isJoiningRoom} />
        </div>
      ))}
    </div>
  );
}
