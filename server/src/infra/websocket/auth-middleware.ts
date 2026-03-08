/**
 * Socket.IO authentication middleware.
 *
 * Verifies the JWT access token provided in the handshake `auth.token` field.
 * On success, attaches userId/username/email/sessionId to socket.data.
 * On failure, rejects the connection with an AUTH_FAILED error.
 *
 * @see docs/specs/realtime-module.md Section 5.1 (Authentication)
 */

import { verifyAccessToken } from '../../modules/auth/token-service.js';
import { createModuleLogger } from '../../shared/logger.js';

import type { TypedSocket } from './types.js';

const logger = createModuleLogger('realtime');

/**
 * Socket.IO middleware that authenticates connections via JWT.
 *
 * The client must provide the JWT in `socket.handshake.auth.token`.
 * If the token is valid, user data is attached to `socket.data`.
 * If invalid, the connection is rejected with an error.
 *
 * @param socket - The incoming socket connection.
 * @param next - Socket.IO middleware next function.
 */
export function socketAuthMiddleware(
  socket: TypedSocket,
  next: (err?: Error) => void,
): void {
  const token = socket.handshake.auth?.['token'] as string | undefined;

  if (!token) {
    logger.warn(
      { socketId: socket.id, ip: socket.handshake.address },
      'WebSocket connection rejected: no token provided',
    );
    const err = new Error('Authentication required');
    (err as Record<string, unknown>)['data'] = { code: 'AUTH_FAILED', message: 'Authentication required' };
    next(err);
    return;
  }

  try {
    const decoded = verifyAccessToken(token);

    socket.data.userId = decoded.sub;
    socket.data.username = decoded.username;
    socket.data.email = decoded.email;
    socket.data.sessionId = decoded.sessionId;
    socket.data.connectedAt = new Date().toISOString();

    logger.debug(
      { socketId: socket.id, userId: decoded.sub },
      'WebSocket connection authenticated',
    );

    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';

    logger.warn(
      { socketId: socket.id, ip: socket.handshake.address, error: message },
      'WebSocket connection rejected: invalid token',
    );

    const socketErr = new Error(message);
    (socketErr as Record<string, unknown>)['data'] = { code: 'AUTH_FAILED', message };
    next(socketErr);
  }
}
