/**
 * Base application error class.
 *
 * All typed errors thrown by the application extend this class.
 * The global error handler uses the properties to generate consistent
 * HTTP error responses.
 *
 * @see docs/specs/api-gateway.md Section 8.3 (Error Response Mapping)
 */

import type { ErrorCode } from '@sbobuz/shared';

/**
 * Base class for all application errors.
 *
 * Properties:
 * - `statusCode` - HTTP status code to return to the client.
 * - `errorCode` - Machine-readable error code from the ErrorCode catalog.
 * - `isOperational` - Whether this is an expected (operational) error.
 *   Operational errors are safe to expose to clients. Non-operational errors
 *   (programmer bugs) are logged and masked as 500 INTERNAL_ERROR.
 * - `details` - Optional additional context (e.g., validation error list).
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    options: {
      statusCode: number;
      errorCode: ErrorCode;
      isOperational?: boolean | undefined;
      details?: unknown;
      cause?: Error | undefined;
    },
  ) {
    super(message, { cause: options.cause });

    this.name = this.constructor.name;
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;

    // Ensure prototype chain is correct for instanceof checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
