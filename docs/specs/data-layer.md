# Data Layer -- Storage Architecture and Schema Design

> **Document Type:** Architecture Spec
> **Status:** Draft
> **Last Updated:** March 2026

---

## 1. Overview

The Data Layer is the persistence backbone of the Sbobuz platform. It manages two storage engines -- PostgreSQL for durable, queryable data and Redis for ephemeral, high-throughput operational state -- and defines strict ownership rules that govern which module may read from or write to which data.

The central design principle is the **hot path / warm path split**. Data that must survive server restarts and serves as the system of record (user accounts, completed game histories, leaderboard ratings) lives in PostgreSQL. Data that must be fast and can be rebuilt from durable sources (active game state, room state, sessions, pub/sub channels) lives in Redis. The decision boundary is simple: if losing the data requires a user to re-register or loses game history, it belongs in PostgreSQL. If losing it means a player refreshes or rejoins a room, it belongs in Redis.

Five modules interact with the Data Layer: Auth, Lobby, Game Engine, Realtime, and Leaderboard. Each module owns specific tables and key namespaces. Cross-module data access is forbidden at the storage level -- modules expose typed interfaces for data exchange, never raw queries against another module's tables. This logical separation within a shared physical database enables clean service extraction in the future without data migration.

---

## 2. Data Model

### 2.1 PostgreSQL Schema

#### Auth Module Tables

```typescript
// users -- Core identity record. One row per registered player.
interface UsersRow {
  id: string;                    // UUIDv4, primary key
  username: string;              // unique, 3-30 chars, alphanumeric + underscores
  email: string;                 // unique, normalized to lowercase
  display_name: string;          // 1-50 chars, shown in-game
  avatar_url: string | null;     // optional profile image URL
  status: UserStatus;            // account lifecycle state
  created_at: string;            // ISO 8601 timestamp, set on insert
  updated_at: string;            // ISO 8601 timestamp, updated on any mutation
}

type UserStatus = 'active' | 'suspended' | 'banned' | 'deleted';

// credentials -- Authentication secrets. Separated from users for security.
// Never returned in API responses. Never logged.
interface CredentialsRow {
  id: string;                    // UUIDv4, primary key
  user_id: string;               // FK -> users.id, unique (one credential set per user)
  password_hash: string;         // bcrypt hash, cost factor 12
  refresh_token_hash: string | null; // SHA-256 hash of active refresh token
  refresh_token_expires_at: string | null; // ISO 8601, when refresh token expires
  password_changed_at: string;   // ISO 8601, tracks last password change
  failed_login_attempts: number; // reset to 0 on successful login
  locked_until: string | null;   // ISO 8601, null if not locked
  created_at: string;
  updated_at: string;
}

// oauth_providers -- Third-party auth links (Phase 2).
// Kept in schema for forward compatibility but not populated in Phase 1.
interface OAuthProvidersRow {
  id: string;                    // UUIDv4, primary key
  user_id: string;               // FK -> users.id
  provider: OAuthProvider;       // which provider
  provider_user_id: string;      // provider's unique user identifier
  access_token_encrypted: string | null; // AES-256-GCM encrypted
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

type OAuthProvider = 'google' | 'discord';
// Unique constraint: (user_id, provider) -- one link per provider per user
// Unique constraint: (provider, provider_user_id) -- one Sbobuz account per provider identity
```

#### Lobby Module Tables

```typescript
// rooms -- Archived room metadata. Written when a game starts from a room.
// Active rooms live in Redis; this table is the historical record.
interface RoomsRow {
  id: string;                    // UUIDv4, primary key (same ID used in Redis during active phase)
  host_user_id: string;          // FK -> users.id, the player who created the room
  room_code: string;             // 6-char alphanumeric, used for private room joins
  visibility: RoomVisibility;
  max_players: number;           // 2-5
  turn_timer_seconds: number;    // room-level game config
  disconnect_grace_seconds: number;
  player_ids: string[];          // array of user IDs who were in the room when game started
  status: RoomArchiveStatus;
  created_at: string;            // when the room was originally created
  game_started_at: string;       // when the game launched from this room
  archived_at: string;           // when this row was written
}

type RoomVisibility = 'public' | 'private';
type RoomArchiveStatus = 'game_started' | 'expired' | 'disbanded';
```

