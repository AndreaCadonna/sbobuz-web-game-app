/**
 * UI store — manages modals, notifications, and loading states.
 *
 * Client-only state that drives the visual layer. Not synchronized
 * with the server. Reset on page navigation.
 */
'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { ModalType, Notification, NotificationType } from '@/types/client';

// ── State Shape ────────────────────────────────────────────────────

interface UIState {
  activeModal: ModalType | null;
  notifications: Notification[];
  isGlobalLoading: boolean;
  loadingMessage: string | null;

  // Game-specific UI state
  selectedCardIds: string[];
}

interface UIActions {
  openModal: (modal: ModalType) => void;
  closeModal: () => void;

  addNotification: (type: NotificationType, message: string, durationMs?: number) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  setGlobalLoading: (loading: boolean, message?: string) => void;

  // Card selection
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearCardSelection: () => void;
  setSelectedCards: (cardIds: string[]) => void;

  reset: () => void;
}

export type UIStore = UIState & UIActions;

// ── Helpers ────────────────────────────────────────────────────────

let notificationCounter = 0;

function generateNotificationId(): string {
  notificationCounter += 1;
  return `notif_${Date.now()}_${String(notificationCounter)}`;
}

// ── Store ──────────────────────────────────────────────────────────

const initialState: UIState = {
  activeModal: null,
  notifications: [],
  isGlobalLoading: false,
  loadingMessage: null,
  selectedCardIds: [],
};

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      ...initialState,

      openModal(modal): void {
        set({ activeModal: modal });
      },

      closeModal(): void {
        set({ activeModal: null });
      },

      addNotification(type, message, durationMs = 5000): string {
        const id = generateNotificationId();
        const notification: Notification = {
          id,
          type,
          message,
          durationMs,
          createdAt: Date.now(),
        };

        set((state) => ({
          notifications: [...state.notifications, notification],
        }));

        // Auto-remove after duration (if not persistent)
        if (durationMs > 0) {
          setTimeout(() => {
            set((state) => ({
              notifications: state.notifications.filter((n) => n.id !== id),
            }));
          }, durationMs);
        }

        return id;
      },

      removeNotification(id): void {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearNotifications(): void {
        set({ notifications: [] });
      },

      setGlobalLoading(loading, message): void {
        set({
          isGlobalLoading: loading,
          loadingMessage: message ?? null,
        });
      },

      selectCard(cardId): void {
        set((state) => {
          if (state.selectedCardIds.includes(cardId)) return state;
          return { selectedCardIds: [...state.selectedCardIds, cardId] };
        });
      },

      deselectCard(cardId): void {
        set((state) => ({
          selectedCardIds: state.selectedCardIds.filter((id) => id !== cardId),
        }));
      },

      clearCardSelection(): void {
        set({ selectedCardIds: [] });
      },

      setSelectedCards(cardIds): void {
        set({ selectedCardIds: cardIds });
      },

      reset(): void {
        set(initialState);
      },
    }),
    { name: 'UIStore' },
  ),
);
