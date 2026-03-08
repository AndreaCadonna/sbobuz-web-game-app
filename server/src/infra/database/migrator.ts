/**
 * File-based sequential database migration runner.
 *
 * Migrations are SQL files in the migrations/ directory, numbered
 * sequentially (001_, 002_, etc.). Each file contains UP and DOWN
 * sections separated by `-- DOWN`. Migrations run inside transactions.
 *
 * @see docs/specs/data-layer.md Section 6
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

import { createModuleLogger } from '../../shared/logger.js';

const logger = createModuleLogger('infra');

/**
 * A record of an applied migration.
 */
export interface MigrationRecord {
  readonly version: number;
  readonly name: string;
  readonly applied_at: string;
}

/**
 * Status report from getMigrationStatus.
 */
export interface MigrationStatus {
  readonly applied: readonly MigrationRecord[];
  readonly pending: readonly ParsedMigration[];
  readonly current_version: number;
}

/**
 * A parsed migration file with UP and DOWN SQL.
 */
interface ParsedMigration {
  readonly version: number;
  readonly name: string;
  readonly up: string;
  readonly down: string;
  readonly filename: string;
}

/**
 * Parse a migration SQL file into UP and DOWN sections.
 *
 * The file must contain a `-- DOWN` separator line. Everything before
 * it is UP SQL, everything after is DOWN SQL.
 */
function parseMigrationFile(content: string, filename: string): { up: string; down: string } {
  const separator = '-- DOWN';
  const separatorIndex = content.indexOf(separator);

  if (separatorIndex === -1) {
    throw new Error(`Migration file ${filename} is missing the '-- DOWN' separator`);
  }

  const up = content.slice(0, separatorIndex).trim();
  const down = content.slice(separatorIndex + separator.length).trim();

  if (!up) {
    throw new Error(`Migration file ${filename} has empty UP section`);
  }

  return { up, down };
}

/**
 * Extract version number and name from a migration filename.
 *
 * Expected format: `NNN_name.sql` (e.g., `001_create_users.sql`).
 */
function parseFilename(filename: string): { version: number; name: string } {
  const match = /^(\d+)_(.+)\.sql$/.exec(filename);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid migration filename: ${filename}. Expected format: NNN_name.sql`);
  }

  return {
    version: parseInt(match[1], 10),
    name: match[2],
  };
}

/**
 * Get the path to the migrations directory.
 */
function getMigrationsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, 'migrations');
}

/**
 * Load and parse all migration files from the migrations directory.
 *
 * Files are sorted by version number. Gaps in the sequence cause an error.
 */
export function loadMigrations(migrationsDir?: string | undefined): readonly ParsedMigration[] {
  const dir = migrationsDir ?? getMigrationsDir();

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const migrations: ParsedMigration[] = [];

  for (const file of files) {
    const { version, name } = parseFilename(file);
    const content = readFileSync(join(dir, file), 'utf-8');
    const { up, down } = parseMigrationFile(content, file);

    migrations.push({ version, name, up, down, filename: file });
  }

  // Validate sequential ordering (no gaps)
  for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i];
    if (migration && migration.version !== i + 1) {
      throw new Error(
        `Migration sequence gap: expected version ${i + 1}, got ${migration.version} (${migration.filename})`,
      );
    }
  }

  return migrations;
}

/**
 * Ensure the schema_migrations tracking table exists.
 */
async function ensureMigrationsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Get the list of already-applied migrations from the database.
 */
async function getAppliedMigrations(pool: pg.Pool): Promise<readonly MigrationRecord[]> {
  const result = await pool.query<MigrationRecord>(
    'SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC',
  );
  return result.rows;
}

/**
 * Run all pending migrations in order.
 *
 * Each migration runs inside its own transaction. If any statement
 * fails, the transaction rolls back and the error propagates.
 *
 * @param pool - The PostgreSQL connection pool.
 * @param migrationsDir - Optional path to migrations directory (for testing).
 * @returns The number of migrations applied.
 */
export async function runMigrations(
  pool: pg.Pool,
  migrationsDir?: string | undefined,
): Promise<number> {
  await ensureMigrationsTable(pool);

  const allMigrations = loadMigrations(migrationsDir);
  const applied = await getAppliedMigrations(pool);
  const appliedVersions = new Set(applied.map((m) => m.version));

  const pending = allMigrations.filter((m) => !appliedVersions.has(m.version));

  if (pending.length === 0) {
    logger.info('No pending migrations');
    return 0;
  }

  logger.info({ count: pending.length }, 'Running pending migrations');

  let appliedCount = 0;

  for (const migration of pending) {
    const client = await pool.connect();
    try {
      logger.info(
        { version: migration.version, name: migration.name },
        'Applying migration',
      );

      await client.query('BEGIN');
      await client.query(migration.up);
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name],
      );
      await client.query('COMMIT');

      appliedCount++;
      logger.info(
        { version: migration.version, name: migration.name },
        'Migration applied successfully',
      );
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(
        { err, version: migration.version, name: migration.name },
        'Migration failed, rolled back',
      );
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info({ appliedCount }, 'All migrations completed');
  return appliedCount;
}

/**
 * Roll back a specific migration version.
 *
 * Runs the DOWN SQL inside a transaction and removes the version
 * from the schema_migrations table.
 *
 * @param pool - The PostgreSQL connection pool.
 * @param version - The migration version number to roll back.
 * @param migrationsDir - Optional path to migrations directory (for testing).
 */
export async function rollbackMigration(
  pool: pg.Pool,
  version: number,
  migrationsDir?: string | undefined,
): Promise<void> {
  await ensureMigrationsTable(pool);

  const allMigrations = loadMigrations(migrationsDir);
  const migration = allMigrations.find((m) => m.version === version);

  if (!migration) {
    throw new Error(`Migration version ${version} not found in migration files`);
  }

  const applied = await getAppliedMigrations(pool);
  const isApplied = applied.some((m) => m.version === version);

  if (!isApplied) {
    throw new Error(`Migration version ${version} has not been applied`);
  }

  const client = await pool.connect();
  try {
    logger.info(
      { version: migration.version, name: migration.name },
      'Rolling back migration',
    );

    await client.query('BEGIN');
    await client.query(migration.down);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
    await client.query('COMMIT');

    logger.info(
      { version: migration.version, name: migration.name },
      'Migration rolled back successfully',
    );
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(
      { err, version: migration.version, name: migration.name },
      'Rollback failed',
    );
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get the current migration status.
 *
 * @param pool - The PostgreSQL connection pool.
 * @param migrationsDir - Optional path to migrations directory (for testing).
 * @returns Applied migrations, pending migrations, and current version.
 */
export async function getMigrationStatus(
  pool: pg.Pool,
  migrationsDir?: string | undefined,
): Promise<MigrationStatus> {
  await ensureMigrationsTable(pool);

  const allMigrations = loadMigrations(migrationsDir);
  const applied = await getAppliedMigrations(pool);
  const appliedVersions = new Set(applied.map((m) => m.version));

  const pending = allMigrations.filter((m) => !appliedVersions.has(m.version));
  const currentVersion = applied.length > 0
    ? Math.max(...applied.map((m) => m.version))
    : 0;

  return {
    applied,
    pending,
    current_version: currentVersion,
  };
}
