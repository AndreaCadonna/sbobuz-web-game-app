/**
 * RoomView — Sketchy room waiting area.
 *
 * Two-col layout: seats grid on the left, settings + invite + AI add +
 * start-game controls on the right. Matches wireframe variant A.
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
  const canAddAI =
    isHost && room.settings.allowAI && room.players.length < room.maxPlayers && room.status !== 'IN_GAME';

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

  const handleAddAI = useCallback(
    (difficulty: 'easy' | 'medium' = 'easy'): void => {
      void addAIPlayer(room.roomId, difficulty);
    },
    [addAIPlayer, room.roomId],
  );

  const handleCopyInviteLink = useCallback((): void => {
    const url = `${window.location.origin}/lobby/${room.roomId}?invite=${room.inviteCode}`;
    void navigator.clipboard.writeText(url).then(() => {
      addNotification('success', 'Invite link copied to clipboard');
    });
  }, [room.roomId, room.inviteCode, addNotification]);

  const humanReadyCount = room.players.filter((p) => !p.isAI && p.isReady).length;
  const humanCount = room.players.filter((p) => !p.isAI).length;

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

  const hostName = room.players.find((p) => p.isHost)?.displayName ?? 'host';

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Room header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">{room.name}</h1>
          <p className="mt-0.5 font-body text-sm text-ink-soft">
            hosted by <strong className="text-ink">{hostName}</strong> {'\u00B7'}{' '}
            {room.isPrivate ? 'private' : 'public'} {'\u00B7'}{' '}
            <span className="pill green">{room.status.toLowerCase()}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopyInviteLink}>
            {'\u{1F4CB} '}copy invite link
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Left: seats */}
        <div>
          <div className="label-tiny">
            players {'\u00B7'} {room.players.length} of {room.maxPlayers} {'\u00B7'} min {room.minPlayers} to start
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {slots}
          </div>
        </div>

        {/* Right: settings + controls */}
        <div className="space-y-3">
          <div className="sk">
            <div className="label-tiny">room settings {'\u00B7'} host only</div>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-body text-[15px]">
              <div>max players</div>
              <div>
                <strong>{room.maxPlayers}</strong>{' '}
                <span className="text-line-soft">({room.minPlayers}–5)</span>
              </div>
              <div>turn timer</div>
              <div>
                <strong>{room.settings.turnTimerSeconds}s</strong>
              </div>
              <div>allow AI</div>
              <div>{room.settings.allowAI ? '\u2713 on' : 'off'}</div>
              <div>visibility</div>
              <div>{room.isPrivate ? '\u{1F512} private' : '\u{1F310} public'}</div>
            </div>
          </div>

          {room.isPrivate && (
            <div className="sk sk-alt">
              <div className="label-tiny">invite link</div>
              <div className="mt-1 overflow-x-auto rounded border-[1.5px] border-dashed border-ink bg-paper p-1.5 font-mono text-xs text-ink">
                sbobuz.app/lobby/{room.roomId}?invite={room.inviteCode}
              </div>
            </div>
          )}

          {canAddAI && (
            <div className="sk">
              <div className="label-tiny">add AI opponent</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleAddAI('easy')}>
                  easy
                </Button>
                <Button variant="primary" size="sm" onClick={() => handleAddAI('medium')}>
                  medium
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="sk sk-alt !py-2 !px-3 text-sm font-semibold text-accent" role="alert">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2.5">
            {isHost ? (
              <>
                <Button variant="green" size="lg" onClick={handleStartGame} disabled={!canStart || isStartingGame} isLoading={isStartingGame}>
                  {'\u25B8 START GAME'}
                </Button>
                <p className="text-center font-body text-[13px] text-ink-soft">
                  {canStart
                    ? `all humans ready \u00B7 ${String(room.players.length)}/${String(room.maxPlayers)} players \u00B7 host only`
                    : room.players.length < room.minPlayers
                      ? `need at least ${String(room.minPlayers)} players`
                      : `waiting for humans \u00B7 ${String(humanReadyCount)}/${String(humanCount)} ready`}
                </p>
                <Button variant="secondary" size="sm" onClick={handleToggleReady}>
                  {isReady ? 'unready' : 'ready'}
                </Button>
              </>
            ) : (
              <Button variant={isReady ? 'secondary' : 'green'} size="lg" onClick={handleToggleReady}>
                {isReady ? 'not ready' : '\u2713 ready'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLeaveRoom}>
              {'\u21E0 '}leave room
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
