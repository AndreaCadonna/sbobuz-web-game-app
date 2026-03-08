import { describe, it, expect } from 'vitest';

import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  AccountLockedError,
  GameError,
} from './index.js';

describe('Error Hierarchy', () => {
  describe('AppError', () => {
    it('creates an error with all required properties', () => {
      const err = new AppError('something went wrong', {
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
      });

      expect(err.message).toBe('something went wrong');
      expect(err.statusCode).toBe(500);
      expect(err.errorCode).toBe('INTERNAL_ERROR');
      expect(err.isOperational).toBe(true);
      expect(err.details).toBeUndefined();
      expect(err.name).toBe('AppError');
    });

    it('supports isOperational = false for programmer errors', () => {
      const err = new AppError('bug', {
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        isOperational: false,
      });

      expect(err.isOperational).toBe(false);
    });

    it('supports details field', () => {
      const details = { field: 'email', reason: 'invalid' };
      const err = new AppError('validation failed', {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        details,
      });

      expect(err.details).toEqual(details);
    });

    it('supports cause chain', () => {
      const cause = new Error('original');
      const err = new AppError('wrapped', {
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        cause,
      });

      expect(err.cause).toBe(cause);
    });

    it('is an instance of Error', () => {
      const err = new AppError('test', { statusCode: 500, errorCode: 'INTERNAL_ERROR' });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
    });

    it('has a proper stack trace', () => {
      const err = new AppError('test', { statusCode: 500, errorCode: 'INTERNAL_ERROR' });

      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('AppError');
    });
  });

  describe('ValidationError', () => {
    it('has statusCode 400 and VALIDATION_ERROR code', () => {
      const err = new ValidationError('Invalid input');

      expect(err.statusCode).toBe(400);
      expect(err.errorCode).toBe('VALIDATION_ERROR');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('ValidationError');
    });

    it('supports details for validation error list', () => {
      const details = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Too short' },
      ];
      const err = new ValidationError('Validation failed', { details });

      expect(err.details).toEqual(details);
    });

    it('is an instance of AppError', () => {
      const err = new ValidationError('test');

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('AuthenticationError', () => {
    it('has statusCode 401 and defaults to AUTH_REQUIRED', () => {
      const err = new AuthenticationError('No token provided');

      expect(err.statusCode).toBe(401);
      expect(err.errorCode).toBe('AUTH_REQUIRED');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('AuthenticationError');
    });

    it('accepts AUTH_INVALID_TOKEN error code', () => {
      const err = new AuthenticationError('Token verification failed', {
        errorCode: 'AUTH_INVALID_TOKEN',
      });

      expect(err.errorCode).toBe('AUTH_INVALID_TOKEN');
    });

    it('accepts AUTH_TOKEN_EXPIRED error code', () => {
      const err = new AuthenticationError('Token has expired', {
        errorCode: 'AUTH_TOKEN_EXPIRED',
      });

      expect(err.errorCode).toBe('AUTH_TOKEN_EXPIRED');
    });

    it('accepts AUTH_INVALID_CREDENTIALS error code', () => {
      const err = new AuthenticationError('Wrong password', {
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      });

      expect(err.errorCode).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('accepts AUTH_REFRESH_INVALID error code', () => {
      const err = new AuthenticationError('Refresh token revoked', {
        errorCode: 'AUTH_REFRESH_INVALID',
      });

      expect(err.errorCode).toBe('AUTH_REFRESH_INVALID');
    });

    it('is an instance of AppError', () => {
      const err = new AuthenticationError('test');

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(AuthenticationError);
    });
  });

  describe('AuthorizationError', () => {
    it('has statusCode 403 and defaults to AUTH_INSUFFICIENT_PERMISSIONS', () => {
      const err = new AuthorizationError('Not allowed');

      expect(err.statusCode).toBe(403);
      expect(err.errorCode).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('AuthorizationError');
    });

    it('accepts AUTH_ACCOUNT_BANNED error code', () => {
      const err = new AuthorizationError('Account banned', {
        errorCode: 'AUTH_ACCOUNT_BANNED',
      });

      expect(err.errorCode).toBe('AUTH_ACCOUNT_BANNED');
    });

    it('is an instance of AppError', () => {
      const err = new AuthorizationError('test');

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(AuthorizationError);
    });
  });

  describe('NotFoundError', () => {
    it('has statusCode 404 and defaults to NOT_FOUND', () => {
      const err = new NotFoundError('Resource not found');

      expect(err.statusCode).toBe(404);
      expect(err.errorCode).toBe('NOT_FOUND');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('NotFoundError');
    });

    it('accepts ROOM_NOT_FOUND error code', () => {
      const err = new NotFoundError('Room does not exist', {
        errorCode: 'ROOM_NOT_FOUND',
      });

      expect(err.errorCode).toBe('ROOM_NOT_FOUND');
    });

    it('accepts GAME_NOT_FOUND error code', () => {
      const err = new NotFoundError('Game does not exist', {
        errorCode: 'GAME_NOT_FOUND',
      });

      expect(err.errorCode).toBe('GAME_NOT_FOUND');
    });

    it('accepts ROOM_PLAYER_NOT_IN_ROOM error code', () => {
      const err = new NotFoundError('Player not in room', {
        errorCode: 'ROOM_PLAYER_NOT_IN_ROOM',
      });

      expect(err.errorCode).toBe('ROOM_PLAYER_NOT_IN_ROOM');
    });

    it('is an instance of AppError', () => {
      const err = new NotFoundError('test');

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  describe('ConflictError', () => {
    it('has statusCode 409 and defaults to AUTH_DUPLICATE_EMAIL', () => {
      const err = new ConflictError('Email already registered');

      expect(err.statusCode).toBe(409);
      expect(err.errorCode).toBe('AUTH_DUPLICATE_EMAIL');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('ConflictError');
    });

    it('accepts AUTH_DUPLICATE_USERNAME error code', () => {
      const err = new ConflictError('Username taken', {
        errorCode: 'AUTH_DUPLICATE_USERNAME',
      });

      expect(err.errorCode).toBe('AUTH_DUPLICATE_USERNAME');
    });

    it('accepts ROOM_FULL error code', () => {
      const err = new ConflictError('Room is full', { errorCode: 'ROOM_FULL' });

      expect(err.errorCode).toBe('ROOM_FULL');
    });

    it('accepts ROOM_ALREADY_IN_GAME error code', () => {
      const err = new ConflictError('Game already started', {
        errorCode: 'ROOM_ALREADY_IN_GAME',
      });

      expect(err.errorCode).toBe('ROOM_ALREADY_IN_GAME');
    });

    it('accepts GAME_ALREADY_FINISHED error code', () => {
      const err = new ConflictError('Game over', {
        errorCode: 'GAME_ALREADY_FINISHED',
      });

      expect(err.errorCode).toBe('GAME_ALREADY_FINISHED');
    });

    it('is an instance of AppError', () => {
      const err = new ConflictError('test');

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(ConflictError);
    });
  });

  describe('RateLimitError', () => {
    it('has statusCode 429 and RATE_LIMITED code', () => {
      const err = new RateLimitError('Too many requests');

      expect(err.statusCode).toBe(429);
      expect(err.errorCode).toBe('RATE_LIMITED');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('RateLimitError');
    });

    it('supports details with retry information', () => {
      const err = new RateLimitError('Rate limited', {
        details: { retryAfterSeconds: 30 },
      });

      expect(err.details).toEqual({ retryAfterSeconds: 30 });
    });

    it('is an instance of AppError', () => {
      const err = new RateLimitError('test');

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(RateLimitError);
    });
  });

  describe('AccountLockedError', () => {
    it('has statusCode 423 and AUTH_ACCOUNT_LOCKED code', () => {
      const err = new AccountLockedError('Account locked');

      expect(err.statusCode).toBe(423);
      expect(err.errorCode).toBe('AUTH_ACCOUNT_LOCKED');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('AccountLockedError');
    });

    it('supports details with lock duration', () => {
      const err = new AccountLockedError('Locked for 15 minutes', {
        details: { lockDurationMinutes: 15, attemptsRemaining: 0 },
      });

      expect(err.details).toEqual({ lockDurationMinutes: 15, attemptsRemaining: 0 });
    });

    it('is an instance of AppError', () => {
      const err = new AccountLockedError('test');

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(AccountLockedError);
    });
  });

  describe('GameError', () => {
    it('has statusCode 400 and defaults to GAME_INVALID_ACTION', () => {
      const err = new GameError('Cannot play that card');

      expect(err.statusCode).toBe(400);
      expect(err.errorCode).toBe('GAME_INVALID_ACTION');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('GameError');
    });

    it('accepts GAME_NOT_YOUR_TURN error code', () => {
      const err = new GameError('Not your turn', {
        errorCode: 'GAME_NOT_YOUR_TURN',
      });

      expect(err.errorCode).toBe('GAME_NOT_YOUR_TURN');
    });

    it('accepts GAME_ALREADY_FINISHED error code', () => {
      const err = new GameError('Game over', {
        errorCode: 'GAME_ALREADY_FINISHED',
      });

      expect(err.errorCode).toBe('GAME_ALREADY_FINISHED');
    });

    it('is an instance of AppError', () => {
      const err = new GameError('test');

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(GameError);
    });
  });

  describe('error usage patterns', () => {
    it('can be thrown and caught as AppError', () => {
      try {
        throw new ValidationError('bad input', {
          details: [{ field: 'email', message: 'invalid' }],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        if (err instanceof AppError) {
          expect(err.statusCode).toBe(400);
          expect(err.errorCode).toBe('VALIDATION_ERROR');
          expect(err.details).toEqual([{ field: 'email', message: 'invalid' }]);
        }
      }
    });

    it('preserves cause chain for debugging', () => {
      const original = new Error('DB connection refused');
      const wrapped = new AppError('Service unavailable', {
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        isOperational: false,
        cause: original,
      });

      expect(wrapped.cause).toBe(original);
      expect((wrapped.cause as Error).message).toBe('DB connection refused');
    });

    it('each error class has a distinct name for logging', () => {
      const errors = [
        new AppError('test', { statusCode: 500, errorCode: 'INTERNAL_ERROR' }),
        new ValidationError('test'),
        new AuthenticationError('test'),
        new AuthorizationError('test'),
        new NotFoundError('test'),
        new ConflictError('test'),
        new RateLimitError('test'),
        new AccountLockedError('test'),
        new GameError('test'),
      ];

      const names = errors.map((e) => e.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(errors.length);
    });
  });
});