#### Game Engine Module Tables

```typescript
// games -- One row per completed (or cancelled) game.
// Written after the game reaches a terminal state.
interface GamesRow {
  id: string;                    // UUIDv4, primary key (same ID used in Redis during active phase)
  room_id: string;               // FK -> rooms.id
  winner_user_id: string | null; // FK -> users.id, null if cancelled
  phase: TerminalGamePhase;
  player_ids: string[];          // ordered by seat position
  config: GameConfig;            // JSONB -- turn timer, grace period, etc.
  rng_seed: number;              // seed used for deterministic replay
  action_count: number;          // total actions in the game
  duration_seconds: number;      // wall-clock game duration
  started_at: string;
  ended_at: string;
  created_at: string;            // row insertion timestamp
}

type TerminalGamePhase = 'finished' | 'cancelled';

interface GameConfig {
  turnTimerSeconds: number;
  disconnectGraceSeconds: number;
  maxPlayers: 5;
  minPlayers: 2;
}

// game_actions -- Event-sourced action log. One row per action in a game.
// Ordered by index. Enables full game replay.
interface GameActionsRow {
  id: string;                    // UUIDv4, primary key
  game_id: string;               // FK -> games.id
  index: number;                 // monotonically increasing within a game, starts at 0
  action_type: GameActionType;
  action_payload: object;        // JSONB -- the full typed action object
  resulting_state_snapshot: object | null; // JSONB -- compressed state (stored every N actions, null otherwise)
  player_id: string;             // FK -> users.id, the player who performed the action
  timestamp: string;             // wall-clock ISO 8601
  created_at: string;
}

type GameActionType =
  | 'PLAY_CARDS'
  | 'PLAY_BLIND'
  | 'PICK_UP_PILE'
  | 'DECLARE_DIRECTION'
  | 'TIMEOUT_FORFEIT'
  | 'CANCEL_GAME';

// Unique constraint: (game_id, index) -- no duplicate sequence numbers within a game
// Index: (game_id, index ASC) -- for ordered retrieval during replay
```

#### Leaderboard Module Tables

```typescript
// ratings -- ELO-style rating per player. One row per player.
// Created when a player completes their first rated game.
interface RatingsRow {
  id: string;                    // UUIDv4, primary key
  user_id: string;               // FK -> users.id, unique
  rating: number;                // current ELO rating, default 1200
  peak_rating: number;           // highest rating ever achieved
  games_played: number;          // total completed (non-cancelled) games
  games_won: number;
  games_lost: number;
  win_streak: number;            // current consecutive wins
  best_win_streak: number;       // highest consecutive wins ever
  last_game_at: string | null;   // ISO 8601, when last rated game ended
  created_at: string;
  updated_at: string;
}

// match_results -- One row per player per completed game.
// Denormalized for efficient leaderboard queries.
interface MatchResultsRow {
  id: string;                    // UUIDv4, primary key
  game_id: string;               // FK -> games.id
  user_id: string;               // FK -> users.id
  result: MatchResult;
  rating_before: number;         // player's rating before this game
  rating_after: number;          // player's rating after this game
  rating_change: number;         // delta (positive or negative)
  placement: number;             // finishing position (1 = winner)
  opponents: string[];           // array of opponent user IDs
  game_duration_seconds: number;
  played_at: string;             // when the game ended
  created_at: string;
}

type MatchResult = 'win' | 'loss';

// Unique constraint: (game_id, user_id) -- one result per player per game
// Index: (user_id, played_at DESC) -- for player match history
// Index: (played_at DESC) -- for recent matches feed
```

### 2.2 PostgreSQL Index Strategy

