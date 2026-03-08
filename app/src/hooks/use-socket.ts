/**
 * useSocket — Custom hook for Socket.IO connection management.
 *
 * Connects on mount when authenticated, disconnects on unmount.
 * Routes server events to appropriate Zustand stores.
 * Handles reconnection with token refresh and heartbeat.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';

import {
  connectSocket,
  disconnectSocket,
  getSocket,
  updateSocketAuth,
  type TypedClientSocket,
} from '@/lib/socket';
import { logger } from '@/lib/logger';
import { useAuthStore, selectIsAuthenticated } from '@/stores/auth-store';
import { useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';
import { useSocketStore } from '@/stores/socket-store';
import { useUIStore } from '@/stores/ui-store';

/**
 * Manages the Socket.IO lifecycle and event routing.
 * Should be mounted once in the authenticated layout.
 */
export function useSocket(): {
  getSocketInstance: () => TypedClientSocket | null;
} {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);

  const setConnected = useSocketStore((s) => s.setConnected);
  const setDisconnected = useSocketStore((s) => s.setDisconnected);
  const setReconnecting = useSocketStore((s) => s.setReconnecting);
  const setLatency = useSocketStore((s) => s.setLatency);

  const handleRoomStateUpdate = useRoomStore((s) => s.handleRoomStateUpdate);
  const handlePlayerJoined = useRoomStore((s) => s.handlePlayerJoined);
  const handlePlayerLeft = useRoomStore((s) => s.handlePlayerLeft);

  const handleGameStarted = useGameStore((s) => s.handleGameStarted);
  const handleGameStateUpdate = useGameStore((s) => s.handleGameStateUpdate);
  const handleActionRejected = useGameStore((s) => s.handleActionRejected);
  const handleGameEnded = useGameStore((s) => s.handleGameEnded);
  const handleFullSyncGameState = useGameStore((s) => s.handleFullSyncGameState);

  const addNotification = useUIStore((s) => s.addNotification);

  const socketRef = useRef<TypedClientSocket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      disconnectSocket();
      socketRef.current = null;
      return;
    }

    const socket = connectSocket(accessToken);
    socketRef.current = socket;

    // ── Connection events ────────────────────────────────────────

    socket.on('connect', () => {
      logger.info('Socket connected');
      setConnected();
    });

    socket.on('disconnect', (reason) => {
      logger.info({ reason }, 'Socket disconnected');
      setDisconnected();

      if (reason === 'io server disconnect') {
        // Server forced disconnect — may need new token
        addNotification('warning', 'Disconnected from server');
      }
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      logger.debug({ attempt }, 'Reconnection attempt');
      setReconnecting(attempt);
    });

    socket.io.on('reconnect', () => {
      logger.info('Socket reconnected');
      setConnected();
    });

    socket.io.on('reconnect_failed', () => {
      logger.error('Socket reconnection failed after max attempts');
      addNotification('error', 'Connection lost. Please refresh the page.');
    });

    // ── Latency measurement ──────────────────────────────────────
    // Socket.IO engine pings the server; we measure round-trip time
    // by tracking the ping event and using the reconnect/open timing.

    socket.io.on('ping', () => {
      // The manager emits 'ping' right before sending a probe packet.
      // We can approximate latency from the engine's ping interval.
      if (socket.io.engine) {
        const transport = socket.io.engine as unknown as { pingTimeout?: number };
        if (typeof transport.pingTimeout === 'number') {
          setLatency(transport.pingTimeout);
        }
      }
    });

    // ── Room events ──────────────────────────────────────────────

    socket.on('room:state_update', handleRoomStateUpdate);

    socket.on('presence:player_joined', (payload) => {
      handlePlayerJoined(payload);
      addNotification('info', `${payload.username} joined the room`);
    });

    socket.on('presence:player_left', (payload) => {
      handlePlayerLeft(payload);
    });

    socket.on('presence:player_disconnected', (payload) => {
      addNotification(
        'warning',
        `Player disconnected. Grace period: ${Math.round(payload.gracePeriodMs / 1000)}s`,
      );
    });

    socket.on('presence:player_reconnected', (payload) => {
      addNotification('info', `Player ${payload.userId} reconnected`);
    });

    // ── Game events ──────────────────────────────────────────────

    socket.on('game:started', handleGameStarted);
    socket.on('game:state_update', handleGameStateUpdate);
    socket.on('game:action_rejected', handleActionRejected);
    socket.on('game:ended', handleGameEnded);

    // ── Sync events ──────────────────────────────────────────────

    socket.on('state:full_sync', (payload) => {
      logger.info('Received full state sync');
      handleRoomStateUpdate(payload.roomState);
      handleFullSyncGameState(payload.gameState);
    });

    // ── Error events ─────────────────────────────────────────────

    socket.on('error', (payload) => {
      logger.warn({ code: payload.code }, 'Socket error: %s', payload.message);

      if (payload.code === 'AUTH_EXPIRED') {
        // Try refreshing the token and updating socket auth
        void refreshAccessToken().then((newToken) => {
          if (newToken) {
            updateSocketAuth(newToken);
            socket.disconnect().connect();
          }
        });
      } else {
        addNotification('error', payload.message);
      }
    });

    // ── Server draining ──────────────────────────────────────────

    socket.on('server:draining', (payload) => {
      logger.warn({ reason: payload.reason }, 'Server is draining');
      addNotification(
        'warning',
        `Server maintenance. Reconnecting in ${Math.round(payload.reconnectAfterMs / 1000)}s...`,
      );
    });

    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, [
    isAuthenticated,
    accessToken,
    setConnected,
    setDisconnected,
    setReconnecting,
    setLatency,
    handleRoomStateUpdate,
    handlePlayerJoined,
    handlePlayerLeft,
    handleGameStarted,
    handleGameStateUpdate,
    handleActionRejected,
    handleGameEnded,
    handleFullSyncGameState,
    addNotification,
    refreshAccessToken,
  ]);

  const getSocketInstance = useCallback(() => {
    return socketRef.current ?? getSocket();
  }, []);

  return { getSocketInstance };
}
