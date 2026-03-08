/**
 * Global Express error handler middleware.
 *
 * Maps AppError subclasses to appropriate HTTP status + error envelope.
 * Unknown errors become 500 INTERNAL_ERROR. Never exposes raw error
 * messages for non-operational errors.
 *
 * @see docs/specs/api-gateway.md Section 8.3 (Error Response Mapping)
 */

import type { Request, Response, NextFunction } from 'express';

import type { ApiErrorResponse } from '@sbobuz/shared';

import { AppError } from '../errors/index.js';
import { createModuleLogger } from '../logger.js';
import { getContext } from '../context.js';

const logger = createModuleLogger('gateway');

/**
 * Global error handler middleware (4-arg Express signature).
 *
 * Must be registered after all routes.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const ctx = getContext();
  const requestId = ctx.requestId ?? (res.getHeader('X-Request-Id') as string | undefined) ?? '';
  const timestamp = new Date().toISOString();
  const isDev = process.env['NODE_ENV'] !== 'production';

  if (err instanceof AppError) {
    // Operational error — safe to expose
    logger.warn(
      {
        errorCode: err.errorCode,
        statusCode: err.statusCode,
        message: err.message,
        details: err.details,
        userId: ctx.userId,
      },
      'Operational error',
    );

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details,
        requestId,
        timestamp,
      },
    };

    res.status(err.statusCode).json(body);
    return;
  }

  // Non-operational error — mask details in production
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  const errorStack = err instanceof Error ? err.stack : undefined;

  logger.error(
    {
      err,
      userId: ctx.userId,
      requestId,
    },
    'Unhandled error',
  );

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isDev ? errorMessage : 'An unexpected error occurred',
      details: isDev && errorStack ? { stack: errorStack } : undefined,
      requestId,
      timestamp,
    },
  };

  res.status(500).json(body);
}
