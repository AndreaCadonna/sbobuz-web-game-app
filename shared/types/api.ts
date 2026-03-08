/**
 * API response envelope types and error codes.
 *
 * All HTTP API responses follow a consistent envelope format providing
 * a predictable contract for the client. Success responses wrap payload
 * data; error responses provide machine-readable codes and human-readable
 * messages.
 *
 * @see docs/specs/api-gateway.md Section 2.1 (Request/Response Envelope)
 * @see docs/specs/api-gateway.md Section 2.2 (Error Codes)
 */

/**
 * Pagination metadata for list endpoints.
 *
 * @see docs/specs/api-gateway.md Section 2.1 (PaginationMeta)
 */
export interface PaginationMeta {
  /** Current page (1-indexed). */
  readonly page: number;
  /** Items per page. */
  readonly pageSize: number;
  /** Total matching items. */
  readonly totalItems: number;
  /** Total number of pages: ceil(totalItems / pageSize). */
  readonly totalPages: number;
  /** Whether a next page exists. */
  readonly hasNextPage: boolean;
  /** Whether a previous page exists. */
  readonly hasPreviousPage: boolean;
}

/**
 * Successful API response envelope.
 *
 * @typeParam T - The payload type, specific to each endpoint.
 *
 * @see docs/specs/api-gateway.md Section 2.1
 */
export interface ApiSuccessResponse<T> {
  readonly success: true;
  /** The response payload, typed per endpoint. */
  readonly data: T;
  /** Optional metadata including request ID, timestamp, and pagination. */
  readonly meta?: {
    readonly requestId: string;
    readonly timestamp: string;
    readonly pagination?: PaginationMeta | undefined;
  } | undefined;
}

/**
 * Error API response envelope.
 *
 * @see docs/specs/api-gateway.md Section 2.1
 */
export interface ApiErrorResponse {
  readonly success: false;
  readonly error: {
    /** Machine-readable error code. */
    readonly code: ErrorCode;
    /** Human-readable error description. */
    readonly message: string;
    /** Additional context (e.g., validation error details). */
    readonly details?: unknown;
    /** Correlation ID for debugging. */
    readonly requestId: string;
    /** ISO 8601 server timestamp. */
    readonly timestamp: string;
  };
}

/**
 * Union of success and error response envelopes.
 *
 * @typeParam T - The success payload type.
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Exhaustive catalog of machine-readable error codes.
 * Every error the API can return maps to one of these codes.
 * Codes are namespaced by module for clarity.
 *
 * @see docs/specs/api-gateway.md Section 2.2
 */
export type ErrorCode =
  // --- General ---
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'

  // --- Auth ---
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_INSUFFICIENT_PERMISSIONS'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_ACCOUNT_BANNED'
  | 'AUTH_DUPLICATE_EMAIL'
  | 'AUTH_DUPLICATE_USERNAME'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_REFRESH_INVALID'

  // --- Lobby ---
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_ALREADY_IN_GAME'
  | 'ROOM_NOT_HOST'
  | 'ROOM_NOT_READY'
  | 'ROOM_PLAYER_NOT_IN_ROOM'

  // --- Game ---
  | 'GAME_NOT_FOUND'
  | 'GAME_INVALID_ACTION'
  | 'GAME_NOT_YOUR_TURN'
  | 'GAME_ALREADY_FINISHED'

  // --- WebSocket ---
  | 'WS_AUTH_FAILED'
  | 'WS_MAX_CONNECTIONS'
  | 'WS_INVALID_MESSAGE';
