/**
 * Game store — manages game state received from the server.
 *
 * The game store NEVER computes game logic. It receives sanitized game state
 * from the server via socket events and stores it for rendering.
 * Game actions are sent to the server; local state is only updated on
 * server confirmation.
 */
'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { logger } from '@/lib/logger';
import type {
  SanitizedGameState,
  GameStateUpdatePayload,
  ActionRejectedPayload,
  GameStartedPayload,
  GameEndedPayload,
} from '@/types/client';

// ── State Shape ────────────────────────────────────────────────────

interface GameState {
  gameId: string | null;
  gameState: SanitizedGameState | null;
  isSubmittingAction: boolean;
  actionError: string | null;
  isGameOver: boolean;
  winnerId: string | null;
  gameOverReason: string | null;

  // Action log for game history display
  actionLog: ReadonlyArray<{
    type: string;
    playerId: string;
    timestamp: string;
  }>;
}

interface GameActions {
  // Socket event handlers
  handleGameStarted: (payload: GameStartedPayload) => void;
  handleGameStateUpdate: (payload: GameStateUpdatePayload) => void;
  handleActionRejected: (payload: ActionRejectedPayload) => void;
  handleGameEnded: (payload: GameEndedPayload) => void;
  handleFullSyncGameState: (gameState: SanitizedGameState | null) => void;

  // UI state
  setSubmitting: (submitting: boolean) => void;
  clearActionError: () => void;

  // Cleanup
  reset: () => void;
}

export type GameStore = GameState & GameActions;

// ── Derived Selectors ──────────────────────────────────────────────

export function selectCurrentPlayerId(state: GameState): string | null {
  if (!state.gameState) return null;
  const { turnOrder, currentPlayerIndex } = state.gameState;
  return turnOrder[currentPlayerIndex] ?? null;
}

export function selectMyPlayer(state: GameState, myId: string): {
  hand: ReadonlyArray<import('@sbobuz/shared').Card> | null;
  handCount: number;
  faceUpCards: ReadonlyArray<import('@sbobuz/shared').Card>;
  faceDownCount: number;
} | null {
  if (!state.gameState) return null;
  return state.gameState.players.find((p) => p.id === myId) ?? null;
}

// ── Store ──────────────────────────────────────────────────────────

const initialState: GameState = {
  gameId: null,
  gameState: null,
  isSubmittingAction: false,
  actionError: null,
  isGameOver: false,
  winnerId: null,
  gameOverReason: null,
  actionLog: [],
};

export const useGameStore = create<GameStore>()(
  devtools(
    (set) => ({
      ...initialState,

      handleGameStarted(payload): void {
        logger.info({ gameId: payload.gameId }, 'Game started');
        set({
          gameId: payload.gameId,
          gameState: payload.initialState,
          isGameOver: false,
          winnerId: null,
          gameOverReason: null,
          actionLog: [],
          actionError: null,
        });
      },

      handleGameStateUpdate(payload): void {
        set((state) => ({
          gameState: payload.state,
          isSubmittingAction: false,
          actionError: null,
          actionLog: [
            ...state.actionLog,
            payload.lastAction,
          ],
        }));
      },

      handleActionRejected(payload): void {
        logger.warn(
          { actionType: payload.actionType, reason: payload.reason },
          'Action rejected by server',
        );
        set({
          isSubmittingAction: false,
          actionError: payload.reason,
        });
      },

      handleGameEnded(payload): void {
        logger.info(
          { gameId: payload.gameId, winnerId: payload.result.winnerId },
          'Game ended',
        );
        set({
          gameState: payload.result.finalState,
          isGameOver: true,
          winnerId: payload.result.winnerId,
          gameOverReason: payload.result.reason,
          isSubmittingAction: false,
        });
      },

      handleFullSyncGameState(gameState): void {
        if (!gameState) return;
        set({
          gameId: gameState.gameId,
          gameState,
          isSubmittingAction: false,
        });
      },

      setSubmitting(submitting): void {
        set({ isSubmittingAction: submitting, actionError: null });
      },

      clearActionError(): void {
        set({ actionError: null });
      },

      reset(): void {
        set(initialState);
      },
    }),
    { name: 'GameStore' },
  ),
);
