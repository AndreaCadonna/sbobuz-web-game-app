/**
 * Error hierarchy barrel export.
 *
 * @see docs/specs/api-gateway.md Section 8.3
 */

export { AppError } from './app-error.js';
export {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  AccountLockedError,
  GameError,
} from './errors.js';
