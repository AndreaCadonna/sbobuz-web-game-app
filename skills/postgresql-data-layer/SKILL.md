---
name: postgresql-data-layer
description: PostgreSQL database design and operations patterns for Node.js/TypeScript applications. Covers schema design, migrations, connection pooling, query patterns, indexing strategy, and data integrity. Use this skill whenever designing database schemas, writing SQL migrations, creating database queries, setting up connection pools, or when the user asks about data modeling, table relationships, indexing, or PostgreSQL-specific features. Also activate when planning a dual-store strategy (PostgreSQL + Redis), implementing transactional logic, or optimizing query performance.
origin: ECC
---

# PostgreSQL Data Layer

Production patterns for designing and operating PostgreSQL databases in Node.js/TypeScript backends. These conventions prioritize data integrity, query performance, and safe schema evolution.

## When to Activate

- Designing database schemas or data models
- Writing SQL migrations
- Creating or optimizing queries
- Setting up connection pooling
- Planning indexing strategy
- Implementing transactional logic
- Deciding what belongs in PostgreSQL vs Redis

## Storage Decision Framework

Not all data belongs in PostgreSQL. Use the right store for the right access pattern.

| Data Characteristic | PostgreSQL | Redis |
|---|---|---|
| Must survive restart | Yes | No |
| ACID transactions needed | Yes | No |
| Complex queries (joins, aggregates) | Yes | No |
| Sub-millisecond reads | No | Yes |
| Ephemeral / session-scoped | No | Yes |
| Pub/sub messaging | No | Yes |

**PostgreSQL owns:** Users, credentials, game history, action logs, leaderboards, room metadata (post-game), any data that must survive a Redis flush.

**Redis owns:** Active game state, room state during gameplay, sessions, rate limit counters, pub/sub channels. See the `redis-patterns` skill for Redis-specific guidance.

## Schema Design

### Naming Conventions

```sql
-- Tables: plural, snake_case
CREATE TABLE users (...);
CREATE TABLE game_actions (...);

-- Columns: singular, snake_case
user_id, created_at, display_name

-- Primary keys: always 'id'
id UUID PRIMARY KEY DEFAULT gen_random_uuid()

-- Foreign keys: referenced_table_singular_id
user_id UUID REFERENCES users(id)
game_id UUID REFERENCES games(id)

-- Indexes: idx_table_column(s)
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_game_actions_game_id_seq ON game_actions(game_id, sequence_number);

-- Constraints: chk_table_description, uq_table_column
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT chk_users_username_length CHECK (length(username) >= 3);
```

### Core Tables Pattern

```sql
-- Every table gets these columns
CREATE TABLE example (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at with a trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_example_updated_at
  BEFORE UPDATE ON example
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  username VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_username UNIQUE (username),
  CONSTRAINT chk_users_status CHECK (status IN ('active', 'suspended', 'banned'))
);
```

### Game History Tables

```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  player_ids UUID[] NOT NULL,
  winner_id UUID REFERENCES users(id),
  seed BIGINT NOT NULL,           -- PRNG seed for deterministic replay
  config JSONB NOT NULL,          -- room settings snapshot
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  final_state JSONB,              -- complete end state for stats

  CONSTRAINT chk_games_status CHECK (status IN ('in_progress', 'finished', 'cancelled'))
);

CREATE TABLE game_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id),
  sequence_number INTEGER NOT NULL,
  player_id UUID REFERENCES users(id),   -- null for system actions
  action_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_game_actions_sequence UNIQUE (game_id, sequence_number)
);

-- Index for replay queries (fetch all actions for a game in order)
CREATE INDEX idx_game_actions_game_seq
  ON game_actions(game_id, sequence_number);
```

## Migrations

### Rules

1. **One migration per change** — don't batch unrelated schema changes
2. **Forward-only in production** — never edit a migration that has already run
3. **Backward-compatible** — migrations must work with the old application code during rolling deploys
4. **Idempotent when possible** — use `IF NOT EXISTS`, `IF EXISTS`
5. **No data in schema migrations** — seed data belongs in separate scripts

### Migration File Pattern

```
migrations/
├── 001_create_users.sql
├── 002_create_games.sql
├── 003_create_game_actions.sql
├── 004_add_users_status_column.sql
└── 005_create_leaderboard_view.sql
```

### Backward-Compatible Changes

When deploying with zero downtime (rolling updates), old code and new code run simultaneously. Migrations must not break old code.

```sql
-- SAFE: Adding a column with a default
ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL;

-- SAFE: Adding a new table
CREATE TABLE IF NOT EXISTS ratings (...);

-- SAFE: Adding an index concurrently (doesn't lock the table)
CREATE INDEX CONCURRENTLY idx_users_status ON users(status);

-- DANGEROUS: Renaming a column (old code still references the old name)
-- Instead: add new column, backfill, update code, then drop old column

-- DANGEROUS: Dropping a column (old code still references it)
-- Instead: stop reading the column in code first, deploy, then drop in next migration

-- DANGEROUS: Changing a column type
-- Instead: add new column with new type, backfill, update code, drop old column
```

