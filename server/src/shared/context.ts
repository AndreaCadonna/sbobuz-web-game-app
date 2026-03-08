/**
 * AsyncLocalStorage-based request context.
 *
 * Provides automatic context propagation through async call chains without
 * requiring explicit parameter passing. Middleware sets context (traceId,
 * userId, etc.) and the logger reads it automatically.
 *
 * @see docs/specs/observability-stack.md Section 2.1 (LogEntry)
 * @see docs/specs/observability-stack.md Section 4.5 (Context Injection)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * The request context carried through async call chains.
 * All fields are optional -- they are populated by middleware as
 * information becomes available during request processing.
 */
export interface RequestContext {
  /** W3C Trace Context trace ID (32 hex chars). */
  readonly traceId?: string | undefined;
  /** W3C Trace Context span ID (16 hex chars). */
  readonly spanId?: string | undefined;
  /** Authenticated user performing the action. */
  readonly userId?: string | undefined;
  /** Active room context. */
  readonly roomId?: string | undefined;
  /** Active game context. */
  readonly gameId?: string | undefined;
  /** Unique ID for HTTP requests. */
  readonly requestId?: string | undefined;
  /** Socket.IO connection ID. */
  readonly socketId?: string | undefined;
}

/**
 * The AsyncLocalStorage instance used to store request context.
 * Exported for direct access in middleware, but prefer the helper functions.
 */
export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context, or an empty object if none is set.
 */
export function getContext(): RequestContext {
  return asyncLocalStorage.getStore() ?? {};
}

/**
 * Run a function within a new request context.
 * This is the primary API for establishing context in middleware.
 *
 * @param context - The context to set for the duration of the callback.
 * @param fn - The function to execute with the given context.
 * @returns The return value of the function.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Generate a new request ID (UUIDv4).
 * Used by the request ID middleware to create correlation IDs.
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Generate a placeholder trace ID (32 hex chars).
 * Used when no OTel trace context is available.
 */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Generate a placeholder span ID (16 hex chars).
 * Used when no OTel span context is available.
 */
export function generateSpanId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}
