/**
 * RoomView — Room detail view with player list, ready/start buttons.
 *
 * Displays the room waiting area where players gather before a game starts.
 * Players are arranged in a circular layout.
 */
'use client';

import { useCallback, useEffect, useMemo } from 'react';
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
  const addAIPlayer = useRoomStore((s) => s.addAIPlayer);
  const error = useRoomStore((s) => s.error);
  const isStartingGame = useRoomStore((s) => s.isStartingGame);
  const gameId = useGameStore((s) => s.gameId);
  const gameState = useGameStore((s) => s.gameState);
  const addNotification = useUIStore((s) => s.addNotification);

  const currentUserId = user?.id ?? '';
  const isHost = room.hostId === currentUserId;
  const currentPlayer = room.players.find((p) => p.userId === currentUserId);
  const isReady = currentPlayer?.isReady ?? false;

  const allPlayersReady = useMemo(() => {
    const humanPlayers = room.players.filter((p) => !p.isAI);
    return room.players.length >= room.minPlayers && humanPlayers.every((p) => p.isReady);
  }, [room.players, room.minPlayers]);

  const canStart = isHost && allPlayersReady && room.players.length >= room.minPlayers;
  const canAddAI = isHost && room.settings.allowAI && room.players.length < room.maxPlayers
    && room.status !== 'IN_GAME';

  // Navigate to the game page when game:started socket event provides both gameId and state
  useEffect(() => {
    if (gameId && gameState) {
      router.push(`/game/${gameId}`);
    }
  }, [gameId, gameState, router]);

  const handleToggleReady = useCallback((): void => {
    void toggleReady(room.roomId, !isReady);
  }, [toggleReady, room.roomId, isReady]);

  const handleStartGame = useCallback((): void => {
    void startGame(room.roomId);
  }, [startGame, room.roomId]);

  const handleLeaveRoom = useCallback((): void => {
    void leaveRoom(room.roomId);
    router.push('/lobby');
  }, [leaveRoom, room.roomId, router]);

  const handleAddAI = useCallback((difficulty: 'easy' | 'medium' = 'easy'): void => {
    void addAIPlayer(room.roomId, difficulty);
  }, [addAIPlayer, room.roomId]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{room.name}</h1>
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
      <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-card-bg)] p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">Settings</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--color-muted)]">Timer:</span>
            <span className="font-semibold">{room.settings.turnTimerSeconds}s</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--color-muted)]">Max:</span>
            <span className="font-semibold">{room.settings.maxPlayers} players</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--color-muted)]">AI:</span>
            <span className="font-semibold">{room.settings.allowAI ? 'Allowed' : 'Disabled'}</span>
          </div>
        </div>
      </div>

      {/* Player circle layout */}
      <div
        className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-[var(--color-border)] bg-felt-table p-6 sm:p-8 min-h-[200px]"
        aria-label="Players in room"
      >
        {slots}
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
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
              disabled={!canStart || isStartingGame}
            >
              {isStartingGame ? 'Starting...' : 'Start Game'}
            </Button>
          </>
        )}

        <Button variant="danger" onClick={handleLeaveRoom}>
          Leave Room
        </Button>
      </div>

      {/* Add AI buttons */}
      {canAddAI && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-[var(--color-muted)]">Add AI:</span>
          <Button variant="secondary" size="sm" onClick={() => handleAddAI('easy')}>
            Easy
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleAddAI('medium')}>
            Medium
          </Button>
        </div>
      )}

      {/* Start game hint */}
      {isHost && !canStart && (
        <p className="text-sm text-[var(--color-muted)] text-center">
          {room.players.length < room.minPlayers
            ? `Need at least ${String(room.minPlayers)} players to start`
            : 'All players must be ready to start'}
        </p>
      )}
    </div>
  );
}
