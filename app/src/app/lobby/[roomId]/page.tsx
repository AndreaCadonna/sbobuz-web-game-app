'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

import { RoomView } from '@/components/lobby/RoomView';
import { useRoomStore } from '@/stores/room-store';

export default function RoomDetailPage(): React.JSX.Element {
  const params = useParams();
  const roomId = params.roomId as string;

  const currentRoom = useRoomStore((s) => s.currentRoom);
  const fetchRoom = useRoomStore((s) => s.fetchRoom);
  const error = useRoomStore((s) => s.error);

  useEffect(() => {
    if (!currentRoom || currentRoom.roomId !== roomId) {
      void fetchRoom(roomId);
    }
  }, [roomId, currentRoom, fetchRoom]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-950" role="alert">
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">
            Room Not Found
          </h2>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentRoom || currentRoom.roomId !== roomId) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <span className="ml-3 text-[var(--color-muted)]">Loading room...</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <RoomView room={currentRoom} />
    </div>
  );
}
