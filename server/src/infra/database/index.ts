/**
 * Database infrastructure barrel export.
 *
 * @see docs/specs/data-layer.md Section 5.1
 */

export { createPool, getPool, closePool, checkPoolHealth, resetPool } from './pool.js';
export type { PoolHealthResult } from './pool.js';
export { runMigrations, rollbackMigration, getMigrationStatus } from './migrator.js';
export type { MigrationRecord, MigrationStatus } from './migrator.js';