## Connection Pooling

Always use a connection pool. Opening a new PostgreSQL connection takes 50-100ms — pooling amortizes this cost across requests.

```typescript
import { Pool } from 'pg';
import { getConfig } from '../config';

const config = getConfig();

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  min: config.DB_POOL_MIN,       // 2 — keep warm connections ready
  max: config.DB_POOL_MAX,       // 10 — never exceed this
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,  // 30s — kill runaway queries
});

// Monitor pool health
pool.on('error', (err) => {
  logger.error({ err }, 'pg_pool_error');
});
```

### Pool Sizing Rule

`max` connections = number of Node.js instances x pool max per instance. This total must stay below PostgreSQL's `max_connections` (default 100). Leave headroom for admin connections.

```
3 instances x 10 pool max = 30 connections used
PostgreSQL max_connections = 100
Headroom = 70 connections (for pgAdmin, migrations, monitoring)
```

## Query Patterns

### Parameterized Queries

Always use parameterized queries. Never interpolate user input into SQL strings — this prevents SQL injection.

```typescript
// GOOD — parameterized
const result = await pool.query(
  'SELECT id, email, username FROM users WHERE email = $1',
  [email],
);

// NEVER — string interpolation
const result = await pool.query(`SELECT * FROM users WHERE email = '${email}'`);
```

### Repository Pattern

Encapsulate database access in repository modules. Business logic calls repository methods — it never constructs SQL directly.

```typescript
// modules/auth/auth.repository.ts
import { pool } from '../../shared/db';
import type { User } from './auth.types';

export const authRepository = {
  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await pool.query<User>(
      'SELECT id, email, username, password_hash, status FROM users WHERE email = $1',
      [email],
    );
    return rows[0] ?? null;
  },

  async create(email: string, username: string, passwordHash: string): Promise<User> {
    const { rows } = await pool.query<User>(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, status, created_at`,
      [email, username, passwordHash],
    );
    return rows[0];
  },
};
```

### Transactions

Use transactions when multiple writes must succeed or fail together.

```typescript
export async function finishGame(gameId: string, winnerId: string, finalState: object) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE games SET status = 'finished', winner_id = $1, finished_at = now(), final_state = $2
       WHERE id = $3`,
      [winnerId, JSON.stringify(finalState), gameId],
    );

    await client.query(
      `INSERT INTO match_results (game_id, user_id, result, rating_change)
       SELECT $1, unnest($2::uuid[]), unnest($3::varchar[]), unnest($4::integer[])`,
      [gameId, playerIds, results, ratingChanges],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

## Indexing Strategy

### When to Add an Index

- Columns in `WHERE` clauses that filter large tables
- Columns in `JOIN` conditions
- Columns in `ORDER BY` on paginated queries
- Foreign keys (PostgreSQL does NOT auto-index these)

### When NOT to Add an Index

- Small tables (< 1000 rows) — sequential scan is faster
- Columns with very low cardinality (boolean, status with 2-3 values) unless combined with other columns
- Write-heavy tables where index maintenance cost exceeds read benefit

```sql
-- Foreign keys — always index
CREATE INDEX idx_game_actions_game_id ON game_actions(game_id);
CREATE INDEX idx_games_winner_id ON games(winner_id);

-- Composite index for common query patterns
-- "Get user's recent games, newest first"
CREATE INDEX idx_games_player_started
  ON games USING GIN (player_ids)
  -- GIN for array containment queries: WHERE $1 = ANY(player_ids)

-- Partial index — only index rows that match a condition
CREATE INDEX idx_games_in_progress
  ON games(started_at)
  WHERE status = 'in_progress';
```

## JSONB Usage

Use JSONB for semi-structured data that doesn't need relational queries. Keep relational data in normal columns — JSONB is for flexible payloads, not a replacement for proper schema design.

```sql
-- GOOD — config varies per game, rarely queried by individual fields
config JSONB NOT NULL

-- GOOD — action payload structure varies by action_type
payload JSONB NOT NULL DEFAULT '{}'

-- AVOID — putting structured, queryable data in JSONB
-- If you regularly query user.settings.theme, make it a column
```

## Checklist

Before shipping database changes:

- [ ] Migration is backward-compatible with currently deployed code
- [ ] Migration uses `IF NOT EXISTS` / `IF EXISTS` where appropriate
- [ ] All queries use parameterized inputs — no string interpolation
- [ ] Foreign keys have indexes
- [ ] Connection pool sized appropriately for instance count
- [ ] Transactions used for multi-statement writes
- [ ] Large table indexes created with `CONCURRENTLY`
- [ ] JSONB used only for semi-structured data, not as a schema bypass
- [ ] `statement_timeout` configured to prevent runaway queries
