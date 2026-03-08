/**
 * WebSocket infrastructure barrel export.
 *
 * @see docs/specs/realtime-module.md
 */

// Setup
export {
  createSocketIOServer,
  getSocketIOServer,
  closeSocketIOServer,
  resetSocketIOServer,
} from './setup.js';
export type { TypedSocketIOServer } from './setup.js';

// Auth middleware
export { socketAuthMiddleware } from './auth-middleware.js';

// Rate limiter
export {
  SocketRateLimiter,
  getSocketRateLimiter,
  removeSocketRateLimiter,
  checkEventRateLimit,
  resetAllSocketRateLimiters,
  DEFAULT_RATE_LIMITS,
} from './rate-limiter.js';
export type { RateLimitConfig } from './rate-limiter.js';

// Types
export type {
  PresenceStatus,
  PresenceState,
  SocketDeviceInfo,
  SocketConnection,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  TypedSocket,
  RoomJoinPayload,
  RoomJoinResponse,
  RoomLeavePayload,
  AckResponse,
  RoomStateUpdatePayload,
  GameActionPayload,
  GameActionResponse,
  GameStateUpdatePayload,
  ActionRejectedPayload,
  GameStartedPayload,
  GameEndedPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerDisconnectedPayload,
  PlayerReconnectedPayload,
  SocketErrorPayload,
  SocketErrorCode,
  FullSyncPayload,
  ServerDrainingPayload,
} from './types.js';
