/**
 * RoomView — Room detail view with player list, ready/start buttons.
 *
 * Displays the room waiting area where players gather before a game starts.
 */
'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { PlayerSlot } from '@/components/lobby/PlayerSlot';
import { useAuth } from '@/hooks/use-auth';
import { useRoomStore } from '@/stores/room-store';
import { useGameStore } from '@/stores/game-store';
import { useUIStore } from '@/stores/ui-store';
import type { RoomDetail } from '@/types/client';

interface RoomViewProps {
  room: RoomDetail;
}

export function RoomView({ room }: RoomViewProps): React.JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const toggleReady = useRoomStore((s) => s.toggleReady);
  const startGame = useRoomStore((s) => s.startGame);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const error = useRoomStore((s) => s.error);
  const gameId = useGameStore((s) => s.gameId);
  const addNotification = useUIStore((s) => s.addNotification);

  const currentUserId = user?.id ?? '';
  const isHost = room.hostId === currentUserId;
  const currentPlayer = room.players.find((p) => p.userId === currentUserId);
  const isReady = currentPlayer?.isReady ?? false;

  const allPlayersReady = useMemo(() => {
    return room.players.length >= room.minPlayers && room.players.every((p) => p.isReady);
  }, [room.players, room.minPlayers]);

  const canStart = isHost && allPlayersReady && room.players.length >= room.minPlayers;

  // If a game has started, navigate to the game page
  if (gameId && room.status === 'IN_GAME') {
    router.push(`/game/${gameId}`);
  }

  const handleToggleReady = useCallback((): void => {
    void toggleReady(room.roomId);
  }, [toggleReady, room.roomId]);

  const handleStartGame = useCallback((): void => {
    void startGame(room.roomId);
  }, [startGame, room.roomId]);

  const handleLeaveRoom = useCallback((): void => {
    void leaveRoom(room.roomId);
    router.push('/lobby');
  }, [leaveRoom, room.roomId, router]);

  const handleCopyInviteLink = useCallback((): void => {
    const url = `${window.location.origin}/lobby/${room.roomId}?invite=${room.inviteCode}`;
    void navigator.clipboard.writeText(url).then(() => {
      addNotification('success', 'Invite link copied to clipboard');
    });
  }, [room.roomId, room.inviteCode, addNotification]);

  // Build player slots (up to maxPlayers)
  const slots = Array.from({ length: room.maxPlayers }, (_, i) => {
    const player = room.players[i] ?? null;
    return (
      <PlayerSlot
        key={player?.userId ?? `empty-${String(i)}`}
        player={player}
        isCurrentUser={player?.userId === currentUserId}
        slotIndex={i}
      />
    );
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Room header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{room.name}</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {room.players.length}/{room.maxPlayers} players
            {room.isPrivate && ' (Private)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {room.isPrivate && (
            <Button variant="ghost" size="sm" onClick={handleCopyInviteLink}>
              Copy Invite Link
            </Button>
          )}
        </div>
      </div>

      {/* Room settings */}
      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="mb-2 text-sm font-medium text-[var(--color-muted)]">Settings</h2>
        <div className="flex gap-6 text-sm">
          <span>Turn Timer: {room.settings.turnTimerSeconds}s</span>
          <span>Max Players: {room.settings.maxPlayers}</span>
          <span>AI Allowed: {room.settings.allowAI ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {/* Player list */}
      <div className="space-y-2" aria-label="Players in room">
        {slots}
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {!isHost && (
          <Button
            variant={isReady ? 'secondary' : 'primary'}
            onClick={handleToggleReady}
          >
            {isReady ? 'Not Ready' : 'Ready'}
          </Button>
        )}

        {isHost && (
          <>
            <Button
              variant={isReady ? 'secondary' : 'primary'}
              onClick={handleToggleReady}
            >
              {isReady ? 'Not Ready' : 'Ready'}
            </Button>
            <Button
              variant="primary"
              onClick={handleStartGame}
              disabled={!canStart}
            >
              Start Game
            </Button>
          </>
        )}

        <Button variant="danger" onClick={handleLeaveRoom}>
          Leave Room
        </Button>
      </div>

      {/* Start game hint */}
      {isHost && !canStart && (
        <p className="text-sm text-[var(--color-muted)]">
          {room.players.length < room.minPlayers
            ? `Need at least ${String(room.minPlayers)} players to start`
            : 'All players must be ready to start'}
        </p>
      )}
    </div>
  );
}
