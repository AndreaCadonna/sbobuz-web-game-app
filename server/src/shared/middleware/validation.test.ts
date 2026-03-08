/**
 * Tests for Zod validation middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { validateBody, validateQuery, validateParams } from './validation.js';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  return {} as Response;
}

describe('validateBody', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('should call next() on valid input', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validateBody(schema);
    const req = createMockReq({ body: { name: 'John' } });
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'John' });
  });

  it('should replace req.body with parsed data', () => {
    const schema = z.object({
      count: z.coerce.number(),
    });
    const middleware = validateBody(schema);
    const req = createMockReq({ body: { count: '42' } });
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ count: 42 });
  });

  it('should call next with ValidationError on invalid input', () => {
    const schema = z.object({ name: z.string().min(1) });
    const middleware = validateBody(schema);
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ValidationError',
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
      }),
    );
  });

  it('should include field details in validation error', () => {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(3),
    });
    const middleware = validateBody(schema);
    const req = createMockReq({ body: { email: 'bad', name: 'ab' } });
    const res = createMockRes();

    middleware(req, res, next);

    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { details: unknown };
    expect(err.details).toBeDefined();
    expect(Array.isArray(err.details)).toBe(true);
    const details = err.details as Array<{ field: string; message: string }>;
    expect(details.length).toBeGreaterThanOrEqual(2);
    expect(details.some((d) => d.field.includes('email'))).toBe(true);
    expect(details.some((d) => d.field.includes('name'))).toBe(true);
  });

  it('should redact sensitive fields in error details', () => {
    const schema = z.object({
      password: z.string().min(8),
    });
    const middleware = validateBody(schema);
    const req = createMockReq({ body: { password: 'short' } });
    const res = createMockRes();

    middleware(req, res, next);

    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { details: unknown };
    const details = err.details as Array<{ field: string; received: unknown }>;
    const passwordDetail = details.find((d) => d.field.includes('password'));
    expect(passwordDetail?.received).toBe('***');
  });

  it('should prefix field paths with "body"', () => {
    const schema = z.object({ email: z.string().email() });
    const middleware = validateBody(schema);
    const req = createMockReq({ body: { email: 'invalid' } });
    const res = createMockRes();

    middleware(req, res, next);

    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { details: unknown };
    const details = err.details as Array<{ field: string }>;
    expect(details[0]?.field).toMatch(/^body\./);
  });
});

describe('validateQuery', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('should validate and parse query parameters', () => {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
    });
    const middleware = validateQuery(schema);
    const req = createMockReq({ query: { page: '3' } as Record<string, string> });
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should call next with ValidationError on invalid query', () => {
    const schema = z.object({
      page: z.coerce.number().int().positive(),
    });
    const middleware = validateQuery(schema);
    const req = createMockReq({ query: { page: '-1' } as Record<string, string> });
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ValidationError',
      }),
    );
  });

  it('should prefix field paths with "query"', () => {
    const schema = z.object({ page: z.coerce.number().positive() });
    const middleware = validateQuery(schema);
    const req = createMockReq({ query: { page: 'abc' } as Record<string, string> });
    const res = createMockRes();

    middleware(req, res, next);

    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { details: unknown };
    const details = err.details as Array<{ field: string }>;
    expect(details[0]?.field).toMatch(/^query/);
  });
});

describe('validateParams', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('should validate path parameters', () => {
    const schema = z.object({
      id: z.string().uuid(),
    });
    const middleware = validateParams(schema);
    const req = createMockReq({
      params: { id: '550e8400-e29b-41d4-a716-446655440000' } as Record<string, string>,
    });
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should call next with ValidationError on invalid params', () => {
    const schema = z.object({
      id: z.string().uuid(),
    });
    const middleware = validateParams(schema);
    const req = createMockReq({
      params: { id: 'not-a-uuid' } as Record<string, string>,
    });
    const res = createMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ValidationError',
      }),
    );
  });

  it('should prefix field paths with "params"', () => {
    const schema = z.object({ id: z.string().uuid() });
    const middleware = validateParams(schema);
    const req = createMockReq({ params: { id: 'bad' } as Record<string, string> });
    const res = createMockRes();

    middleware(req, res, next);

    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { details: unknown };
    const details = err.details as Array<{ field: string }>;
    expect(details[0]?.field).toMatch(/^params\./);
  });
});
