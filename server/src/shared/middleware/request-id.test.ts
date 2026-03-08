/**
 * Tests for request ID middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { requestIdMiddleware } from './request-id.js';

// Mock context module
const mockRunWithContext = vi.fn((_ctx, fn) => fn());
vi.mock('../context.js', () => ({
  runWithContext: (...args: unknown[]) => mockRunWithContext(...args),
  generateRequestId: () => 'generated-uuid-1234',
  generateTraceId: () => 'generated-trace-id',
  generateSpanId: () => 'generated-span-id',
}));

function createMockReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    setHeader: vi.fn(),
  } as unknown as Response;
  return res;
}

describe('requestIdMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it('should generate a new requestId when X-Request-Id header is absent', () => {
    const req = createMockReq();
    const res = createMockRes();

    requestIdMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'generated-uuid-1234');
    expect(next).toHaveBeenCalled();
  });

  it('should use existing X-Request-Id header when present', () => {
    const req = createMockReq({ 'x-request-id': 'custom-request-id' });
    const res = createMockRes();

    requestIdMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'custom-request-id');
  });

  it('should use existing X-Trace-Id header when present', () => {
    const req = createMockReq({ 'x-trace-id': 'custom-trace-id' });
    const res = createMockRes();

    requestIdMiddleware(req, res, next);

    expect(mockRunWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: 'custom-trace-id' }),
      expect.any(Function),
    );
  });

  it('should generate traceId when X-Trace-Id header is absent', () => {
    const req = createMockReq();
    const res = createMockRes();

    requestIdMiddleware(req, res, next);

    expect(mockRunWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: 'generated-trace-id' }),
      expect.any(Function),
    );
  });

  it('should always generate a new spanId', () => {
    const req = createMockReq();
    const res = createMockRes();

    requestIdMiddleware(req, res, next);

    expect(mockRunWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ spanId: 'generated-span-id' }),
      expect.any(Function),
    );
  });

  it('should run next() within AsyncLocalStorage context', () => {
    const req = createMockReq();
    const res = createMockRes();

    requestIdMiddleware(req, res, next);

    expect(mockRunWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'generated-uuid-1234',
        traceId: 'generated-trace-id',
        spanId: 'generated-span-id',
      }),
      expect.any(Function),
    );
    expect(next).toHaveBeenCalled();
  });

  it('should set the response header before calling next', () => {
    const req = createMockReq();
    const res = createMockRes();
    const callOrder: string[] = [];

    (res.setHeader as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('setHeader');
    });
    mockRunWithContext.mockImplementation((_ctx, fn) => {
      callOrder.push('runWithContext');
      return fn();
    });

    requestIdMiddleware(req, res, next);

    expect(callOrder[0]).toBe('setHeader');
    expect(callOrder[1]).toBe('runWithContext');
  });
});
