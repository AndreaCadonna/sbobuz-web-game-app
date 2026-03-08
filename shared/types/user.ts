/**
 * User-related types shared across modules.
 *
 * These types represent the public-facing user identity used by
 * the Lobby, Game Engine, and Leaderboard modules. The full User
 * entity (with email, credentials, etc.) is internal to the Auth Module.
 *
 * @see docs/specs/auth-module.md Section 2.1 (User)
 * @see docs/specs/data-layer.md (PublicUserProfile)
 */

/**
 * Account status that controls access across the platform.
 *
 * @see docs/specs/auth-module.md Section 2.1
 */
export type UserStatus =
  | 'active'      // normal operating state
  | 'banned'      // all sessions revoked, login rejected
  | 'suspended';  // temporary restriction, login rejected

/**
 * The public-facing projection of a user's identity.
 * Used by modules outside Auth that need to display user information
 * without accessing private fields (email, password hash, etc.).
 *
 * @see docs/specs/data-layer.md Section 8 (AuthModuleInterface)
 */
export interface PublicUserProfile {
  /** UUIDv4 user identifier. */
  readonly id: string;
  /** Unique username, stored lowercase. */
  readonly username: string;
  /** Display name preserving original casing. */
  readonly displayName: string;
  /** URL to avatar image, or null if not set. */
  readonly avatarUrl: string | null;
  /** Current account status. */
  readonly status: UserStatus;
}
