/**
 * Domain-specific error subclasses.
 *
 * Each error maps to a specific HTTP status code and machine-readable
 * ErrorCode. All are operational by default (safe to expose to clients).
 *
 * @see docs/specs/api-gateway.md Section 8.3 (Error Response Mapping)
 * @see docs/specs/api-gateway.md Section 2.2 (Error Codes)
 */

import type { ErrorCode } from '@sbobuz/shared';

import { AppError } from './app-error.js';

/**
 * 400 Bad Request -- input validation failed.
 *
 * Thrown when request body, query parameters, or path parameters fail
 * Zod schema validation. The `details` field typically contains an array
 * of validation error details.
 */
export class ValidationError extends AppError {
  constructor(message: string, options?: { details?: unknown; cause?: Error }) {
    super(message, {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      details: options?.details,
      cause: options?.cause,
    });
  }
}

/**
 * 401 Unauthorized -- authentication failed.
 *
 * Used for missing tokens, invalid tokens, expired tokens, and
 * invalid credentials. The specific ErrorCode distinguishes the reason.
 */
export class AuthenticationError extends AppError {
  constructor(
    message: string,
    options?: {
      errorCode?: Extract<
        ErrorCode,
        | 'AUTH_REQUIRED'
        | 'AUTH_INVALID_TOKEN'
        | 'AUTH_TOKEN_EXPIRED'
        | 'AUTH_INVALID_CREDENTIALS'
        | 'AUTH_REFRESH_INVALID'
      >;
      details?: unknown;
      cause?: Error;
    },
  ) {
    super(message, {
      statusCode: 401,
      errorCode: options?.errorCode ?? 'AUTH_REQUIRED',
      details: options?.details,
      cause: options?.cause,
    });
  }
}

/**
 * 403 Forbidden -- authenticated but insufficient permissions.
 *
 * Used when the user's token is valid but they lack the necessary
 * permissions for the requested action.
 */
export class AuthorizationError extends AppError {
  constructor(
    message: string,
    options?: {
      errorCode?: Extract<ErrorCode, 'AUTH_INSUFFICIENT_PERMISSIONS' | 'AUTH_ACCOUNT_BANNED'>;
      details?: unknown;
      cause?: Error;
    },
  ) {
    super(message, {
      statusCode: 403,
      errorCode: options?.errorCode ?? 'AUTH_INSUFFICIENT_PERMISSIONS',
      details: options?.details,
      cause: options?.cause,
    });
  }
}

/**
 * 404 Not Found -- requested resource does not exist.
 *
 * Used for missing rooms, games, users, or generic resources.
 * The specific ErrorCode identifies the resource type.
 */
export class NotFoundError extends AppError {
  constructor(
    message: string,
    options?: {
      errorCode?: Extract<ErrorCode, 'NOT_FOUND' | 'ROOM_NOT_FOUND' | 'GAME_NOT_FOUND' | 'ROOM_PLAYER_NOT_IN_ROOM'>;
      details?: unknown;
      cause?: Error;
    },
  ) {
    super(message, {
      statusCode: 404,
      errorCode: options?.errorCode ?? 'NOT_FOUND',
      details: options?.details,
      cause: options?.cause,
    });
  }
}

/**
 * 409 Conflict -- action conflicts with current state.
 *
 * Used for duplicate email/username, room full, game already finished, etc.
 */
export class ConflictError extends AppError {
  constructor(
    message: string,
    options?: {
      errorCode?: Extract<
        ErrorCode,
        | 'AUTH_DUPLICATE_EMAIL'
        | 'AUTH_DUPLICATE_USERNAME'
        | 'ROOM_FULL'
        | 'ROOM_ALREADY_IN_GAME'
        | 'ROOM_NOT_READY'
        | 'GAME_ALREADY_FINISHED'
      >;
      details?: unknown;
      cause?: Error;
    },
  ) {
    super(message, {
      statusCode: 409,
      errorCode: options?.errorCode ?? 'AUTH_DUPLICATE_EMAIL',
      details: options?.details,
      cause: options?.cause,
    });
  }
}

/**
 * 429 Too Many Requests -- rate limit exceeded.
 *
 * Thrown by the rate limiting middleware when the sliding window
 * counter exceeds the configured maximum.
 */
export class RateLimitError extends AppError {
  constructor(message: string, options?: { details?: unknown; cause?: Error }) {
    super(message, {
      statusCode: 429,
      errorCode: 'RATE_LIMITED',
      details: options?.details,
      cause: options?.cause,
    });
  }
}

/**
 * 423 Locked -- account locked due to too many failed attempts.
 *
 * Thrown when a user exceeds the maximum number of failed login attempts
 * and their account is temporarily locked.
 */
export class AccountLockedError extends AppError {
  constructor(message: string, options?: { details?: unknown; cause?: Error }) {
    super(message, {
      statusCode: 423,
      errorCode: 'AUTH_ACCOUNT_LOCKED',
      details: options?.details,
      cause: options?.cause,
    });
  }
}

/**
 * 400 Bad Request -- game action is invalid in the current state.
 *
 * Thrown when a player attempts an action that violates game rules.
 */
export class GameError extends AppError {
  constructor(
    message: string,
    options?: {
      errorCode?: Extract<ErrorCode, 'GAME_INVALID_ACTION' | 'GAME_NOT_YOUR_TURN' | 'GAME_ALREADY_FINISHED'>;
      details?: unknown;
      cause?: Error;
    },
  ) {
    super(message, {
      statusCode: 400,
      errorCode: options?.errorCode ?? 'GAME_INVALID_ACTION',
      details: options?.details,
      cause: options?.cause,
    });
  }
}
