/**
 * Socket store — manages Socket.IO connection state.
 *
 * Tracks connection status, reconnection attempts, and latency.
 * The actual socket instance is managed by the useSocket hook,
 * NOT stored in React state.
 */
'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { ConnectionStatus } from '@/types/client';

// ── State Shape ────────────────────────────────────────────────────

interface SocketState {
  status: ConnectionStatus;
  lastConnectedAt: string | null;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  latencyMs: number | null;
}

interface SocketActions {
  setConnected: () => void;
  setDisconnected: () => void;
  setReconnecting: (attempt: number) => void;
  setLatency: (ms: number) => void;
  reset: () => void;
}

export type SocketStore = SocketState & SocketActions;

// ── Store ──────────────────────────────────────────────────────────

const initialState: SocketState = {
  status: 'disconnected',
  lastConnectedAt: null,
  reconnectAttempt: 0,
  maxReconnectAttempts: 10,
  latencyMs: null,
};

export const useSocketStore = create<SocketStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setConnected(): void {
        set({
          status: 'connected',
          lastConnectedAt: new Date().toISOString(),
          reconnectAttempt: 0,
        });
      },

      setDisconnected(): void {
        set({ status: 'disconnected' });
      },

      setReconnecting(attempt): void {
        set({ status: 'reconnecting', reconnectAttempt: attempt });
      },

      setLatency(ms): void {
        set({ latencyMs: ms });
      },

      reset(): void {
        set(initialState);
      },
    }),
    { name: 'SocketStore' },
  ),
);
