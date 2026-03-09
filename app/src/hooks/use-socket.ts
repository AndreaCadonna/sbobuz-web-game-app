/**
 * useSocket — Custom hook for Socket.IO connection management.
 *
 * Connects on mount when authenticated, disconnects on unmount.
 * Routes server events to appropriate Zustand stores via getState()
 * to keep the socket lifecycle stable (no teardown on handler changes).
 * Handles reconnection with token refresh and heartbeat.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@/lib/logger';
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  updateSocketAuth,
  type TypedClientSocket,
} from '@/lib/socket';
import { useAuthStore, selectIsAuthenticated } from '@/stores/auth-store';
import { useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';
import { useSocketStore } from '@/stores/socket-store';
import { useUIStore } from '@/stores/ui-store';

/**
 * Manages the Socket.IO lifecycle and event routing.
 * Should be mounted once in the authenticated layout.
 *
 * Event listeners use getState() to access the latest store handlers
 * without including them in the effect dependency array. This prevents
 * the socket from being torn down and reconnected when handlers change,
 * which would cause missed events (e.g., AI opponent moves).
 */
export function useSocket(): {
  getSocketInstance: () => TypedClientSocket | null;
} {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);

  const socketRef = useRef<TypedClientSocket | null>(null);
  const accessTokenRef = useRef(accessToken);

  // Sync token to ref and update socket auth without full teardown
  useEffect(() => {
    accessTokenRef.current = accessToken;
    if (accessToken) {
      updateSocketAuth(accessToken);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isAuthenticated || !accessTokenRef.current) {
      disconnectSocket();
      socketRef.current = null;
      return;
    }

    const socket = connectSocket(accessTokenRef.current);
    socketRef.current = socket;

    // ── Connection events ────────────────────────────────────────

    socket.on('connect', () => {
      logger.info('Socket connected');
      useSocketStore.getState().setConnected();
    });

    socket.on('disconnect', (reason) => {
      logger.info({ reason }, 'Socket disconnected');
      useSocketStore.getState().setDisconnected();

      if (reason === 'io server disconnect') {
        // Server forced disconnect — may need new token
        useUIStore.getState().addNotification('warning', 'Disconnected from server');
      }
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      logger.debug({ attempt }, 'Reconnection attempt');
      useSocketStore.getState().setReconnecting(attempt);
    });

    socket.io.on('reconnect', () => {
      logger.info('Socket reconnected');
      // setConnected() is NOT called here — the 'connect' event already fires
      // on reconnection and increments connectionId. Calling it twice would
      // trigger duplicate room:join emissions from the lobby page.
    });

    socket.io.on('reconnect_failed', () => {
      logger.error('Socket reconnection failed after max attempts');
      useUIStore.getState().addNotification('error', 'Connection lost. Please refresh the page.');
    });

    // ── Latency measurement ──────────────────────────────────────
    // Track actual round-trip time by recording when the Manager sends
    // a ping and measuring how long until the engine receives the pong.

    let pingSentAt = 0;
    socket.io.on('ping', () => {
      pingSentAt = Date.now();
    });
    // The Engine.IO transport emits 'pong' but it's not in the Manager's
    // typed event map, so we listen on the engine directly.
    const onPong = (): void => {
      if (pingSentAt > 0) {
        useSocketStore.getState().setLatency(Date.now() - pingSentAt);
      }
    };
    if (socket.io.engine) {
      socket.io.engine.on('pong', onPong);
    }
    // Engine may be created after the Manager connects
    socket.io.on('open', () => {
      socket.io.engine?.on('pong', onPong);
    });

    // ── Room events ──────────────────────────────────────────────

    socket.on('room:state_update', (payload) => {
      useRoomStore.getState().handleRoomStateUpdate(payload);
    });

    socket.on('presence:player_joined', (payload) => {
      useRoomStore.getState().handlePlayerJoined(payload);
      useUIStore.getState().addNotification('info', `${payload.username} joined the room`);
    });

    socket.on('presence:player_left', (payload) => {
      useRoomStore.getState().handlePlayerLeft(payload);
    });

    socket.on('presence:player_disconnected', (payload) => {
      useUIStore.getState().addNotification(
        'warning',
        `Player disconnected. Grace period: ${Math.round(payload.gracePeriodMs / 1000)}s`,
      );
    });

    socket.on('presence:player_reconnected', (payload) => {
      useUIStore.getState().addNotification('info', `Player ${payload.userId} reconnected`);
    });

    // ── Game events ──────────────────────────────────────────────

    socket.on('game:started', (payload) => {
      useGameStore.getState().handleGameStarted(payload);
    });

    socket.on('game:state_update', (payload) => {
      useGameStore.getState().handleGameStateUpdate(payload);
    });

    socket.on('game:action_rejected', (payload) => {
      useGameStore.getState().handleActionRejected(payload);
    });

    socket.on('game:ended', (payload) => {
      useGameStore.getState().handleGameEnded(payload);
    });

    // ── Sync events ──────────────────────────────────────────────

    socket.on('state:full_sync', (payload) => {
      logger.info('Received full state sync');
      useRoomStore.getState().handleRoomStateUpdate(payload.roomState);
      useGameStore.getState().handleFullSyncGameState(payload.gameState);
    });

    // ── Error events ─────────────────────────────────────────────

    socket.on('error', (payload) => {
      logger.warn({ code: payload.code }, 'Socket error: %s', payload.message);

      if (payload.code === 'AUTH_EXPIRED') {
        // Try refreshing the token and updating socket auth
        void useAuthStore.getState().refreshAccessToken().then((newToken) => {
          if (newToken) {
            updateSocketAuth(newToken);
            socket.disconnect().connect();
          }
        });
      } else {
        useUIStore.getState().addNotification('error', payload.message);
      }
    });

    // ── Server draining ──────────────────────────────────────────

    socket.on('server:draining', (payload) => {
      logger.warn({ reason: payload.reason }, 'Server is draining');
      useUIStore.getState().addNotification(
        'warning',
        `Server maintenance. Reconnecting in ${Math.round(payload.reconnectAfterMs / 1000)}s...`,
      );
    });

    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, [isAuthenticated]);

  const getSocketInstance = useCallback(() => {
    return socketRef.current ?? getSocket();
  }, []);

  return { getSocketInstance };
}
