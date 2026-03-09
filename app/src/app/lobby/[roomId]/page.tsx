'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

import { RoomView } from '@/components/lobby/RoomView';
import { useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';
import { useSocketStore } from '@/stores/socket-store';
import { getSocket } from '@/lib/socket';
import { logger } from '@/lib/logger';

export default function RoomDetailPage(): React.JSX.Element {
  const params = useParams();
  const roomId = params.roomId as string;

  const currentRoom = useRoomStore((s) => s.currentRoom);
  const fetchRoom = useRoomStore((s) => s.fetchRoom);
  const error = useRoomStore((s) => s.error);
  const isConnected = useSocketStore((s) => s.status === 'connected');
  const connectionId = useSocketStore((s) => s.connectionId);
  // Stable boolean: true once the store has data for this roomId.
  // Prevents the full currentRoom object from re-triggering the socket effect.
  const hasRoomData = currentRoom?.roomId === roomId;
  const socketRoomRef = useRef<{ roomId: string; connectionId: number } | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!hasRoomData) {
      void fetchRoom(roomId);
    }
  }, [roomId, hasRoomData, fetchRoom]);

  // Subscribe the socket to the Socket.IO room so the server
  // tracks our roomId and allows game actions.
  useEffect(() => {
    isMountedRef.current = true;

    if (!isConnected || !hasRoomData) return;
    if (socketRoomRef.current?.roomId === roomId && socketRoomRef.current?.connectionId === connectionId) return; // already joined

    const socket = getSocket();
    if (!socket?.connected) return;

    // Mark as joined immediately to prevent duplicate emits
    socketRoomRef.current = { roomId, connectionId };

    socket.emit('room:join', { roomId }, (response) => {
      if (response.success) {
        logger.info({ roomId }, 'Socket joined room');
        if (response.roomState) {
          useRoomStore.getState().handleRoomStateUpdate(response.roomState);
        }
      } else {
        // Reset so a retry can happen on next effect run
        if (socketRoomRef.current?.roomId === roomId) {
          socketRoomRef.current = null;
        }
        logger.warn({ roomId, error: response.error }, 'Socket room:join failed');
      }
    });

    return () => {
      isMountedRef.current = false;
      // Only leave if we're truly unmounting (not Strict Mode re-mount).
      // Defer via microtask: if React re-mounts immediately, isMountedRef
      // will be set back to true and we skip the leave.
      const capturedRoomId = roomId;
      queueMicrotask(() => {
        if (!isMountedRef.current && socketRoomRef.current?.roomId === capturedRoomId) {
          // If a game is active, the player is navigating to the game page —
          // do NOT leave the room or the server will clear the room association
          // and game actions will fail with NOT_IN_ROOM.
          if (useGameStore.getState().gameId) {
            return;
          }
          const s = getSocket();
          if (s?.connected) {
            s.emit('room:leave', { roomId: capturedRoomId }, () => {
              logger.info({ roomId: capturedRoomId }, 'Socket left room');
            });
          }
          socketRoomRef.current = null;
        }
      });
    };
  }, [isConnected, hasRoomData, roomId, connectionId]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl bg-red-50 border border-red-200 p-8 text-center dark:bg-red-950/50 dark:border-red-800" role="alert">
          <h2 className="font-display text-lg font-bold text-red-700 dark:text-red-300">
            Room Not Found
          </h2>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentRoom || currentRoom.roomId !== roomId) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <span className="text-sm font-medium text-[var(--color-muted)]">Loading room...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <RoomView room={currentRoom} />
    </div>
  );
}
