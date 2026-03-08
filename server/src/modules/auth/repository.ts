/**
 * Auth module user repository.
 *
 * Database access layer for users and credentials tables.
 * All queries use parameterized statements.
 *
 * @see docs/specs/auth-module.md Section 2
 * @see docs/specs/auth-module.md Section 13 (PostgreSQL Schema)
 */

import { getPool } from '../../infra/database/index.js';
import { createModuleLogger } from '../../shared/logger.js';

import type { User, UserWithCredentials, UserStatus, CreateUserData } from './auth.types.js';

const logger = createModuleLogger('auth');

/**
 * Map a database row to a User object.
 */
function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    username: row['username'] as string,
    displayName: row['display_name'] as string,
    avatarUrl: (row['avatar_url'] as string | null) ?? null,
    status: row['status'] as UserStatus,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

/**
 * Map a database row (user + credentials join) to a UserWithCredentials object.
 */
function rowToUserWithCredentials(row: Record<string, unknown>): UserWithCredentials {
  return {
    ...rowToUser(row),
    passwordHash: row['password_hash'] as string,
  };
}

/**
 * Create a new user with credentials in a single transaction.
 *
 * @param data - User creation data including pre-hashed password.
 * @returns The created User record.
 */
export async function createUser(data: CreateUserData): Promise<User> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, username, display_name, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [data.email, data.username, data.displayName],
    );

    const userRow = userResult.rows[0] as Record<string, unknown> | undefined;
    if (!userRow) {
      throw new Error('User INSERT returned no rows');
    }

    const userId = userRow['id'] as string;

    await client.query(
      `INSERT INTO credentials (user_id, password_hash)
       VALUES ($1, $2)`,
      [userId, data.passwordHash],
    );

    await client.query('COMMIT');

    logger.info({ userId, email: data.email }, 'User created');

    return rowToUser(userRow);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Find a user by email address (case-insensitive).
 *
 * @param email - The normalized (lowercase) email.
 * @returns The User or undefined if not found.
 */
export async function findUserByEmail(email: string): Promise<User | undefined> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : undefined;
}

/**
 * Find a user by ID.
 *
 * @param id - The user UUID.
 * @returns The User or undefined if not found.
 */
export async function findUserById(id: string): Promise<User | undefined> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1`,
    [id],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : undefined;
}

/**
 * Find a user joined with credentials by email (for login flow).
 *
 * @param email - The normalized (lowercase) email.
 * @returns UserWithCredentials or undefined if not found.
 */
export async function findUserWithCredentials(
  email: string,
): Promise<UserWithCredentials | undefined> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT u.*, c.password_hash
     FROM users u
     JOIN credentials c ON c.user_id = u.id
     WHERE u.email = $1`,
    [email.toLowerCase()],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToUserWithCredentials(row) : undefined;
}

/**
 * Update a user's account status.
 *
 * @param userId - The user UUID.
 * @param status - The new status.
 */
export async function updateUserStatus(userId: string, status: UserStatus): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, userId],
  );

  logger.info({ userId, status }, 'User status updated');
}

/**
 * Check if a user with the given email exists.
 *
 * @param email - The normalized email.
 * @returns true if the email is taken.
 */
export async function userExistsByEmail(email: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) AS "exists"`,
    [email.toLowerCase()],
  );

  const row = result.rows[0] as { exists: boolean } | undefined;
  return row?.exists === true;
}

/**
 * Check if a user with the given username exists (case-insensitive).
 *
 * @param username - The username to check.
 * @returns true if the username is taken.
 */
export async function userExistsByUsername(username: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1) AS "exists"`,
    [username.toLowerCase()],
  );

  const row = result.rows[0] as { exists: boolean } | undefined;
  return row?.exists === true;
}
