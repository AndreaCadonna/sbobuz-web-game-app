/**
 * Tests for AI types and type guards.
 */

import { describe, it, expect } from 'vitest';

import {
  isAIPlayer,
  DEFAULT_AI_CONFIG,
  DIFFICULTY_TO_STRATEGY,
  DIFFICULTY_DELAYS,
  FOLLOW_UP_DELAY,
  AI_DISPLAY_NAMES,
} from './ai.types.js';

describe('isAIPlayer', () => {
  it('returns true for AI player IDs with ai_ prefix', () => {
    expect(isAIPlayer('ai_123')).toBe(true);
    expect(isAIPlayer('ai_easy_1')).toBe(true);
    expect(isAIPlayer('ai_abc-def')).toBe(true);
  });

  it('returns false for human player IDs', () => {
    expect(isAIPlayer('user_123')).toBe(false);
    expect(isAIPlayer('player1')).toBe(false);
    expect(isAIPlayer('')).toBe(false);
    expect(isAIPlayer('AI_123')).toBe(false); // case-sensitive
  });
});

describe('DEFAULT_AI_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_AI_CONFIG.minResponseDelayMs).toBe(500);
    expect(DEFAULT_AI_CONFIG.maxResponseDelayMs).toBe(3000);
    expect(DEFAULT_AI_CONFIG.workerPoolSize).toBe(4);
    expect(DEFAULT_AI_CONFIG.moveTimeoutMs).toBe(5000);
    expect(DEFAULT_AI_CONFIG.maxRetries).toBe(2);
    expect(DEFAULT_AI_CONFIG.defaultDifficulty).toBe('MEDIUM');
    expect(DEFAULT_AI_CONFIG.enableDebugLogging).toBe(false);
  });
});

describe('DIFFICULTY_TO_STRATEGY', () => {
  it('maps EASY to random', () => {
    expect(DIFFICULTY_TO_STRATEGY.EASY).toBe('random');
  });

  it('maps MEDIUM to heuristic', () => {
    expect(DIFFICULTY_TO_STRATEGY.MEDIUM).toBe('heuristic');
  });

  it('maps HARD to mcts', () => {
    expect(DIFFICULTY_TO_STRATEGY.HARD).toBe('mcts');
  });
});

describe('DIFFICULTY_DELAYS', () => {
  it('has increasing delay ranges by difficulty', () => {
    expect(DIFFICULTY_DELAYS.EASY.minMs).toBeLessThan(DIFFICULTY_DELAYS.MEDIUM.minMs);
    expect(DIFFICULTY_DELAYS.MEDIUM.minMs).toBeLessThan(DIFFICULTY_DELAYS.HARD.minMs);
    expect(DIFFICULTY_DELAYS.EASY.maxMs).toBeLessThan(DIFFICULTY_DELAYS.MEDIUM.maxMs);
    expect(DIFFICULTY_DELAYS.MEDIUM.maxMs).toBeLessThan(DIFFICULTY_DELAYS.HARD.maxMs);
  });

  it('has EASY delays of 1000-2000ms', () => {
    expect(DIFFICULTY_DELAYS.EASY).toEqual({ minMs: 1000, maxMs: 2000 });
  });

  it('has MEDIUM delays of 1500-3000ms', () => {
    expect(DIFFICULTY_DELAYS.MEDIUM).toEqual({ minMs: 1500, maxMs: 3000 });
  });
});

describe('FOLLOW_UP_DELAY', () => {
  it('has reduced delay of 500-1000ms', () => {
    expect(FOLLOW_UP_DELAY).toEqual({ minMs: 500, maxMs: 1000 });
  });
});

describe('AI_DISPLAY_NAMES', () => {
  it('has 5 bot names', () => {
    expect(AI_DISPLAY_NAMES).toHaveLength(5);
  });

  it('all start with "Bot "', () => {
    for (const name of AI_DISPLAY_NAMES) {
      expect(name).toMatch(/^Bot /);
    }
  });
});
