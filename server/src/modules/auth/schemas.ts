/**
 * Zod validation schemas for auth endpoints.
 *
 * @see docs/specs/auth-module.md Section 3 (API Endpoints)
 */

import { z } from 'zod';

/**
 * Usernames that cannot be registered (case-insensitive check).
 */
const RESERVED_USERNAMES = new Set([
  'admin',
  'moderator',
  'system',
  'null',
  'undefined',
  'deleted',
]);

/**
 * Password must have at least 1 uppercase, 1 lowercase, and 1 digit.
 */
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

/**
 * Username: 3-20 chars, alphanumeric + underscore only.
 */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * Registration request body schema.
 */
export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must not exceed 255 characters')
    .transform((val) => val.toLowerCase()),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must not exceed 20 characters')
    .regex(USERNAME_PATTERN, 'Username must contain only letters, numbers, and underscores')
    .refine(
      (val) => !RESERVED_USERNAMES.has(val.toLowerCase()),
      'This username is reserved',
    ),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      PASSWORD_PATTERN,
      'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
    ),
});

/**
 * Login request body schema.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .transform((val) => val.toLowerCase()),
  password: z
    .string()
    .min(1, 'Password is required'),
});

/**
 * Inferred types from schemas.
 */
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
