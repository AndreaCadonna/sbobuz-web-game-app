/**
 * useGame — Custom hook for game logic integration.
 *
 * Connects game store state, socket actions, and UI store selection
 * into a unified interface for the game page. All actions are sent
 * to the server via socket; no local game logic is computed.
 */
'use client';

import { useCallback, useMemo } from 'react';

import { getSocket } from '@/lib/socket';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/stores/auth-store';
import { useGameStore, selectCurrentPlayerId } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';
import { useUIStore } from '@/stores/ui-store';
import type { SanitizedGameState, GameActionPayload } from '@/types/client';

// ── Return Type ──────────────────────────────────────────────────

interface UseGameReturn {
  // State
  gameState: SanitizedGameState | null;
  myPlayerId: string;
  currentPlayerId: string | null;
  isMyTurn: boolean;
  isSubmitting: boolean;
  actionError: string | null;
  isGameOver: boolean;
  winnerId: string | null;
  gameOverReason: string | null;
  playerNames: Record<string, string>;

  // Actions
  playCards: (cardIds: string[]) => void;
  pickUpPile: () => void;
  playBlind: (cardIndex: number) => void;
  declareDirection: (direction: 'higher' | 'lower') => void;
  clearGameOver: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────

export function useGame(gameId: string): UseGameReturn {
  const myPlayerId = useAuthStore((s) => s.user?.id ?? '');

  // Game store state
  const gameState = useGameStore((s) => s.gameState);
  const isSubmitting = useGameStore((s) => s.isSubmittingAction);
  const actionError = useGameStore((s) => s.actionError);
  const isGameOver = useGameStore((s) => s.isGameOver);
  const winnerId = useGameStore((s) => s.winnerId);
  const gameOverReason = useGameStore((s) => s.gameOverReason);
  const setSubmitting = useGameStore((s) => s.setSubmitting);
  const currentPlayerId = useGameStore(selectCurrentPlayerId);
  const clearActionError = useGameStore((s) => s.clearActionError);

  // UI store
  const clearCardSelection = useUIStore((s) => s.clearCardSelection);
  const addNotification = useUIStore((s) => s.addNotification);

  // Room store for player names
  const currentRoom = useRoomStore((s) => s.currentRoom);

  const isMyTurn = currentPlayerId === myPlayerId;

  // Build player name map from room state
  const playerNames = useMemo<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    if (currentRoom) {
      for (const player of currentRoom.players) {
        names[player.userId] = player.displayName;
      }
    }
    // Ensure current user is in the map
    if (myPlayerId && !names[myPlayerId]) {
      names[myPlayerId] = 'You';
    }
    return names;
  }, [currentRoom, myPlayerId]);

  // Send a game action via socket
  const sendAction = useCallback(
    (payload: GameActionPayload) => {
      const socket = getSocket();
      if (!socket?.connected) {
        addNotification('error', 'Not connected to server');
        return;
      }

      setSubmitting(true);
      socket.emit('game:action', payload, (response) => {
        if (!response.success) {
          const errorMsg = response.error?.message ?? 'Action failed';
          logger.warn({ gameId, error: errorMsg }, 'Game action failed');
          // Reset submitting state — for validation errors the server also
          // emits game:action_rejected which calls handleActionRejected, but
          // for non-validation failures (NOT_IN_ROOM, GAME_NOT_FOUND,
          // INTERNAL_ERROR) that event is never emitted, so we must reset here.
          setSubmitting(false);
        }
        // State update will come via game:state_update event
      });
    },
    [gameId, setSubmitting, addNotification],
  );

  const playCards = useCallback(
    (cardIds: string[]) => {
      if (!isMyTurn || cardIds.length === 0) return;
      clearActionError();
      sendAction({
        gameId,
        action: {
          type: 'PLAY_CARDS',
          playerId: myPlayerId,
          cardIds,
        },
      });
    },
    [gameId, myPlayerId, isMyTurn, sendAction, clearActionError],
  );

  const pickUpPile = useCallback(() => {
    if (!isMyTurn) return;
    clearActionError();
    clearCardSelection();
    sendAction({
      gameId,
      action: {
        type: 'PICK_UP_PILE',
        playerId: myPlayerId,
      },
    });
  }, [gameId, myPlayerId, isMyTurn, sendAction, clearActionError, clearCardSelection]);

  const playBlind = useCallback(
    (cardIndex: number) => {
      if (!isMyTurn) return;
      clearActionError();
      clearCardSelection();
      sendAction({
        gameId,
        action: {
          type: 'PLAY_BLIND',
          playerId: myPlayerId,
          cardIndex,
        },
      });
    },
    [gameId, myPlayerId, isMyTurn, sendAction, clearActionError, clearCardSelection],
  );

  const declareDirection = useCallback(
    (direction: 'higher' | 'lower') => {
      if (!isMyTurn) return;
      clearActionError();
      sendAction({
        gameId,
        action: {
          type: 'DECLARE_DIRECTION',
          playerId: myPlayerId,
          direction,
        },
      });
    },
    [gameId, myPlayerId, isMyTurn, sendAction, clearActionError],
  );

  const clearGameOver = useCallback(() => {
    // Reset game state when the user dismisses the game over modal
    clearCardSelection();
  }, [clearCardSelection]);

  return {
    gameState,
    myPlayerId,
    currentPlayerId,
    isMyTurn,
    isSubmitting,
    actionError,
    isGameOver,
    winnerId,
    gameOverReason,
    playerNames,
    playCards,
    pickUpPile,
    playBlind,
    declareDirection,
    clearGameOver,
  };
}