```sql
-- Auth module
CREATE UNIQUE INDEX idx_users_email ON users (email);
CREATE UNIQUE INDEX idx_users_username ON users (username);
CREATE UNIQUE INDEX idx_credentials_user_id ON credentials (user_id);
CREATE INDEX idx_oauth_providers_user_id ON oauth_providers (user_id);
CREATE UNIQUE INDEX idx_oauth_provider_identity ON oauth_providers (provider, provider_user_id);

-- Lobby module
CREATE INDEX idx_rooms_host ON rooms (host_user_id);
CREATE INDEX idx_rooms_created ON rooms (created_at DESC);

-- Game Engine module
CREATE INDEX idx_games_room ON games (room_id);
CREATE INDEX idx_games_winner ON games (winner_user_id) WHERE winner_user_id IS NOT NULL;
CREATE INDEX idx_games_ended ON games (ended_at DESC);
CREATE UNIQUE INDEX idx_game_actions_sequence ON game_actions (game_id, index);
CREATE INDEX idx_game_actions_game ON game_actions (game_id);

-- Leaderboard module
CREATE UNIQUE INDEX idx_ratings_user ON ratings (user_id);
CREATE INDEX idx_ratings_ranking ON ratings (rating DESC);
CREATE UNIQUE INDEX idx_match_results_game_user ON match_results (game_id, user_id);
CREATE INDEX idx_match_results_user_history ON match_results (user_id, played_at DESC);
CREATE INDEX idx_match_results_recent ON match_results (played_at DESC);
```

### 2.3 Redis Key Structure and TTL Strategy

All Redis keys follow the pattern `{module}:{entity}:{identifier}` for clear ownership and debuggability. TTLs are set on all ephemeral keys to prevent unbounded memory growth.

```typescript
// Complete Redis key catalog with TTL policy

interface RedisKeyMap {
  // --- Auth Module ---

  // Active user session. Stores session metadata for forced logout and ban checks.
  // Key: session:{userId}
  // Value: JSON { sessionId, createdAt, lastActiveAt, ipAddress, userAgent }
  // TTL: 24 hours (rolling, refreshed on activity)
  'session:{userId}': SessionData;

  // Refresh token mapping. Maps hashed refresh token to userId for lookup.
  // Key: refresh:{tokenHash}
  // Value: userId
  // TTL: 7 days (matches refresh token expiry)
  'refresh:{tokenHash}': string;

  // Login rate limit counter. Prevents brute force.
  // Key: auth:ratelimit:{ip}
  // Value: number (attempt count)
  // TTL: 15 minutes (sliding window)
  'auth:ratelimit:{ip}': number;

  // --- Lobby Module ---

  // Active room state. Full room data during lobby phase.
  // Key: room:{roomId}
  // Value: JSON RoomState object
  // TTL: 30 minutes (reset on any activity; expired rooms are cleaned up)
  'room:{roomId}': RoomState;

  // Public room listing. Sorted set for room discovery.
  // Key: room:public_list
  // Value: Sorted set, score = created_at timestamp, member = roomId
  // TTL: None (members removed individually when rooms close or expire)
  'room:public_list': SortedSet;

  // Room code lookup. Maps invite codes to room IDs.
  // Key: room:code:{roomCode}
  // Value: roomId
  // TTL: 30 minutes (matches room TTL)
  'room:code:{roomCode}': string;

  // --- Game Engine Module ---

  // Active game state. The authoritative current state during gameplay.
  // Key: game:{gameId}:state
  // Value: JSON GameState object (serialized)
  // TTL: 2 hours (safety net; games should end or cancel before this)
  'game:{gameId}:state': GameState;

  // Game state snapshot. Periodic checkpoint for crash recovery.
  // Key: game:{gameId}:snapshot
  // Value: JSON { state, actionIndex, timestamp }
  // TTL: 2 hours (matches game state TTL)
  'game:{gameId}:snapshot': GameSnapshot;

  // Game action buffer. Append-only list of actions for the current game.
  // Flushed to PostgreSQL on game end.
  // Key: game:{gameId}:actions
  // Value: List of JSON action objects
  // TTL: 2 hours (matches game state TTL)
  'game:{gameId}:actions': GameAction[];

  // Turn timer. Used by Game Clock to track turn deadlines.
  // Key: game:{gameId}:turn_timer
  // Value: JSON { playerId, expiresAt }
  // TTL: Matches configured turn timer + 5 second buffer
  'game:{gameId}:turn_timer': TurnTimer;

  // --- Realtime Module ---

  // WebSocket room pub/sub channel. Used by Socket.IO Redis adapter.
  // Key: ws:room:{roomId}
  // Value: Pub/sub channel (not a stored key)
  // TTL: N/A (pub/sub channels are transient)
  'ws:room:{roomId}': PubSubChannel;

  // Player connection tracking. Maps userId to their connected server instance.
  // Key: ws:player:{userId}
  // Value: JSON { socketId, serverId, roomId, connectedAt }
  // TTL: 5 minutes (refreshed by heartbeat; absence triggers disconnect logic)
  'ws:player:{userId}': PlayerConnection;

  // --- Leaderboard Module ---

  // Cached top 100 leaderboard. Avoids expensive rating queries.
  // Key: leaderboard:top100
  // Value: JSON array of { userId, username, displayName, rating, gamesPlayed }
  // TTL: 60 seconds (short cache, frequently changing)
  'leaderboard:top100': LeaderboardEntry[];

  // Player rank cache. Individual player's current rank position.
  // Key: leaderboard:rank:{userId}
  // Value: number (1-indexed rank)
  // TTL: 60 seconds (matches top100 cache)
  'leaderboard:rank:{userId}': number;
}
```

