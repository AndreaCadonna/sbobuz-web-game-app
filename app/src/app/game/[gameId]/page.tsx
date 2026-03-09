/**
 * Game page — Renders the game board for an active game.
 *
 * Connects to game state via the game store (populated by socket events)
 * and wires all user actions through the useGame hook.
 */
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { GameBoard } from '@/components/game/GameBoard';
import { useGame } from '@/hooks/use-game';
import { useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';
import { useSocketStore } from '@/stores/socket-store';
import { getSocket } from '@/lib/socket';
import { logger } from '@/lib/logger';

export default function GamePage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const storeGameId = useGameStore((s) => s.gameId);

  const {
    gameState,
    myPlayerId,
    playerNames,
    isSubmitting,
    actionError,
    isGameOver,
    winnerId,
    gameOverReason,
    playCards,
    pickUpPile,
    playBlind,
    declareDirection,
    clearGameOver,
  } = useGame(gameId);

  const roomId = useRoomStore((s) => s.currentRoom?.roomId ?? null);
  const isConnected = useSocketStore((s) => s.status === 'connected');
  const connectionId = useSocketStore((s) => s.connectionId);

  // If the store has a different game or no game, the user navigated directly
  // without a game in progress. Redirect to lobby.
  useEffect(() => {
    if (storeGameId && storeGameId !== gameId) {
      router.push('/lobby');
    }
  }, [storeGameId, gameId, router]);

  // Join the Socket.IO room on each new connection. When navigating from
  // lobby -> game, the layout remount destroys and recreates the socket,
  // so the new connection has no room association. The server requires the
  // socket to be in a room before it will accept game:action events.
  useEffect(() => {
    if (!isConnected || !roomId) return;

    const socket = getSocket();
    if (!socket?.connected) return;

    socket.emit('room:join', { roomId }, (response) => {
      if (response.success) {
        logger.info({ roomId }, 'Socket joined room for game');
      } else {
        logger.warn({ roomId, error: response.error }, 'Socket room:join failed on game page');
      }
    });
  }, [connectionId, roomId, isConnected]);

  // Re-sync authoritative state on each active socket connection. This covers
  // missed broadcasts during route transitions, including an opening AI move.
  useEffect(() => {
    if (!isConnected) return;

    const socket = getSocket();
    if (!socket?.connected) return;

    logger.info({ gameId }, 'Requesting game state from server');
    socket.emit('game:request_state', { gameId }, (response) => {
      if (response.success && response.state) {
        logger.info({ gameId }, 'Received game state from server');
        useGameStore.getState().handleGameStarted({
          gameId,
          initialState: response.state,
        });
      } else {
        logger.warn({ gameId, error: response.error }, 'Failed to get game state');
      }
    });
  }, [connectionId, gameId, isConnected]);

  // Loading state: waiting for game state from server
  if (!gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <p className="text-sm font-medium text-[var(--color-muted)]">
          {storeGameId ? 'Loading game...' : 'Waiting for game to start...'}
        </p>
        <button
          onClick={() => router.push('/lobby')}
          className="text-sm font-semibold text-brand-600 hover:text-brand-500 underline underline-offset-2 transition-colors"
        >
          Return to Lobby
        </button>
      </div>
    );
  }

  // Game is in finished/cancelled phase but modal was dismissed
  if (gameState.phase === 'cancelled' && !isGameOver) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="font-display text-xl font-bold">Game was cancelled</p>
        <button
          onClick={() => router.push('/lobby')}
          className="text-sm font-semibold text-brand-600 hover:text-brand-500 underline underline-offset-2 transition-colors"
        >
          Return to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl h-[calc(100vh-3.5rem)]">
      <GameBoard
        gameState={gameState}
        myPlayerId={myPlayerId}
        playerNames={playerNames}
        isSubmitting={isSubmitting}
        actionError={actionError}
        isGameOver={isGameOver}
        winnerId={winnerId}
        gameOverReason={gameOverReason}
        onPlayCards={playCards}
        onPickUpPile={pickUpPile}
        onPlayBlind={playBlind}
        onDeclareDirection={declareDirection}
        onGameOverClose={clearGameOver}
      />
    </div>
  );
}
