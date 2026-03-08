/**
 * Tests for Worker Pool Manager.
 *
 * These tests mock the Worker class since actual worker threads
 * require a running Node.js context with tsx loader.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  resetPool,
  getPoolStats,
  isPoolInitialized,
  getPoolConfig,
} from './worker-pool.js';
import type { WorkerPoolStats, AIConfig } from './ai.types.js';
import { DEFAULT_AI_CONFIG } from './ai.types.js';

beforeEach(() => {
  resetPool();
});

describe('Worker Pool state management', () => {
  it('starts uninitialized', () => {
    expect(isPoolInitialized()).toBe(false);
  });

  it('resetPool clears all state', () => {
    resetPool();
    expect(isPoolInitialized()).toBe(false);
    const stats = getPoolStats();
    expect(stats.totalWorkers).toBe(0);
    expect(stats.busyWorkers).toBe(0);
    expect(stats.queuedRequests).toBe(0);
    expect(stats.totalRequestsProcessed).toBe(0);
    expect(stats.totalTimeouts).toBe(0);
    expect(stats.totalErrors).toBe(0);
  });

  it('getPoolConfig returns default config before initialization', () => {
    const cfg = getPoolConfig();
    expect(cfg.workerPoolSize).toBe(DEFAULT_AI_CONFIG.workerPoolSize);
    expect(cfg.moveTimeoutMs).toBe(DEFAULT_AI_CONFIG.moveTimeoutMs);
  });
});

describe('WorkerPoolStats', () => {
  it('has correct initial stats', () => {
    const stats = getPoolStats();
    expect(stats).toEqual({
      totalWorkers: 0,
      busyWorkers: 0,
      idleWorkers: 0,
      queuedRequests: 0,
      totalRequestsProcessed: 0,
      totalTimeouts: 0,
      totalErrors: 0,
      avgComputeTimeMs: 0,
    } satisfies WorkerPoolStats);
  });
});

describe('DEFAULT_AI_CONFIG', () => {
  it('has expected pool configuration', () => {
    expect(DEFAULT_AI_CONFIG.workerPoolSize).toBe(4);
    expect(DEFAULT_AI_CONFIG.moveTimeoutMs).toBe(5000);
    expect(DEFAULT_AI_CONFIG.maxRetries).toBe(2);
  });
});
