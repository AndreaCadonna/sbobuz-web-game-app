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
        <div className="sk sk-wobble border-accent text-center" role="alert">
          <h2 className="font-display text-2xl font-bold text-accent">
            Room not found
          </h2>
          <p className="mt-2 font-body text-sm text-ink-soft">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentRoom || currentRoom.roomId !== roomId) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-paper-2 border-t-ink" />
          <span className="font-body text-sm text-ink-soft">Loading room...</span>
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
