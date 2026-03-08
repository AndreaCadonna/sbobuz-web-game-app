/**
 * Auth module TypeScript interfaces.
 *
 * @see docs/specs/auth-module.md Section 2
 */

/**
 * User account status.
 */
export type UserStatus = 'active' | 'banned' | 'suspended' | 'deleted';

/**
 * User record from the database.
 */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly status: UserStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * User joined with credentials (for login flow).
 */
export interface UserWithCredentials extends User {
  readonly passwordHash: string;
}

/**
 * Device info for session tracking.
 */
export interface DeviceInfo {
  readonly userAgent: string;
  readonly ipAddress: string;
  readonly platform: 'web' | 'mobile' | 'unknown';
}

/**
 * Session stored in Redis.
 */
export interface Session {
  readonly sessionId: string;
  readonly userId: string;
  readonly deviceInfo: DeviceInfo;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly isRevoked: boolean;
}

/**
 * Refresh token stored in Redis.
 */
export interface RefreshToken {
  readonly tokenId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly isUsed: boolean;
}

/**
 * Data required to create a new user.
 */
export interface CreateUserData {
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly passwordHash: string;
}
