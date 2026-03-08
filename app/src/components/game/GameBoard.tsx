/**
 * GameBoard — Main game board layout component.
 *
 * Arranges all game zones: opponents at top, play/draw piles in center,
 * player's cards at bottom, controls below. Responsive layout.
 * All game state comes from the server via the game store.
 */
'use client';

import { useMemo } from 'react';

import { DrawPile } from '@/components/game/DrawPile';
import { FaceDownCards } from '@/components/game/FaceDownCards';
import { FaceUpCards } from '@/components/game/FaceUpCards';
import { GameControls } from '@/components/game/GameControls';
import { GameOverModal } from '@/components/game/GameOverModal';
import { OpponentZone } from '@/components/game/OpponentZone';
import { PlayerHand } from '@/components/game/PlayerHand';
import { PlayPile } from '@/components/game/PlayPile';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { useUIStore } from '@/stores/ui-store';
import type { SanitizedGameState, SanitizedPlayerState } from '@/types/client';

// ── Types ────────────────────────────────────────────────────────

interface PlayerNameMap {
  [playerId: string]: string;
}

interface GameBoardProps {
  gameState: SanitizedGameState;
  myPlayerId: string;
  playerNames: PlayerNameMap;
  isSubmitting: boolean;
  actionError: string | null;
  isGameOver: boolean;
  winnerId: string | null;
  gameOverReason: string | null;
  onPlayCards: (cardIds: string[]) => void;
  onPickUpPile: () => void;
  onPlayBlind: (cardIndex: number) => void;
  onDeclareDirection: (direction: 'higher' | 'lower') => void;
  onGameOverClose: () => void;
}

// ── Helper: determine active zone for player ─────────────────────

function getActiveZone(
  player: SanitizedPlayerState,
  drawPileCount: number,
): 'hand' | 'faceUp' | 'faceDown' | 'finished' {
  const handCount = player.hand ? player.hand.length : player.handCount;
  if (handCount > 0 || drawPileCount > 0) return 'hand';
  if (player.faceUpCards.length > 0) return 'faceUp';
  if (player.faceDownCount > 0) return 'faceDown';
  return 'finished';
}

// ── Component ────────────────────────────────────────────────────

export function GameBoard({
  gameState,
  myPlayerId,
  playerNames,
  isSubmitting,
  actionError,
  isGameOver,
  winnerId,
  gameOverReason,
  onPlayCards,
  onPickUpPile,
  onPlayBlind,
  onDeclareDirection,
  onGameOverClose,
}: GameBoardProps): React.JSX.Element {
  // Derive current player info
  const currentPlayerId = useMemo(() => {
    return gameState.turnOrder[gameState.currentPlayerIndex] ?? null;
  }, [gameState.turnOrder, gameState.currentPlayerIndex]);

  const isMyTurn = currentPlayerId === myPlayerId;

  // Find my player state
  const myPlayer = useMemo(() => {
    return gameState.players.find((p) => p.id === myPlayerId) ?? null;
  }, [gameState.players, myPlayerId]);

  // Find opponents (everyone except me)
  const opponents = useMemo(() => {
    return gameState.players.filter((p) => p.id !== myPlayerId);
  }, [gameState.players, myPlayerId]);

  // Determine my active zone
  const myActiveZone = useMemo(() => {
    if (!myPlayer) return 'hand' as const;
    return getActiveZone(myPlayer, gameState.drawPileCount);
  }, [myPlayer, gameState.drawPileCount]);

  const currentPlayerName = currentPlayerId
    ? (playerNames[currentPlayerId] ?? 'Unknown')
    : 'Unknown';

  const winnerName = winnerId ? (playerNames[winnerId] ?? 'Unknown') : '';
  const isCurrentUserWinner = winnerId === myPlayerId;

  const selectedCardCount = useUIStore((s) => s.selectedCardIds.length);

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-2 sm:p-4">
      {/* Turn indicator */}
      <TurnIndicator
        currentPlayerName={currentPlayerName}
        isMyTurn={isMyTurn}
        direction={gameState.turnDirection}
        freePlay={gameState.freePlay}
        nextCardOverride={gameState.nextCardOverride}
        phase={gameState.phase}
      />

      {/* Opponent zones */}
      {opponents.length > 0 && (
        <div
          className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Opponents"
        >
          {opponents.map((opponent) => (
            <OpponentZone
              key={opponent.id}
              player={opponent}
              isCurrentTurn={currentPlayerId === opponent.id}
              displayName={playerNames[opponent.id] ?? 'Unknown'}
            />
          ))}
        </div>
      )}

      {/* Center play area */}
      <div className="flex items-center justify-center gap-6 sm:gap-10 py-4">
        <div className="text-center">
          <DrawPile count={gameState.drawPileCount} />
          <span className="block mt-1 text-xs text-[var(--color-muted)]">Draw</span>
        </div>
        <div className="text-center">
          <PlayPile pile={gameState.playPile} />
          <span className="block mt-1 text-xs text-[var(--color-muted)]">Pile</span>
        </div>
        {gameState.burnPileCount > 0 && (
          <div className="text-center">
            <div
              className="flex h-24 w-16 items-center justify-center rounded-lg border border-[var(--color-border)] bg-gray-100 dark:bg-gray-800"
              aria-label={`Burn pile, ${String(gameState.burnPileCount)} cards`}
            >
              <span className="text-xs text-[var(--color-muted)]">{String(gameState.burnPileCount)}</span>
            </div>
            <span className="block mt-1 text-xs text-[var(--color-muted)]">Burned</span>
          </div>
        )}
      </div>

      {/* My table cards (face-up and face-down) */}
      {myPlayer && (
        <div className="flex flex-wrap items-center justify-center gap-4">
          {(myPlayer.faceUpCards.length > 0 || myActiveZone === 'faceUp') && (
            <FaceUpCards
              cards={myPlayer.faceUpCards}
              isMyTurn={isMyTurn}
              isActiveZone={myActiveZone === 'faceUp'}
            />
          )}
          {(myPlayer.faceDownCount > 0 || myActiveZone === 'faceDown') && (
            <FaceDownCards
              count={myPlayer.faceDownCount}
              isMyTurn={isMyTurn}
              isActiveZone={myActiveZone === 'faceDown'}
              onPlayBlind={onPlayBlind}
            />
          )}
        </div>
      )}

      {/* My hand */}
      {myPlayer?.hand && myPlayer.hand.length > 0 && (
        <PlayerHand cards={myPlayer.hand} isMyTurn={isMyTurn} />
      )}

      {/* Controls */}
      <GameControls
        isMyTurn={isMyTurn}
        isSubmitting={isSubmitting}
        phase={gameState.phase}
        selectedCardCount={selectedCardCount}
        actionError={actionError}
        onPlayCards={onPlayCards}
        onPickUpPile={onPickUpPile}
        onDeclareDirection={onDeclareDirection}
      />

      {/* Game over modal */}
      <GameOverModal
        isOpen={isGameOver}
        winnerId={winnerId}
        winnerName={winnerName}
        reason={gameOverReason}
        isCurrentUserWinner={isCurrentUserWinner}
        onClose={onGameOverClose}
      />
    </div>
  );
}

