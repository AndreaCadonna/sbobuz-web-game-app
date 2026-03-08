/**
 * CORS middleware configuration.
 *
 * Wraps the `cors` npm package with config-driven origin list.
 *
 * @see docs/specs/api-gateway.md Section 2.5 (CORS Configuration)
 */

import cors, { type CorsOptions } from 'cors';
import type { RequestHandler } from 'express';

import type { ServerConfig } from '../config/index.js';

/**
 * Create a CORS middleware configured from the server config.
 *
 * @param config - Validated server config containing CORS_ALLOWED_ORIGINS.
 * @returns Express CORS middleware.
 */
export function createCorsMiddleware(config: ServerConfig): RequestHandler {
  const origins = config.CORS_ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  const options: CorsOptions = {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400,
  };

  return cors(options);
}
