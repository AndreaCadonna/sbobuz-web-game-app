/**
 * GameBoard — Main game board layout component.
 *
 * Arranges all game zones: opponents at top in a semi-circle arc,
 * play/draw piles in center on a felt-green table,
 * player's cards at bottom, controls below. Responsive layout.
 * All game state comes from the server via the game store.
 */
'use client';

import { useCallback, useMemo } from 'react';

import { DrawPile } from '@/components/game/DrawPile';
import { FaceDownCards } from '@/components/game/FaceDownCards';
import { FaceUpCards } from '@/components/game/FaceUpCards';
import { GameControls } from '@/components/game/GameControls';
import { GameOverModal } from '@/components/game/GameOverModal';
import { PlayerHand } from '@/components/game/PlayerHand';
import { PlayPile } from '@/components/game/PlayPile';
import { TableLayout } from '@/components/game/TableLayout';
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
  const clearCardSelection = useUIStore((s) => s.clearCardSelection);

  const handleDropCards = useCallback(
    (cardIds: string[]) => {
      onPlayCards(cardIds);
      clearCardSelection();
    },
    [onPlayCards, clearCardSelection],
  );

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 p-2 sm:p-3 overflow-y-auto scrollbar-thin">
      {/* Turn indicator */}
      <div className="shrink-0">
        <TurnIndicator
          currentPlayerName={currentPlayerName}
          isMyTurn={isMyTurn}
          direction={gameState.turnDirection}
          freePlay={gameState.freePlay}
          nextCardOverride={gameState.nextCardOverride}
          phase={gameState.phase}
        />
      </div>

      {/* Table: opponents positioned geometrically + center play area */}
      <div className="shrink-0">
        <TableLayout
          opponents={opponents}
          currentPlayerId={currentPlayerId}
          playerNames={playerNames}
          centerContent={
            <div className="flex items-center justify-center gap-6 sm:gap-10 py-3 sm:py-4 rounded-2xl bg-felt-table shadow-felt w-max px-6">
              <div className="text-center">
                <DrawPile count={gameState.drawPileCount} />
                <span className="block mt-1 text-[10px] font-bold uppercase tracking-wider text-cream-300/70">Draw</span>
              </div>
              <div className="text-center">
                <PlayPile pile={gameState.playPile} isDropTarget={isMyTurn} onDropCards={handleDropCards} />
                <span className="block mt-1 text-[10px] font-bold uppercase tracking-wider text-cream-300/70">Pile</span>
              </div>
              {gameState.burnPileCount > 0 && (
                <div className="text-center">
                  <div
                    className="flex h-24 w-16 items-center justify-center rounded-xl border-2 border-brand-600/40 bg-brand-900/40"
                    aria-label={`Burn pile, ${String(gameState.burnPileCount)} cards`}
                  >
                    <span className="text-sm font-bold text-cream-300/50">{String(gameState.burnPileCount)}</span>
                  </div>
                  <span className="block mt-1 text-[10px] font-bold uppercase tracking-wider text-cream-300/70">Burned</span>
                </div>
              )}
            </div>
          }
        />
      </div>

      {/* My table cards (face-up and face-down) */}
      {myPlayer && (
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-3">
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
        <div className="shrink-0">
          <PlayerHand cards={myPlayer.hand} isMyTurn={isMyTurn} />
        </div>
      )}

      {/* Controls - always visible at bottom */}
      <div className="shrink-0 mt-auto">
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
      </div>

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
