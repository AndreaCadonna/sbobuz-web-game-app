/**
 * Zod-based request validation middleware factories.
 *
 * Validates request body, query params, and path params against Zod schemas.
 * On failure, returns 400 VALIDATION_ERROR with details. Sensitive fields
 * are redacted in error output.
 *
 * @see docs/specs/api-gateway.md Section 5.4 (Input Validation)
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError, ZodIssue } from 'zod';

import { ValidationError } from '../errors/index.js';

/**
 * Fields whose values should be redacted in validation error details.
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'cookie',
]);

/**
 * Validation error detail for a single field.
 */
export interface ValidationErrorDetail {
  readonly field: string;
  readonly message: string;
  readonly received: unknown;
}

/**
 * Convert a ZodError into an array of validation detail objects,
 * redacting sensitive field values.
 */
function formatZodError(error: ZodError, prefix: string): ValidationErrorDetail[] {
  return error.issues.map((issue: ZodIssue) => {
    const fieldPath = issue.path.length > 0
      ? `${prefix}.${issue.path.join('.')}`
      : prefix;

    const lastSegment = issue.path[issue.path.length - 1];
    const isSensitive =
      typeof lastSegment === 'string' && SENSITIVE_FIELDS.has(lastSegment);

    return {
      field: fieldPath,
      message: issue.message,
      received: isSensitive ? '***' : ('received' in issue ? issue.received : undefined),
    };
  });
}

/**
 * Create middleware that validates req.body against a Zod schema.
 *
 * On success, replaces req.body with the parsed (validated) data.
 * On failure, throws a ValidationError with details.
 *
 * @param schema - The Zod schema to validate against.
 * @returns Express middleware.
 */
export function validateBody<T>(
  schema: ZodSchema<T>,
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = formatZodError(result.error, 'body');
      next(new ValidationError('Request body validation failed', { details }));
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Create middleware that validates req.query against a Zod schema.
 *
 * On success, replaces req.query with the parsed (validated) data.
 * On failure, throws a ValidationError with details.
 *
 * @param schema - The Zod schema to validate against.
 * @returns Express middleware.
 */
export function validateQuery<T>(
  schema: ZodSchema<T>,
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const details = formatZodError(result.error, 'query');
      next(new ValidationError('Query parameter validation failed', { details }));
      return;
    }

    (req as Request & { query: T }).query = result.data as T & Record<string, string | string[] | undefined>;
    next();
  };
}

/**
 * Create middleware that validates req.params against a Zod schema.
 *
 * On success, replaces req.params with the parsed (validated) data.
 * On failure, throws a ValidationError with details.
 *
 * @param schema - The Zod schema to validate against.
 * @returns Express middleware.
 */
export function validateParams<T>(
  schema: ZodSchema<T>,
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const details = formatZodError(result.error, 'params');
      next(new ValidationError('Path parameter validation failed', { details }));
      return;
    }

    req.params = result.data as Record<string, string>;
    next();
  };
}