### 2.4 Redis Value Types

```typescript
interface SessionData {
  sessionId: string;
  createdAt: string;             // ISO 8601
  lastActiveAt: string;          // ISO 8601
  ipAddress: string;
  userAgent: string;
}

interface RoomState {
  id: string;
  hostUserId: string;
  roomCode: string;
  visibility: RoomVisibility;
  maxPlayers: number;            // 2-5
  turnTimerSeconds: number;
  disconnectGraceSeconds: number;
  players: RoomPlayer[];
  status: RoomStatus;
  createdAt: string;
  lastActivityAt: string;
}

interface RoomPlayer {
  userId: string;
  username: string;
  displayName: string;
  isReady: boolean;
  joinedAt: string;
}

type RoomStatus = 'waiting' | 'ready' | 'in_game' | 'expired';

interface GameSnapshot {
  state: object;                 // serialized GameState
  actionIndex: number;           // last action index included in snapshot
  timestamp: string;             // ISO 8601
}

interface TurnTimer {
  playerId: string;
  expiresAt: string;             // ISO 8601
  gameId: string;
}

interface PlayerConnection {
  socketId: string;
  serverId: string;              // identifies which server instance holds the connection
  roomId: string | null;
  connectedAt: string;
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  rating: number;
  gamesPlayed: number;
  rank: number;
}
```

---

## 3. Data Ownership Rules

Each module owns specific storage and has defined access patterns. These rules enforce module boundaries at the data level.

| Module | Owns (PostgreSQL) | Owns (Redis) | Read Access | Write Access |
|---|---|---|---|---|
| **Auth** | `users`, `credentials`, `oauth_providers` | `session:*`, `refresh:*`, `auth:ratelimit:*` | Own tables/keys only | Own tables/keys only |
| **Lobby** | `rooms` | `room:*`, `room:code:*`, `room:public_list` | `users` (via Auth interface for display names) | Own tables/keys only |
| **Game Engine** | `games`, `game_actions` | `game:*` | `rooms` (via Lobby interface for config) | Own tables/keys only |
| **Realtime** | None | `ws:*` | `game:*:state` (via Game Engine interface) | Own keys only |
| **Leaderboard** | `ratings`, `match_results` | `leaderboard:*` | `games` (via Game Engine interface for results) | Own tables/keys only |

**Cross-module access is always through typed interfaces, never direct queries.**

```typescript
// Example: Lobby needs user display names from Auth
// WRONG: Lobby queries users table directly
// RIGHT: Lobby calls Auth module's interface

interface AuthModuleInterface {
  getUserById(userId: string): Promise<PublicUserProfile | null>;
  getUsersByIds(userIds: string[]): Promise<PublicUserProfile[]>;
  validateAccessToken(token: string): Promise<TokenPayload | null>;
}

interface PublicUserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
}

interface TokenPayload {
  userId: string;
  username: string;
  iat: number;
  exp: number;
}
```

