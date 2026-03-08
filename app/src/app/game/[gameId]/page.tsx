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

  // If the store has a different game or no game, the user navigated directly
  // without a game in progress. Redirect to lobby.
  useEffect(() => {
    if (storeGameId && storeGameId !== gameId) {
      router.push('/lobby');
    }
  }, [storeGameId, gameId, router]);

  // Loading state: waiting for game state from server
  if (!gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <p className="text-[var(--color-muted)]">
          {storeGameId ? 'Loading game...' : 'Waiting for game to start...'}
        </p>
        <button
          onClick={() => router.push('/lobby')}
          className="text-sm text-brand-600 hover:text-brand-700 underline"
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
        <p className="text-lg font-semibold">Game was cancelled</p>
        <button
          onClick={() => router.push('/lobby')}
          className="text-sm text-brand-600 hover:text-brand-700 underline"
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
