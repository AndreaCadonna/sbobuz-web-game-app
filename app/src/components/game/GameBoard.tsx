/**
 * GameBoard — Sketchy Variant A game board.
 *
 * Board wrapper: paper-2 bg, 2px ink border, 8px radius. Grid areas stack
 * opponents on top, center zone (draw / pile / burn / flags) in the middle,
 * then your cards, then the action bar.
 */
'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { DrawPile } from '@/components/game/DrawPile';
import { FaceDownCards } from '@/components/game/FaceDownCards';
import { FaceUpCards } from '@/components/game/FaceUpCards';
import { GameControls } from '@/components/game/GameControls';
import { GameOverModal } from '@/components/game/GameOverModal';
import { MobileLandscapeBoard } from '@/components/game/MobileLandscapeBoard';
import { PlayerHand } from '@/components/game/PlayerHand';
import { PlayPile } from '@/components/game/PlayPile';
import { RotatePhonePrompt } from '@/components/game/RotatePhonePrompt';
import { TableLayout } from '@/components/game/TableLayout';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useOrientation } from '@/hooks/use-orientation';
import { useViewportTier } from '@/hooks/use-viewport-tier';
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
  const isMobile = useIsMobile();
  const tier = useViewportTier();
  const isCompact = tier === 'compact';
  const orientation = useOrientation();

  // Mobile only: request landscape orientation lock when the board mounts.
  // iOS Safari rejects this, which is fine — the rotate prompt handles the fallback.
  useEffect(() => {
    if (!isMobile) return;
    const screenOrientation = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void>; unlock?: () => void } }).orientation;
    if (!screenOrientation?.lock) return;
    screenOrientation.lock('landscape').catch(() => {
      // Silently ignore — browsers without fullscreen deny lock requests.
    });
    return () => {
      try {
        screenOrientation.unlock?.();
      } catch {
        // no-op
      }
    };
  }, [isMobile]);

  const currentPlayerId = useMemo(() => {
    return gameState.turnOrder[gameState.currentPlayerIndex] ?? null;
  }, [gameState.turnOrder, gameState.currentPlayerIndex]);

  const isMyTurn = currentPlayerId === myPlayerId;

  const myPlayer = useMemo(() => {
    return gameState.players.find((p) => p.id === myPlayerId) ?? null;
  }, [gameState.players, myPlayerId]);

  const opponents = useMemo(() => {
    return gameState.players.filter((p) => p.id !== myPlayerId);
  }, [gameState.players, myPlayerId]);

  const myActiveZone = useMemo(() => {
    if (!myPlayer) return 'hand' as const;
    return getActiveZone(myPlayer, gameState.drawPileCount);
  }, [myPlayer, gameState.drawPileCount]);

  const currentPlayerName = currentPlayerId ? playerNames[currentPlayerId] ?? 'Unknown' : 'Unknown';
  const winnerName = winnerId ? playerNames[winnerId] ?? 'Unknown' : '';
  const isCurrentUserWinner = winnerId === myPlayerId;

  const selectedCardIds = useUIStore((s) => s.selectedCardIds);
  const selectedCardCount = selectedCardIds.length;
  const clearCardSelection = useUIStore((s) => s.clearCardSelection);

  const handleDropCards = useCallback(
    (cardIds: string[]) => {
      onPlayCards(cardIds);
      clearCardSelection();
    },
    [onPlayCards, clearCardSelection],
  );

  const pileSize = isMobile || isCompact ? ('sm' as const) : ('md' as const);

  // On mobile, swap to a landscape-optimised layout. If the device is still
  // in portrait, overlay a rotate-phone prompt per the design spec.
  if (isMobile) {
    return (
      <>
        <MobileLandscapeBoard
          gameState={gameState}
          myPlayerId={myPlayerId}
          playerNames={playerNames}
          isSubmitting={isSubmitting}
          actionError={actionError}
          isGameOver={isGameOver}
          winnerId={winnerId}
          gameOverReason={gameOverReason}
          onPlayCards={onPlayCards}
          onPickUpPile={onPickUpPile}
          onPlayBlind={onPlayBlind}
          onDeclareDirection={onDeclareDirection}
          onGameOverClose={onGameOverClose}
        />
        {orientation === 'portrait' && <RotatePhonePrompt />}
      </>
    );
  }

  // Center zone — sketchy draw / play pile / burn / flags
  const centerPiles = (
    <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-8">
      <div className="text-center">
        <div className="zone-label">draw {'\u00B7'} {String(gameState.drawPileCount)}</div>
        <div className="mt-1 flex justify-center">
          <DrawPile count={gameState.drawPileCount} size={pileSize} />
        </div>
      </div>
      <div className="text-center">
        <div className="zone-label">play pile {'\u00B7'} {String(gameState.playPile.length)}</div>
        <div className="mt-1 flex justify-center">
          <PlayPile
            pile={gameState.playPile}
            isDropTarget={isMyTurn}
            onDropCards={handleDropCards}
            size={pileSize}
            selectedCardIds={selectedCardIds}
          />
        </div>
      </div>
      {gameState.burnPileCount > 0 && (
        <div className="text-center">
          <div className="zone-label">burn {'\u00B7'} {String(gameState.burnPileCount)}</div>
          <div
            className={`mt-1 flex items-center justify-center rounded-md border-2 border-dashed border-line-soft bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(0,0,0,0.07)_6px_7px)] ${pileSize === 'sm' ? 'h-[3.875rem] w-11' : 'h-[5.5rem] w-[3.875rem]'}`}
            aria-label={`Burn pile, ${String(gameState.burnPileCount)} cards`}
          >
            <span className="font-mono text-[10px] uppercase tracking-wider text-line-soft">burn</span>
          </div>
        </div>
      )}
      <div className="text-center">
        <div className="zone-label">flags</div>
        <div className="mt-1 sk sk-alt !px-2.5 !py-1.5 font-body text-[13px] leading-tight">
          freePlay: <strong>{gameState.freePlay ? 'yes' : 'no'}</strong>
          <br />
          override: <strong>{gameState.nextCardOverride ?? '\u2014'}</strong>
          <br />
          direction: {gameState.turnDirection === 1 ? '\u2192 cw' : '\u2190 ccw'}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2 scrollbar-thin sm:gap-3 sm:p-3">
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

      {/* Board — paper-2 bg with ink border (Variant A) */}
      <div className="flex flex-1 flex-col gap-4 rounded-lg border-2 border-ink bg-paper-2 p-3 sm:p-5">
        {/* Opponents + center piles */}
        <div className="shrink-0">
          <TableLayout
            opponents={opponents}
            currentPlayerId={currentPlayerId}
            playerNames={playerNames}
            centerContent={centerPiles}
          />
        </div>

        {/* Your table cards (face-up and face-down) */}
        {myPlayer && (
          <div className="shrink-0 flex flex-wrap items-start justify-center gap-3">
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

        {/* Your hand */}
        {myPlayer?.hand && myPlayer.hand.length > 0 && (
          <div className="shrink-0">
            <PlayerHand cards={myPlayer.hand} isMyTurn={isMyTurn} />
          </div>
        )}
      </div>

      {/* Controls (outside the paper-2 board, on paper bg) */}
      <div className="shrink-0">
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