---

## 4. Hot Path vs Warm Path Storage Split

### 4.1 Decision Matrix

```
Is the data needed in < 1ms? ──YES──> Redis (hot path)
        │
        NO
        │
Is the data ephemeral (dies with the session/game)? ──YES──> Redis
        │
        NO
        │
Is losing this data unrecoverable? ──YES──> PostgreSQL (warm path)
        │
        NO
        │
Is the data queried with complex filters/joins? ──YES──> PostgreSQL
        │
        NO
        │
Default: PostgreSQL
```

### 4.2 Data Lifecycle Flows

```
ROOM LIFECYCLE:
  Room created ─> Redis (room:{roomId})
  Room active   ─> Redis (TTL refreshed on activity)
  Game starts   ─> Redis state persists + PostgreSQL rooms row archived
  Room expires  ─> Redis key TTL evicts automatically

GAME LIFECYCLE:
  Game created  ─> In-memory on server process
  During game   ─> In-memory (primary) + Redis snapshot (every 10 actions or 30 seconds)
  Action logged ─> Redis list (game:{gameId}:actions)
  Game ends     ─> Flush to PostgreSQL (games + game_actions rows)
                ─> Delete Redis keys (game:{gameId}:*)
  Game crash    ─> Recover from Redis snapshot + action buffer
                ─> Resume from last consistent state

SESSION LIFECYCLE:
  Login         ─> Redis (session:{userId}, refresh:{tokenHash})
  Activity      ─> Redis TTL refreshed
  Logout        ─> Redis keys deleted
  Token refresh ─> Old refresh key deleted, new one created
  Forced logout ─> Redis session key deleted (JWT still valid until 15min expiry)
```

---

## 5. Connection Pooling Strategy

### 5.1 PostgreSQL Connection Pool

```typescript
interface PostgresPoolConfig {
  // Pool sizing: based on formula (core_count * 2) + effective_spindle_count
  // For a single instance with 2 cores: (2 * 2) + 1 = 5 minimum
  min: 2;                        // minimum idle connections
  max: 10;                       // maximum connections
  acquireTimeoutMillis: 10000;   // wait 10s for a connection before failing
  idleTimeoutMillis: 30000;      // close idle connections after 30s
  connectionTimeoutMillis: 5000; // TCP connection timeout

  // Statement timeout: kill queries running longer than 30s
  statementTimeout: 30000;

  // Application name for pg_stat_activity visibility
  applicationName: 'sbobuz-server';
}
```

**Pool sizing rationale:**

| Scaling Phase | Instances | Pool per Instance | Total Connections | PostgreSQL max_connections |
|---|---|---|---|---|
| Phase 1 (0-500 users) | 1 | 10 | 10 | 20 (headroom for admin) |
| Phase 2 (500-5000 users) | 3 | 10 | 30 | 50 (headroom for admin + replicas) |
| Phase 3 (5000+ users) | N | 8 | N * 8 | Use PgBouncer at 100+ connections |

**Connection pool health check:** The pool runs a `SELECT 1` validation query every 30 seconds on idle connections. Failed connections are evicted and replaced.

### 5.2 Redis Connection Strategy

```typescript
interface RedisConnectionConfig {
  // Primary connection for read/write operations
  primary: {
    host: string;
    port: 6379;
    maxRetriesPerRequest: 3;
    retryDelayMs: 100;           // exponential backoff base
    connectTimeoutMs: 5000;
    commandTimeoutMs: 2000;      // individual command timeout
    lazyConnect: false;          // connect immediately on startup
    enableReadyCheck: true;
  };

  // Subscriber connection for pub/sub (dedicated, cannot share with commands)
  subscriber: {
    // Same connection config as primary
    // Separate connection required because SUBSCRIBE blocks the connection
  };

  // Connection count per instance:
  // 1 primary (commands)
  // 1 subscriber (pub/sub)
  // Socket.IO adapter uses 2 additional connections internally
  // Total: 4 Redis connections per server instance
}
```

---

## 6. Migration Strategy

### 6.1 Migration Tooling

