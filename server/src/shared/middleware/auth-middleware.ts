/**
 * JWT authentication middleware.
 *
 * Extracts Bearer token from Authorization header, verifies JWT signature
 * (HS256), and attaches userId/username to the request object.
 *
 * @see docs/specs/api-gateway.md Section 5.2 (JWT Validation)
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { AuthenticationError } from '../errors/index.js';
import { createModuleLogger } from '../logger.js';
import { getContext, runWithContext } from '../context.js';

const logger = createModuleLogger('gateway');

/**
 * JWT access token payload shape.
 */
export interface AccessTokenPayload {
  /** Subject — userId. */
  readonly sub: string;
  /** User email. */
  readonly email: string;
  /** Username. */
  readonly username: string;
  /** Session ID bound to this token. */
  readonly sessionId: string;
  /** Issued at (Unix seconds). */
  readonly iat: number;
  /** Expiration (Unix seconds). */
  readonly exp: number;
  /** Token type — must be 'access'. */
  readonly type: 'access';
  /** Token ID. */
  readonly jti: string;
  /** Issuer. */
  readonly iss: string;
}

/**
 * Extend Express Request to include authenticated user information.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string | undefined;
      username?: string | undefined;
      userEmail?: string | undefined;
      sessionId?: string | undefined;
    }
  }
}

/**
 * Extract the Bearer token from the Authorization header.
 */
function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader) return undefined;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return undefined;

  return parts[1];
}

/**
 * Verify and decode a JWT access token.
 *
 * @throws AuthenticationError with appropriate error code.
 */
function verifyToken(token: string, jwtSecret: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'sbobuz',
    }) as Record<string, unknown>;

    // Validate type claim
    if (decoded['type'] !== 'access') {
      throw new AuthenticationError('Invalid token type', {
        errorCode: 'AUTH_INVALID_TOKEN',
      });
    }

    return decoded as unknown as AccessTokenPayload;
  } catch (err) {
    if (err instanceof AuthenticationError) {
      throw err;
    }

    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Access token expired', {
        errorCode: 'AUTH_TOKEN_EXPIRED',
      });
    }

    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid access token', {
        errorCode: 'AUTH_INVALID_TOKEN',
      });
    }

    throw new AuthenticationError('Token verification failed', {
      errorCode: 'AUTH_INVALID_TOKEN',
    });
  }
}

/**
 * Create authentication middleware that requires a valid JWT access token.
 *
 * @param jwtSecret - The HS256 signing secret.
 * @returns Express middleware that rejects unauthenticated requests.
 */
export function createAuthMiddleware(
  jwtSecret: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req);

    if (!token) {
      next(
        new AuthenticationError('Authentication required', {
          errorCode: 'AUTH_REQUIRED',
        }),
      );
      return;
    }

    try {
      const payload = verifyToken(token, jwtSecret);

      req.userId = payload.sub;
      req.username = payload.username;
      req.userEmail = payload.email;
      req.sessionId = payload.sessionId;

      // Enrich the AsyncLocalStorage context with userId
      const currentCtx = getContext();
      runWithContext({ ...currentCtx, userId: payload.sub }, () => {
        next();
      });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Create optional authentication middleware.
 *
 * Does not reject unauthenticated requests — just attaches user info
 * to the request if a valid token is present.
 *
 * @param jwtSecret - The HS256 signing secret.
 * @returns Express middleware.
 */
export function optionalAuth(
  jwtSecret: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req);

    if (!token) {
      next();
      return;
    }

    try {
      const payload = verifyToken(token, jwtSecret);

      req.userId = payload.sub;
      req.username = payload.username;
      req.userEmail = payload.email;
      req.sessionId = payload.sessionId;

      const currentCtx = getContext();
      runWithContext({ ...currentCtx, userId: payload.sub }, () => {
        next();
      });
    } catch {
      // Token is invalid but auth is optional — continue without user context
      logger.debug('Optional auth: invalid token, proceeding unauthenticated');
      next();
    }
  };
}
