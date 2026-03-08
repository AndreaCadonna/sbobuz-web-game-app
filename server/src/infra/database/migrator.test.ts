/**
 * Unit tests for the database migration runner.
 *
 * All tests mock pg to avoid requiring a real database.
 * Migration file I/O is tested against real temp files.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';

// --- Hoisted mocks ---

const { mockLogger } = vi.hoisted(() => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  return { mockLogger };
});

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: vi.fn(() => mockLogger),
}));

import { loadMigrations, runMigrations, rollbackMigration, getMigrationStatus } from './migrator.js';

/** Create a unique temp directory for each test. */
function createTestMigrationDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sbobuz-migrator-test-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf-8');
  }
  return dir;
}

/** Temp dirs to clean up after each test. */
const dirsToCleanup: string[] = [];

function trackDir(dir: string): string {
  dirsToCleanup.push(dir);
  return dir;
}

// --- Mock pg pool helpers ---
function createMockPool() {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };

  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(mockClient),
  };

  return { mockPool, mockClient };
}

describe('loadMigrations', () => {
  afterEach(() => {
    for (const d of dirsToCleanup) {
      rmSync(d, { recursive: true, force: true });
    }
    dirsToCleanup.length = 0;
  });

  it('loads and parses migration files in order', () => {
    const dir = trackDir(createTestMigrationDir({
      '001_create_users.sql': 'CREATE TABLE users (id INT);\n-- DOWN\nDROP TABLE users;',
      '002_create_posts.sql': 'CREATE TABLE posts (id INT);\n-- DOWN\nDROP TABLE posts;',
    }));

    const migrations = loadMigrations(dir);

    expect(migrations).toHaveLength(2);
    expect(migrations[0]?.version).toBe(1);
    expect(migrations[0]?.name).toBe('create_users');
    expect(migrations[0]?.up).toBe('CREATE TABLE users (id INT);');
    expect(migrations[0]?.down).toBe('DROP TABLE users;');
    expect(migrations[1]?.version).toBe(2);
    expect(migrations[1]?.name).toBe('create_posts');
  });

  it('throws if directory does not exist', () => {
    expect(() => loadMigrations('/nonexistent/path')).toThrow('Migrations directory not found');
  });

  it('throws if file has no DOWN separator', () => {
    const dir = trackDir(createTestMigrationDir({
      '001_bad.sql': 'CREATE TABLE users (id INT);',
    }));

    expect(() => loadMigrations(dir)).toThrow("missing the '-- DOWN' separator");
  });

  it('throws if file has empty UP section', () => {
    const dir = trackDir(createTestMigrationDir({
      '001_empty.sql': '-- DOWN\nDROP TABLE users;',
    }));

    expect(() => loadMigrations(dir)).toThrow('empty UP section');
  });

  it('throws if filename format is invalid', () => {
    const dir = trackDir(createTestMigrationDir({
      'bad_name.sql': 'CREATE TABLE x;\n-- DOWN\nDROP TABLE x;',
    }));

    expect(() => loadMigrations(dir)).toThrow('Invalid migration filename');
  });

  it('throws on sequence gaps', () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a;\n-- DOWN\nDROP TABLE a;',
      '003_third.sql': 'CREATE TABLE c;\n-- DOWN\nDROP TABLE c;',
    }));

    expect(() => loadMigrations(dir)).toThrow('Migration sequence gap');
  });

  it('returns empty array for empty directory', () => {
    const dir = trackDir(createTestMigrationDir({}));
    const migrations = loadMigrations(dir);
    expect(migrations).toHaveLength(0);
  });

  it('ignores non-SQL files', () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a;\n-- DOWN\nDROP TABLE a;',
      'README.md': '# Migrations',
    }));

    const migrations = loadMigrations(dir);
    expect(migrations).toHaveLength(1);
  });

  it('loads real migrations from the migrations directory', () => {
    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
    const migrations = loadMigrations(migrationsDir);

    expect(migrations).toHaveLength(8);
    expect(migrations[0]?.name).toBe('create_users');
    expect(migrations[7]?.name).toBe('create_match_results');

    // Verify all have non-empty UP and DOWN
    for (const m of migrations) {
      expect(m.up.length).toBeGreaterThan(0);
      expect(m.down.length).toBeGreaterThan(0);
    }
  });
});