Migrations use a file-based, sequential migration runner. Each migration is a numbered SQL file executed in order.

```
server/infra/database/migrations/
  001_create_users.sql
  002_create_credentials.sql
  003_create_oauth_providers.sql
  004_create_rooms.sql
  005_create_games.sql
  006_create_game_actions.sql
  007_create_ratings.sql
  008_create_match_results.sql
```

### 6.2 Migration Rules

1. **Migrations are append-only.** Never edit a migration that has been applied to any environment. Create a new migration to alter.
2. **Every migration must be reversible.** Each file contains both `up` and `down` SQL. The `down` must cleanly undo the `up`.
3. **No data migrations in schema files.** Data backfills are separate, numbered migration files with clear comments.
4. **Migrations run in a transaction.** If any statement fails, the entire migration rolls back.
5. **Migration state is tracked in a `schema_migrations` table.** Columns: `version` (integer), `name` (string), `applied_at` (timestamp).
6. **CI runs all migrations from scratch** on every build against a clean database to validate the full chain.

### 6.3 Migration Execution

```
Development:  Migrations run automatically on server startup (if MIGRATE_ON_STARTUP=true)
Staging:      Migrations run as part of the deployment pipeline, before the new version starts
Production:   Migrations run as a separate pipeline step with manual approval gate
              Application startup does NOT run migrations -- separation of concerns
```

### 6.4 Schema Versioning

```typescript
interface MigrationFile {
  version: number;               // sequential, no gaps
  name: string;                  // descriptive (e.g., "create_users")
  up: string;                    // SQL to apply
  down: string;                  // SQL to reverse
  checksumSha256: string;        // integrity check -- detect tampering
}
```

---

## 7. Backup and Recovery

### 7.1 PostgreSQL Backup Strategy

| Backup Type | Frequency | Retention | Method |
|---|---|---|---|
| **Continuous WAL archiving** | Continuous | 7 days | Managed service WAL streaming to object storage |
| **Automated daily snapshot** | Every 24 hours at 03:00 UTC | 30 days | pg_dump to object storage (compressed) |
| **Pre-deployment snapshot** | Before every production deploy | 7 days | pg_dump triggered by CI pipeline |

**Recovery targets:**
- **RPO (Recovery Point Objective):** Less than 1 minute (continuous WAL archiving)
- **RTO (Recovery Time Objective):** Less than 15 minutes (restore from snapshot + replay WAL)

### 7.2 Redis Persistence Configuration

```
# Redis is configured for ephemeral data. Persistence is a safety net, not a guarantee.
# RDB snapshots for crash recovery of active games:

save 900 1          # snapshot if 1 key changed in 15 minutes
save 300 10         # snapshot if 10 keys changed in 5 minutes
save 60 1000        # snapshot if 1000 keys changed in 1 minute

# AOF disabled -- the data can be rebuilt from PostgreSQL + in-memory state.
# If Redis dies entirely, active games enter a recovery flow:
#   1. Games with a recent snapshot resume from snapshot + buffered actions.
#   2. Games without a snapshot are cancelled (players notified, no rating impact).
```

### 7.3 Recovery Procedures

```
SCENARIO: PostgreSQL failure (managed service auto-failover)
  1. Managed service promotes read replica to primary (automatic, < 30s)
  2. Application reconnects via pool retry logic
  3. Brief period of failed writes (< 30s), reads served by replica
  4. No data loss (synchronous replication)

SCENARIO: Redis failure (full data loss)
  1. Application detects Redis unavailability via health check
  2. Health endpoint /health/ready returns 503, load balancer stops traffic
  3. Active game sessions enter "reconnecting" state on all clients
  4. On Redis recovery:
     a. Sessions: Users must re-authenticate (redirect to login)
     b. Rooms: Lost. Users create or join new rooms.
     c. Active games: Recover from last Redis RDB snapshot if available.
        If no snapshot, games are cancelled.
  5. Leaderboard cache rebuilds automatically on first request

SCENARIO: Application crash mid-game
  1. Game state was last snapshotted to Redis (every 10 actions or 30 seconds)
  2. On restart, server checks for orphaned game keys in Redis
  3. Games with snapshots: resume from snapshot, replay buffered actions
  4. Games without snapshots: cancel game, notify players via WebSocket
  5. Cancelled games do not affect ratings
```

