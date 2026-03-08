/**
 * Request ID middleware.
 *
 * Generates a UUIDv4 requestId if not present in the X-Request-Id header,
 * sets it as a response header, and establishes an AsyncLocalStorage context
 * for the duration of the request.
 *
 * @see docs/specs/api-gateway.md Section 4.1 (step 1)
 */

import type { Request, Response, NextFunction } from 'express';

import {
  runWithContext,
  generateRequestId,
  generateTraceId,
  generateSpanId,
} from '../context.js';

/**
 * Middleware that assigns a unique requestId, traceId, and spanId to each
 * request and runs subsequent middleware within AsyncLocalStorage context.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId =
    (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();
  const traceId =
    (req.headers['x-trace-id'] as string | undefined) ?? generateTraceId();
  const spanId = generateSpanId();

  res.setHeader('X-Request-Id', requestId);

  runWithContext({ requestId, traceId, spanId }, () => {
    next();
  });
}
