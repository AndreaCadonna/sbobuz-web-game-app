/**
 * Socket.IO client configuration and instance management.
 *
 * The socket instance is kept at module scope (not in React state)
 * to avoid re-renders and ensure a single connection per client session.
 */
import { io, type Socket } from 'socket.io-client';

import type { ClientToServerEvents, ServerToClientEvents } from '@/types/client';

import { logger } from './logger';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000';

// Prevent accidental use of unencrypted WebSocket in production
if (
  process.env.NODE_ENV === 'production' &&
  SOCKET_URL.startsWith('http://')
) {
  throw new Error(
    'NEXT_PUBLIC_SOCKET_URL must use https:// (or wss://) in production. ' +
    'Sending authentication tokens over unencrypted connections is not allowed.',
  );
}

const HEARTBEAT_INTERVAL_MS = 25_000;

let socket: TypedClientSocket | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Create and connect a typed Socket.IO client.
 * If a connection already exists, disconnects it first.
 */
export function connectSocket(accessToken: string): TypedClientSocket {
  if (socket?.connected) {
    logger.debug('Disconnecting existing socket before reconnecting');
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    timeout: 20_000,
    autoConnect: true,
  }) as TypedClientSocket;

  // Start heartbeat once connected
  socket.on('connect', () => {
    startHeartbeat();
  });

  socket.on('disconnect', () => {
    stopHeartbeat();
  });

  return socket;
}

/**
 * Get the current socket instance. Returns null if not connected.
 */
export function getSocket(): TypedClientSocket | null {
  return socket;
}

/**
 * Disconnect and clean up the socket instance.
 */
export function disconnectSocket(): void {
  stopHeartbeat();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Update the auth token on the existing socket (for reconnection after refresh).
 */
export function updateSocketAuth(accessToken: string): void {
  if (socket) {
    socket.auth = { token: accessToken };
  }
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (socket?.connected) {
      socket.emit('presence:heartbeat');
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}