---

## 8. Edge Cases and Test Scenarios

| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Two users register with the same email simultaneously | Database unique constraint prevents duplicate. Second request receives a 409 Conflict error. First-write-wins. |
| 2 | Game ends but PostgreSQL is temporarily unavailable | Game result is buffered in Redis with a `pending_persist` flag. A background retry job attempts persistence every 10 seconds for up to 5 minutes. If still failing, the result is written to a dead letter queue (Redis list) for manual recovery. |
| 3 | Redis TTL expires on an active room while players are still connected | Room middleware detects the missing key on the next interaction. Players receive a "room expired" event. They must create a new room. TTL is set generously (30 minutes) and refreshed on every activity to prevent this during normal use. |
| 4 | Server crashes mid-game, restarts, and finds orphaned Redis game keys | Server startup scans for `game:*:state` keys with no corresponding in-memory game. Each orphaned game is recovered from its snapshot or cancelled. |
| 5 | Player disconnects, reconnects, but their session key expired in Redis | Reconnection fails at the auth middleware. Player must re-authenticate with their refresh token (if still valid in the cookie) or log in again. The game engine handles the reconnection separately via room/game-level state. |
| 6 | Leaderboard query runs during heavy game-end writes | Read queries to the `ratings` table do not block. Game-end writes update the `ratings` row in a single `UPDATE ... SET rating = $1, games_played = games_played + 1` atomic operation. The leaderboard cache (Redis) absorbs read load. |
| 7 | game_actions table grows very large for a single game (300+ actions) | State snapshots are stored every 50 actions in the `resulting_state_snapshot` column. Replay can start from the nearest snapshot instead of replaying all 300+ actions from the beginning. |
| 8 | Connection pool exhaustion under load | `acquireTimeoutMillis` causes requests to fail with a 503 after 10 seconds of waiting. Metric `db_pool_active_connections` triggers an alert at 80% utilization. Horizontal scaling adds more instances, each with their own pool. |
| 9 | Redis memory reaches maximum configured limit | Redis is configured with `maxmemory-policy allkeys-lru`. Least recently used keys are evicted. Active game keys have recent access patterns and survive. Stale leaderboard cache entries are evicted first. Alert fires at 80% memory usage. |
| 10 | Migration fails midway in production | Transaction wraps the migration. On failure, the entire migration rolls back. The `schema_migrations` table is not updated. The deployment is halted. Operator must investigate and fix before retrying. |

---

## 9. Integration Points

### 9.1 Inbound -- What Calls the Data Layer

```
Auth Module
  -> PostgreSQL: users, credentials (CRUD)
  -> Redis: session, refresh token (read/write/delete)

Lobby Module
  -> PostgreSQL: rooms (write on game start)
  -> Redis: room state (CRUD), public room list (read/write)

Game Engine Module
  -> Redis: game state, snapshots, action buffer (read/write during game)
  -> PostgreSQL: games, game_actions (write on game end)

Realtime Module
  -> Redis: pub/sub channels (subscribe/publish), player connections (read/write)

Leaderboard Module
  -> PostgreSQL: ratings, match_results (read/write on game end)
  -> Redis: leaderboard cache (read/write)
```

### 9.2 Outbound -- What the Data Layer Produces

The Data Layer itself is passive -- it does not initiate outbound calls. Modules query it and receive results. The exception is Redis pub/sub, where subscriptions deliver messages asynchronously to the Realtime module.

### 9.3 Data Flow on Game Completion

```
Game Engine detects win condition
  -> Write: games row to PostgreSQL
  -> Write: game_actions rows to PostgreSQL (batch insert from Redis buffer)
  -> Delete: game:{gameId}:state from Redis
  -> Delete: game:{gameId}:snapshot from Redis
  -> Delete: game:{gameId}:actions from Redis
  -> Delete: game:{gameId}:turn_timer from Redis
  -> Notify: Leaderboard module (via typed interface, not pub/sub)
       -> Write: match_results rows to PostgreSQL
       -> Update: ratings rows in PostgreSQL
       -> Invalidate: leaderboard:top100 in Redis
```