describe('runMigrations', () => {
  afterEach(() => {
    for (const d of dirsToCleanup) {
      rmSync(d, { recursive: true, force: true });
    }
    dirsToCleanup.length = 0;
    vi.clearAllMocks();
  });

  it('creates schema_migrations table and runs pending migrations', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
      '002_second.sql': 'CREATE TABLE b (id INT);\n-- DOWN\nDROP TABLE b;',
    }));

    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })  // CREATE TABLE IF NOT EXISTS schema_migrations
      .mockResolvedValueOnce({ rows: [] }); // SELECT from schema_migrations

    const count = await runMigrations(mockPool as unknown as import('pg').Pool, dir);

    expect(count).toBe(2);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('CREATE TABLE a (id INT);');
    expect(mockClient.query).toHaveBeenCalledWith(
      'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
      [1, 'first'],
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('skips already-applied migrations', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
      '002_second.sql': 'CREATE TABLE b (id INT);\n-- DOWN\nDROP TABLE b;',
    }));

    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ version: 1, name: 'first', applied_at: '2024-01-01' }],
      });

    const count = await runMigrations(mockPool as unknown as import('pg').Pool, dir);

    expect(count).toBe(1);
    expect(mockClient.query).toHaveBeenCalledWith('CREATE TABLE b (id INT);');
  });

  it('returns 0 when no migrations are pending', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
    }));

    const { mockPool } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ version: 1, name: 'first', applied_at: '2024-01-01' }],
      });

    const count = await runMigrations(mockPool as unknown as import('pg').Pool, dir);

    expect(count).toBe(0);
    expect(mockLogger.info).toHaveBeenCalledWith('No pending migrations');
  });

  it('rolls back and rethrows on migration failure', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
    }));

    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error('syntax error')); // UP fails

    await expect(
      runMigrations(mockPool as unknown as import('pg').Pool, dir),
    ).rejects.toThrow('syntax error');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('releases the client even on failure', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
    }));

    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('fail'));

    await expect(
      runMigrations(mockPool as unknown as import('pg').Pool, dir),
    ).rejects.toThrow();

    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('rollbackMigration', () => {
  afterEach(() => {
    for (const d of dirsToCleanup) {
      rmSync(d, { recursive: true, force: true });
    }
    dirsToCleanup.length = 0;
    vi.clearAllMocks();
  });

  it('runs DOWN SQL and removes from schema_migrations', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
    }));

    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ version: 1, name: 'first', applied_at: '2024-01-01' }],
      });

    await rollbackMigration(mockPool as unknown as import('pg').Pool, 1, dir);

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('DROP TABLE a;');
    expect(mockClient.query).toHaveBeenCalledWith(
      'DELETE FROM schema_migrations WHERE version = $1',
      [1],
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('throws if migration version not found in files', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
    }));

    const { mockPool } = createMockPool();
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      rollbackMigration(mockPool as unknown as import('pg').Pool, 99, dir),
    ).rejects.toThrow('Migration version 99 not found');
  });

  it('throws if migration has not been applied', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
    }));

    const { mockPool } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      rollbackMigration(mockPool as unknown as import('pg').Pool, 1, dir),
    ).rejects.toThrow('Migration version 1 has not been applied');
  });

  it('rolls back and rethrows on DOWN SQL failure', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a (id INT);\n-- DOWN\nDROP TABLE a;',
    }));

    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ version: 1, name: 'first', applied_at: '2024-01-01' }],
      });

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error('down failed')); // DOWN fails

    await expect(
      rollbackMigration(mockPool as unknown as import('pg').Pool, 1, dir),
    ).rejects.toThrow('down failed');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('getMigrationStatus', () => {
  afterEach(() => {
    for (const d of dirsToCleanup) {
      rmSync(d, { recursive: true, force: true });
    }
    dirsToCleanup.length = 0;
    vi.clearAllMocks();
  });

  it('returns applied, pending, and current_version', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a;\n-- DOWN\nDROP TABLE a;',
      '002_second.sql': 'CREATE TABLE b;\n-- DOWN\nDROP TABLE b;',
      '003_third.sql': 'CREATE TABLE c;\n-- DOWN\nDROP TABLE c;',
    }));

    const { mockPool } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { version: 1, name: 'first', applied_at: '2024-01-01' },
          { version: 2, name: 'second', applied_at: '2024-01-02' },
        ],
      });

    const status = await getMigrationStatus(
      mockPool as unknown as import('pg').Pool,
      dir,
    );

    expect(status.applied).toHaveLength(2);
    expect(status.pending).toHaveLength(1);
    expect(status.pending[0]?.version).toBe(3);
    expect(status.current_version).toBe(2);
  });

  it('returns current_version 0 when no migrations applied', async () => {
    const dir = trackDir(createTestMigrationDir({
      '001_first.sql': 'CREATE TABLE a;\n-- DOWN\nDROP TABLE a;',
    }));

    const { mockPool } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const status = await getMigrationStatus(
      mockPool as unknown as import('pg').Pool,
      dir,
    );

    expect(status.current_version).toBe(0);
    expect(status.pending).toHaveLength(1);
    expect(status.applied).toHaveLength(0);
  });
});
