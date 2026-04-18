/**
 * MobileLandscapeBoard — Mobile landscape game layout per the wireframe.
 *
 * 3-column grid: left seat col | center felt | right seat col. Up to two
 * opponents float on the felt's top edge. Bottom strip: me seat + fanned
 * hand + stacked right-edge action column (play / draw+pick / declare).
 *
 * Built for ~812x375 landscape viewports. Components stay pure and
 * server-authoritative — visual rearrangement only.
 */
'use client';

import { useCallback, useMemo } from 'react';

import { Card, CardBack } from '@/components/game/Card';
import { GameMobileOverlay } from '@/components/game/GameMobileOverlay';
import { GameOverModal } from '@/components/game/GameOverModal';
import { sortCardsByRank } from '@/lib/card-utils';
import { useUIStore } from '@/stores/ui-store';
import type { SanitizedGameState, SanitizedPlayerState } from '@/types/client';

// ── Props ───────────────────────────────────────────────────────

interface PlayerNameMap {
  [playerId: string]: string;
}

interface MobileLandscapeBoardProps {
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

// ── Seat tile (side opponents) ──────────────────────────────────

interface SeatTileProps {
  player: SanitizedPlayerState;
  name: string;
  isCurrentTurn: boolean;
}

function SeatTile({ player, name, isCurrentTurn }: SeatTileProps): React.JSX.Element {
  const handCount = player.handCount;
  const visibleBacks = Math.min(handCount, 4);
  const ringStyle = isCurrentTurn
    ? { boxShadow: '0 0 0 2px var(--accent-2), 1.5px 1.5px 0 var(--ink)' }
    : undefined;

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-md border-2 border-ink bg-paper px-1.5 py-1.5"
      style={ringStyle}
      aria-label={`${name}'s seat${isCurrentTurn ? ' (current turn)' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-paper-2 font-display text-sm font-bold"
          aria-hidden="true"
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-display text-[13px] font-bold">{name}</span>
          <span className="font-mono text-[9px] text-ink-soft">hand: {String(handCount)}</span>
        </div>
      </div>

      {visibleBacks > 0 && (
        <div className="flex" aria-hidden="true">
          {Array.from({ length: visibleBacks }, (_, i) => (
            <div
              key={`bk-${String(i)}`}
              className={i > 0 ? '-ml-3' : ''}
              style={{ zIndex: i }}
            >
              <CardBack size="xs" />
            </div>
          ))}
        </div>
      )}

      {(player.faceUpCards.length > 0 || player.faceDownCount > 0) && (
        <div className="flex items-end gap-0.5">
          {player.faceUpCards.slice(0, 3).map((card) => (
            <Card key={card.id} card={card} size="xs" isDisabled />
          ))}
          {player.faceDownCount > 0 && (
            <span className="font-mono text-[9px] text-ink-soft">
              +{String(player.faceDownCount)}fd
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Top-edge floating seat (compact, avatar-only) ───────────────

function TopSeat({
  player,
  name,
  isCurrentTurn,
  offset,
}: {
  player: SanitizedPlayerState;
  name: string;
  isCurrentTurn: boolean;
  offset: string;
}): React.JSX.Element {
  const ringStyle = isCurrentTurn
    ? { boxShadow: '0 0 0 2px var(--accent-2), 1.5px 1.5px 0 var(--ink)' }
    : { boxShadow: '1.5px 1.5px 0 var(--ink)' };
  return (
    <div
      className="absolute top-[-14px] z-10 flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-2 py-0.5"
      style={{ left: offset, transform: 'translateX(-50%)', ...ringStyle }}
      aria-label={`${name}${isCurrentTurn ? ' (current turn)' : ''}`}
    >
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-paper-2 font-display text-xs font-bold"
        aria-hidden="true"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-display text-[12px] font-bold">{name}</span>
        <span className="font-mono text-[9px] text-ink-soft">{String(player.handCount)}c</span>
      </div>
    </div>
  );
}

// ── Hand fan (bottom) ───────────────────────────────────────────

function fanTransform(index: number, total: number): string {
  if (total <= 1) return 'rotate(0deg)';
  const mid = (total - 1) / 2;
  const deg = ((index - mid) / mid) * 7;
  const lift = Math.abs(index - mid) / mid * 2;
  return `rotate(${deg.toFixed(2)}deg) translateY(${lift.toFixed(2)}px)`;
}

// ── Component ───────────────────────────────────────────────────

export function MobileLandscapeBoard({
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
}: MobileLandscapeBoardProps): React.JSX.Element {
  const selectedCardIds = useUIStore((s) => s.selectedCardIds);
  const selectCard = useUIStore((s) => s.selectCard);
  const deselectCard = useUIStore((s) => s.deselectCard);
  const clearCardSelection = useUIStore((s) => s.clearCardSelection);

  const currentPlayerId = gameState.turnOrder[gameState.currentPlayerIndex] ?? null;
  const isMyTurn = currentPlayerId === myPlayerId;

  const myPlayer = useMemo(
    () => gameState.players.find((p) => p.id === myPlayerId) ?? null,
    [gameState.players, myPlayerId],
  );

  const opponents = useMemo(
    () => gameState.players.filter((p) => p.id !== myPlayerId),
    [gameState.players, myPlayerId],
  );

  // Split opponents into side (left/right) and top (floating).
  // 1 opp → [side: [opp], top: []]
  // 2 opp → [left, right], no top
  // 3 opp → [left, right], top = [middle]
  // 4 opp → [left, right], top = [mid1, mid2]
  const { leftSeat, rightSeat, topSeats } = useMemo(() => {
    if (opponents.length === 0) {
      return { leftSeat: null, rightSeat: null, topSeats: [] as SanitizedPlayerState[] };
    }
    if (opponents.length === 1) {
      return { leftSeat: opponents[0]!, rightSeat: null, topSeats: [] as SanitizedPlayerState[] };
    }
    if (opponents.length === 2) {
      return { leftSeat: opponents[0]!, rightSeat: opponents[1]!, topSeats: [] as SanitizedPlayerState[] };
    }
    if (opponents.length === 3) {
      return { leftSeat: opponents[0]!, rightSeat: opponents[2]!, topSeats: [opponents[1]!] };
    }
    // 4 opponents
    return {
      leftSeat: opponents[0]!,
      rightSeat: opponents[3]!,
      topSeats: [opponents[1]!, opponents[2]!],
    };
  }, [opponents]);

  const currentPlayerName = currentPlayerId ? playerNames[currentPlayerId] ?? 'Unknown' : 'Unknown';
  const winnerName = winnerId ? playerNames[winnerId] ?? 'Unknown' : '';
  const isCurrentUserWinner = winnerId === myPlayerId;

  const sortedHand = useMemo(
    () => (myPlayer?.hand ? sortCardsByRank(myPlayer.hand) : []),
    [myPlayer?.hand],
  );

  const selectedCardCount = selectedCardIds.length;
  const handTotal = sortedHand.length;

  const handleCardClick = useCallback(
    (cardId: string) => {
      if (!isMyTurn) return;
      if (selectedCardIds.includes(cardId)) {
        deselectCard(cardId);
      } else {
        selectCard(cardId);
      }
    },
    [isMyTurn, selectedCardIds, selectCard, deselectCard],
  );

  const handlePlay = useCallback(() => {
    if (selectedCardIds.length > 0) {
      onPlayCards([...selectedCardIds]);
      clearCardSelection();
    }
  }, [selectedCardIds, onPlayCards, clearCardSelection]);

  const handlePickUp = useCallback(() => {
    onPickUpPile();
    clearCardSelection();
  }, [onPickUpPile, clearCardSelection]);

  const handleDeclareHigher = useCallback(() => onDeclareDirection('higher'), [onDeclareDirection]);
  const handleDeclareLower = useCallback(() => onDeclareDirection('lower'), [onDeclareDirection]);

  // Determine which action zone is active for me (hand vs faceUp vs faceDown)
  const myHandCount = myPlayer?.hand ? myPlayer.hand.length : (myPlayer?.handCount ?? 0);
  const hasHandCards = myHandCount > 0 || gameState.drawPileCount > 0;
  const canPlayFaceDown =
    myPlayer != null &&
    !hasHandCards &&
    myPlayer.faceUpCards.length === 0 &&
    myPlayer.faceDownCount > 0;

  // Phase-specific banner text
  const isQueenPhase = gameState.phase === 'awaiting_queen_declaration' && isMyTurn;

  const playPileTop = gameState.playPile.length > 0 ? gameState.playPile[gameState.playPile.length - 1] : null;

  const topSeatOffsets = topSeats.length === 1 ? ['50%'] : ['33%', '67%'];

  // Face-up cards row (when hand is empty)
  const showFaceUpZone =
    myPlayer != null && !hasHandCards && myPlayer.faceUpCards.length > 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-1 p-1.5">
      <GameMobileOverlay
        currentPlayerName={currentPlayerName}
        isMyTurn={isMyTurn}
        direction={gameState.turnDirection}
        freePlay={gameState.freePlay}
        nextCardOverride={gameState.nextCardOverride}
        phase={gameState.phase}
      />

      {/* Top HUD: pills */}
      <div className="flex shrink-0 items-center justify-between gap-1.5 pl-12 pr-28 font-mono text-[10px] leading-none">
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="pill gray !px-1.5 !py-0 !text-[10px]">
            #{gameState.gameId ? gameState.gameId.slice(0, 4).toUpperCase() : '----'}
          </span>
          <span className="pill !px-1.5 !py-0 !text-[10px]">
            {gameState.drawPileCount}d · {gameState.playPile.length}p
          </span>
          {gameState.freePlay && (
            <span className="pill yellow !px-1.5 !py-0 !text-[10px]">free</span>
          )}
          {gameState.nextCardOverride === 'lower' && (
            <span className="pill yellow !px-1.5 !py-0 !text-[10px]">lower</span>
          )}
        </div>
      </div>

      {/* Main row: left seat | felt | right seat */}
      <div
        className="grid min-h-0 flex-1 gap-1.5"
        style={{ gridTemplateColumns: '108px minmax(0,1fr) 108px' }}
      >
        {/* Left seat */}
        <div className="flex flex-col justify-center">
          {leftSeat && (
            <SeatTile
              player={leftSeat}
              name={playerNames[leftSeat.id] ?? 'Unknown'}
              isCurrentTurn={currentPlayerId === leftSeat.id}
            />
          )}
        </div>

        {/* Center felt */}
        <div
          className="relative flex min-h-0 flex-col items-center justify-between rounded-xl border-2 border-dashed border-accent-2 p-2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(42,111,79,0.04) 0 6px, transparent 6px 12px)',
          }}
        >
          {topSeats.map((seat, i) => (
            <TopSeat
              key={seat.id}
              player={seat}
              name={playerNames[seat.id] ?? 'Unknown'}
              isCurrentTurn={currentPlayerId === seat.id}
              offset={topSeatOffsets[i]!}
            />
          ))}

          {/* Deck + discard row */}
          <div className="mt-2 flex items-start justify-center gap-4">
            <div className="text-center">
              <div className="flex justify-center">
                <CardBack size="sm" />
              </div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-soft">
                deck · {String(gameState.drawPileCount)}
              </div>
            </div>
            <div className="text-center">
              <div className="relative flex h-[3.875rem] w-12 items-center justify-center">
                {playPileTop ? (
                  <Card card={playPileTop} size="sm" isDisabled />
                ) : (
                  <div className="flex h-[3.875rem] w-11 items-center justify-center rounded-md border-2 border-dashed border-line-soft font-mono text-[9px] text-line-soft">
                    empty
                  </div>
                )}
              </div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-soft">
                pile · {String(gameState.playPile.length)}
              </div>
            </div>
            {gameState.burnPileCount > 0 && (
              <div className="text-center">
                <div
                  className="h-[3.875rem] w-11 rounded-md border-2 border-dashed border-line-soft bg-[repeating-linear-gradient(45deg,transparent_0_5px,rgba(0,0,0,0.07)_5px_6px)]"
                  aria-label={`Burn pile, ${String(gameState.burnPileCount)} cards`}
                />
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-soft">
                  burn · {String(gameState.burnPileCount)}
                </div>
              </div>
            )}
          </div>

          {/* Center log strip */}
          <div className="mb-1 max-w-full rounded-full border-[1.5px] border-ink bg-paper-2 px-2 py-0.5 font-mono text-[10px] leading-tight text-ink-soft">
            {isQueenPhase ? (
              <span className="text-accent-3">Queen played {'\u2014'} declare direction</span>
            ) : isMyTurn ? (
              <span className="text-accent-2">your turn</span>
            ) : (
              <span>
                waiting {'\u00B7'} {currentPlayerName}
              </span>
            )}
          </div>
        </div>

        {/* Right seat */}
        <div className="flex flex-col justify-center">
          {rightSeat && (
            <SeatTile
              player={rightSeat}
              name={playerNames[rightSeat.id] ?? 'Unknown'}
              isCurrentTurn={currentPlayerId === rightSeat.id}
            />
          )}
        </div>
      </div>

      {/* Face-up / face-down row (only when hand is empty) */}
      {showFaceUpZone && myPlayer && (
        <div className="flex shrink-0 justify-center gap-1 pl-[60px] pr-[92px]">
          {myPlayer.faceUpCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardClick(card.id)}
              disabled={!isMyTurn}
              className="bg-transparent p-0"
              aria-label="Face-up card"
            >
              <Card
                card={card}
                size="sm"
                isSelected={selectedCardIds.includes(card.id)}
                isPlayable={isMyTurn}
                isDisabled={!isMyTurn}
              />
            </button>
          ))}
          {myPlayer.faceDownCount > 0 && (
            <span className="self-end font-mono text-[9px] text-ink-soft">
              fd · {String(myPlayer.faceDownCount)}
            </span>
          )}
        </div>
      )}

      {/* Bottom strip: me seat | hand | action column */}
      <div
        className="grid shrink-0 items-end gap-1.5"
        style={{ gridTemplateColumns: '60px minmax(0,1fr) 90px' }}
      >
        {/* Me seat */}
        <div
          className={`flex flex-col items-center gap-0.5 rounded-md border-2 border-ink bg-paper px-1 py-1 ${isMyTurn ? 'shadow-[0_0_0_2px_var(--accent),1.5px_1.5px_0_var(--ink)]' : 'shadow-sketch-sm'}`}
          aria-label="You"
        >
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-paper-2 font-display text-sm font-bold"
            aria-hidden="true"
          >
            {(playerNames[myPlayerId] ?? 'You').charAt(0).toUpperCase()}
          </span>
          <span className="font-mono text-[9px] text-ink-soft">
            {String(myHandCount)}c
          </span>
        </div>

        {/* Hand fan */}
        <div className="flex items-end justify-center overflow-x-auto pb-1 scrollbar-thin">
          <div className="flex items-end">
            {sortedHand.map((card, index) => {
              const isSelected = selectedCardIds.includes(card.id);
              const transform = isSelected
                ? 'translateY(-10px) rotate(0deg)'
                : fanTransform(index, handTotal);
              return (
                <div
                  key={card.id}
                  className={`relative transition-transform duration-150 motion-reduce:transition-none ${index > 0 ? '-ml-4' : ''}`}
                  style={{ transform, zIndex: isSelected ? 50 : index }}
                >
                  <Card
                    card={card}
                    size="sm"
                    isSelected={isSelected}
                    isPlayable={isMyTurn}
                    isDisabled={!isMyTurn}
                    onClick={handleCardClick}
                  />
                </div>
              );
            })}
            {canPlayFaceDown && myPlayer && (
              <div className="ml-2 flex items-end gap-1">
                {Array.from({ length: myPlayer.faceDownCount }, (_, i) => (
                  <button
                    key={`fd-${String(i)}`}
                    type="button"
                    onClick={() => onPlayBlind(i)}
                    disabled={!isMyTurn || isSubmitting}
                    className="bg-transparent p-0"
                    aria-label={`Play blind card ${String(i + 1)}`}
                  >
                    <CardBack size="sm" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action column */}
        <div className="flex flex-col items-stretch gap-1">
          {isQueenPhase ? (
            <>
              <button
                type="button"
                onClick={handleDeclareHigher}
                disabled={isSubmitting}
                className="rounded-md border-2 border-ink bg-ink px-2 py-1 font-display text-xs font-bold text-paper shadow-sketch-sm disabled:opacity-50"
              >
                {'\u2191 higher'}
              </button>
              <button
                type="button"
                onClick={handleDeclareLower}
                disabled={isSubmitting}
                className="rounded-md border-2 border-ink bg-paper px-2 py-1 font-display text-xs font-bold shadow-sketch-sm disabled:opacity-50"
              >
                {'\u2193 lower'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePlay}
                disabled={!isMyTurn || isSubmitting || selectedCardCount === 0}
                className="rounded-md border-2 border-ink bg-accent px-2 py-1 font-display text-sm font-bold leading-none text-paper shadow-sketch-sm disabled:opacity-40"
              >
                {'\u25B8 play'}
                {selectedCardCount > 0 ? ` (${String(selectedCardCount)})` : ''}
              </button>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handlePickUp}
                  disabled={!isMyTurn || isSubmitting}
                  className="flex-1 rounded-md border-2 border-ink bg-paper px-1 py-1 font-display text-xs font-bold shadow-sketch-sm disabled:opacity-40"
                >
                  pick
                </button>
                {selectedCardCount > 0 && (
                  <button
                    type="button"
                    onClick={clearCardSelection}
                    className="flex-1 rounded-md border-2 border-ink bg-paper-2 px-1 py-1 font-display text-xs font-bold shadow-sketch-sm"
                  >
                    clear
                  </button>
                )}
              </div>
            </>
          )}
          {actionError && (
            <p
              className="font-body text-[10px] font-semibold leading-tight text-accent"
              role="alert"
            >
              {actionError}
            </p>
          )}
        </div>
      </div>

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