---

## 10. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Shared database vs separate databases per module? | Shared physical database with logical schema separation. Each module owns its tables. No cross-module JOINs. | Solo developer. One database to manage. Module boundaries enforced by code convention, not network isolation. Clean extraction path: move tables to a new database when extracting a service. |
| 2 | Store full game state in every game_actions row? | Store state snapshots every 50 actions, not every action. | Full state on every row would balloon storage. Snapshots every 50 actions allows replay from the nearest checkpoint. Trade-off: replay latency vs storage. 50-action replay is fast enough. |
| 3 | Redis persistence mode? | RDB snapshots only, no AOF. | Redis data is ephemeral and recoverable. RDB gives crash recovery for active games without the write amplification of AOF. If Redis dies completely, games are cancelled (acceptable). |
| 4 | ORM vs raw SQL? | Query builder (e.g., Kysely or Drizzle) with typed results. No full ORM. | Full ORMs (TypeORM, Prisma) add abstraction layers that obscure query behavior. A typed query builder provides type safety without hiding the SQL. Critical for debugging and performance tuning. |
| 5 | UUID format for primary keys? | UUIDv4, stored as `uuid` type in PostgreSQL. | Native UUID type is indexed efficiently. No sequential IDs that leak information about entity count. UUIDv4 has sufficient uniqueness for this scale. |
| 6 | How to handle game_actions for replay at scale? | Batch insert all actions on game end, not one-by-one during the game. During the game, actions buffer in Redis. | Avoids PostgreSQL write pressure during gameplay. Games are ephemeral; if we lose them before completion, they are cancelled. The durable write happens once, in bulk, when the game ends. |
| 7 | Password hashing algorithm? | bcrypt with cost factor 12. | Industry standard. Cost factor 12 balances security with login latency (approximately 250ms hash time). Argon2 is theoretically better but bcrypt is battle-tested and supported everywhere. |
| 8 | Store refresh token in PostgreSQL or Redis? | Both. Hash stored in PostgreSQL credentials table (for revocation check on refresh). Key-value mapping in Redis (for fast lookup). | PostgreSQL provides the durable revocation record. Redis provides the fast lookup path during token refresh. If Redis is down, the refresh flow falls back to a PostgreSQL query. |
| 9 | Connection pooling library? | Use the pg library's built-in Pool. Upgrade to PgBouncer at Phase 3 if connection count exceeds 100 across all instances. | Built-in pool is sufficient for Phase 1-2 scale. PgBouncer adds operational complexity that is not justified until connection count demands it. |
| 10 | Redis key expiration strategy? | Explicit TTL on every ephemeral key. No keys without TTL except sorted sets (members removed individually). | Prevents unbounded memory growth. TTLs are the primary garbage collection mechanism for Redis. Every key type documents its TTL in the key catalog above. |

---

## 11. Implications for Architecture

1. **Typed query builder decision** means the `server/infra/database/` directory will contain a query builder setup module, typed table definitions, and a migration runner -- but no ORM entity classes or repository patterns.

2. **Batch action persistence** means the Game Engine module must maintain an in-memory action buffer during gameplay. On game end, it serializes the buffer and performs a single batch insert. The Realtime module must not assume actions are in PostgreSQL until after the game ends.

3. **Redis key ownership** means each module should have its own Redis client wrapper that namespaces all keys automatically. The `server/infra/redis/` module provides a base client; each module wraps it with its own key prefix logic.

4. **Shared physical database** means database migrations must be ordered to respect foreign key dependencies across modules. The migration runner must handle the full chain, not per-module migration sets.

5. **No cross-module JOINs** means the Leaderboard module cannot directly JOIN `match_results` with `users` to get display names. It must call the Auth module interface to resolve user IDs to display names. This adds latency but preserves module independence.

6. **Game state snapshot frequency** (every 50 actions or 30 seconds) means the maximum data loss on a crash is 50 actions. For a typical Sbobuz game, this represents roughly 2-5 minutes of play. The risk is accepted: cancelled games do not affect ratings.
