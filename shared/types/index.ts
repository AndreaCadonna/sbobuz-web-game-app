/**
 * Barrel export for all shared types.
 *
 * Re-exports every type from the shared/types module so consumers
 * can import from a single entry point:
 *
 * @example
 * ```typescript
 * import type { Card, GameState, GameAction } from '@sbobuz/shared';
 * ```
 */

// Card domain types
export type { Suit, Rank, StandardCard, JokerCard, Card } from './card.js';

// Active zone types
export type { ActiveZone } from './active-zone.js';

// Game state types
export type {
  GameConfig,
  GamePhase,
  PlayerState,
  GameState,
} from './game-state.js';

// Game action types
export type {
  PlayCardsAction,
  PlayBlindAction,
  PickUpPileAction,
  DeclareDirectionAction,
  TimeoutForfeitAction,
  CancelGameAction,
  GameAction,
  GameActionType,
} from './game-action.js';

// User types
export type { UserStatus, PublicUserProfile } from './user.js';

// Room/lobby types
export type {
  RoomVisibility,
  RoomStatus,
  RoomPlayer,
  RoomSettings,
  RoomState,
} from './room.js';

// API response types
export type {
  PaginationMeta,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  ErrorCode,
} from './api.js';
