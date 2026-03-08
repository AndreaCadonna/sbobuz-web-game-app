/**
 * Tests for the Seeded PRNG (rng.ts).
 *
 * Covers:
 * - Determinism: same seed always produces the same sequence.
 * - Different seeds produce different sequences.
 * - Distribution uniformity.
 * - Immutability: original RNG instance is never mutated.
 * - Edge cases: zero seed, negative seed, large seed, non-integer seed.
 * - Validation: invalid inputs throw specific errors.
 * - Fisher-Yates shuffle correctness.
 * - Pick from array correctness.
 *
 * @see docs/specs/engine/rng-module.md Section 6 (Edge Cases & Test Scenarios)
 */

import { describe, it, expect } from 'vitest';
import {
  createRng,
  nextFloat,
  nextInt,
  shuffle,
  pick,
  type SeededRNG,
} from './rng.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Consume N float values from an RNG, returning the final result and all values. */
function consumeFloats(rng: SeededRNG, count: number): { values: number[]; finalRng: SeededRNG } {
  const values: number[] = [];
  let current = rng;
  for (let i = 0; i < count; i++) {
    const result = nextFloat(current);
    values.push(result.value);
    current = result.nextRng;
  }
  return { values, finalRng: current };
}

/** Consume N int values from an RNG with given bounds. */
function consumeInts(
  rng: SeededRNG,
  count: number,
  min: number,
  max: number,
): { values: number[]; finalRng: SeededRNG } {
  const values: number[] = [];
  let current = rng;
  for (let i = 0; i < count; i++) {
    const result = nextInt(current, min, max);
    values.push(result.value);
    current = result.nextRng;
  }
  return { values, finalRng: current };
}

// ---------------------------------------------------------------------------
// createRng
// ---------------------------------------------------------------------------

describe('createRng', () => {
  it('creates an RNG with the given seed and state 0', () => {
    const rng = createRng(42);
    expect(rng.seed).toBe(42);
    expect(rng.state).toBe(0);
  });

  // Spec edge case #8: Seed of 0 works
  it('accepts seed of 0', () => {
    const rng = createRng(0);
    expect(rng.seed).toBe(0);
    expect(rng.state).toBe(0);
    // Should produce valid output
    const { value } = nextFloat(rng);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  // Spec edge case #9: Negative seed works
  it('accepts negative seed', () => {
    const rng = createRng(-12345);
    expect(rng.seed).toBe(-12345);
    const { value } = nextFloat(rng);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  // Spec edge case #10: Large seed works
  it('accepts max 32-bit signed int seed', () => {
    const rng = createRng(2147483647);
    expect(rng.seed).toBe(2147483647);
    const { value } = nextFloat(rng);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  // Spec edge case #11: Non-integer seed is floored
  it('floors non-integer seed', () => {
    const rng1 = createRng(42.7);
    const rng2 = createRng(42);
    expect(rng1.seed).toBe(42);
    expect(rng1.seed).toBe(rng2.seed);

    // Both must produce identical sequences
    const result1 = nextFloat(rng1);
    const result2 = nextFloat(rng2);
    expect(result1.value).toBe(result2.value);
  });

  it('floors negative non-integer seed', () => {
    const rng = createRng(-3.9);
    // Math.floor(-3.9) === -4
    expect(rng.seed).toBe(-4);
  });

  it('throws for NaN seed', () => {
    expect(() => createRng(NaN)).toThrow('INVALID_SEED: seed must be a finite number');
  });

  it('throws for Infinity seed', () => {
    expect(() => createRng(Infinity)).toThrow('INVALID_SEED: seed must be a finite number');
  });

  it('throws for -Infinity seed', () => {
    expect(() => createRng(-Infinity)).toThrow('INVALID_SEED: seed must be a finite number');
  });
});

// ---------------------------------------------------------------------------
// nextFloat
// ---------------------------------------------------------------------------

describe('nextFloat', () => {
  // Spec edge case #1 (adapted): Same seed produces same first value
  it('is deterministic -- same seed always produces the same value', () => {
    const rng = createRng(42);
    const result1 = nextFloat(rng);
    const result2 = nextFloat(rng);
    expect(result1.value).toBe(result2.value);
    expect(result1.nextRng.state).toBe(result2.nextRng.state);
  });

  // Spec edge case #2 (adapted): Different seeds produce different values
  it('produces different values for different seeds', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(43);
    const result1 = nextFloat(rng1);
    const result2 = nextFloat(rng2);
    expect(result1.value).not.toBe(result2.value);
  });

  // Spec edge case #6: nextFloat returns values in [0, 1)
  it('returns values in [0, 1) over 10,000 calls', () => {
    const rng = createRng(12345);
    const { values } = consumeFloats(rng, 10_000);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('advances state by 1 on each call', () => {
    const rng = createRng(99);
    const { nextRng: rng1 } = nextFloat(rng);
    expect(rng1.state).toBe(1);
    const { nextRng: rng2 } = nextFloat(rng1);
    expect(rng2.state).toBe(2);
  });

  it('does not mutate the original RNG instance', () => {
    const rng = createRng(42);
    const originalSeed = rng.seed;
    const originalState = rng.state;
    nextFloat(rng);
    expect(rng.seed).toBe(originalSeed);
    expect(rng.state).toBe(originalState);
  });

  it('preserves the seed across calls', () => {
    const rng = createRng(42);
    const { nextRng } = nextFloat(rng);
    expect(nextRng.seed).toBe(42);
  });

  // Spec edge case #12: Sequential calls advance state correctly
  it('produces consistent sequences regardless of intermediate access', () => {
    const rng = createRng(777);

    // Call 100 times
    const { values: first100, finalRng: after100 } = consumeFloats(rng, 100);

    // The 101st value via continuing
    const { value: value101 } = nextFloat(after100);

    // Call 101 times from scratch
    const { values: first101 } = consumeFloats(rng, 101);

    // First 100 values should match
    for (let i = 0; i < 100; i++) {
      expect(first100[i]).toBe(first101[i]);
    }

    // 101st value should also match
    expect(value101).toBe(first101[100]);
  });
});

// ---------------------------------------------------------------------------
// nextInt
// ---------------------------------------------------------------------------

describe('nextInt', () => {
  it('returns integers within [min, max] inclusive', () => {
    const rng = createRng(42);
    const { values } = consumeInts(rng, 1000, 1, 6);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  // Spec edge case #5: nextInt(rng, 5, 5) always returns 5
  it('returns the only possible value when min === max', () => {
    const rng = createRng(42);
    const { values } = consumeInts(rng, 100, 5, 5);
    for (const v of values) {
      expect(v).toBe(5);
    }
  });

  it('still advances state when min === max', () => {
    const rng = createRng(42);
    const { nextRng } = nextInt(rng, 5, 5);
    expect(nextRng.state).toBe(1);
  });

  // Spec edge case #7: Distribution is roughly uniform
  it('produces roughly uniform distribution over 100,000 calls for 1-6', () => {
    const rng = createRng(42);
    const { values } = consumeInts(rng, 100_000, 1, 6);

    const counts = new Map<number, number>();
    for (const v of values) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }

    const expected = 100_000 / 6; // ~16,667
    const tolerance = expected * 0.02; // 2% tolerance

    for (let i = 1; i <= 6; i++) {
      const count = counts.get(i) ?? 0;
      expect(count).toBeGreaterThan(expected - tolerance);
      expect(count).toBeLessThan(expected + tolerance);
    }
  });

  it('is deterministic -- same seed and bounds produce same sequence', () => {
    const rng = createRng(42);
    const { values: seq1 } = consumeInts(rng, 50, 0, 100);
    const { values: seq2 } = consumeInts(rng, 50, 0, 100);
    expect(seq1).toEqual(seq2);
  });

  it('throws when min > max', () => {
    const rng = createRng(42);
    expect(() => nextInt(rng, 10, 5)).toThrow('INVALID_BOUNDS: min must be <= max');
  });

  it('throws when min is not an integer', () => {
    const rng = createRng(42);
    expect(() => nextInt(rng, 1.5, 6)).toThrow('INVALID_BOUNDS: min and max must be integers');
  });

  it('throws when max is not an integer', () => {
    const rng = createRng(42);
    expect(() => nextInt(rng, 1, 6.5)).toThrow('INVALID_BOUNDS: min and max must be integers');
  });

  it('handles negative ranges', () => {
    const rng = createRng(42);
    const { values } = consumeInts(rng, 1000, -10, -1);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThanOrEqual(-1);
    }
  });

  it('handles ranges crossing zero', () => {
    const rng = createRng(42);
    const { values } = consumeInts(rng, 1000, -5, 5);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// shuffle
// ---------------------------------------------------------------------------

describe('shuffle', () => {
  // Spec edge case #1: Same seed produces same shuffle
  it('is deterministic -- same seed produces identical shuffle', () => {
    const rng = createRng(42);
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result1 = shuffle(rng, input);
    const result2 = shuffle(rng, input);
    expect(result1.value).toEqual(result2.value);
    expect(result1.nextRng.state).toBe(result2.nextRng.state);
  });

  // Spec edge case #2: Different seeds produce different shuffles
  it('produces different results for different seeds', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(43);
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result1 = shuffle(rng1, input);
    const result2 = shuffle(rng2, input);
    expect(result1.value).not.toEqual(result2.value);
  });

  // Spec edge case #3: Shuffle of empty array
  it('returns empty array for empty input, state unchanged', () => {
    const rng = createRng(42);
    const result = shuffle(rng, []);
    expect(result.value).toEqual([]);
    // No random values consumed (Fisher-Yates loop doesn't execute)
    expect(result.nextRng.state).toBe(0);
  });

  // Spec edge case #4: Shuffle of single-element array
  it('returns same element for single-element array', () => {
    const rng = createRng(42);
    const result = shuffle(rng, ['only']);
    expect(result.value).toEqual(['only']);
    // Fisher-Yates loop starts at index length-1=0, condition i>0 is false, so no iterations
    expect(result.nextRng.state).toBe(0);
  });

  // Spec edge case #13: Shuffle of 54-card deck produces all cards
  it('preserves all elements in a 54-element array (no duplicates, no missing)', () => {
    const rng = createRng(42);
    const deck = Array.from({ length: 54 }, (_, i) => `card_${i}`);
    const result = shuffle(rng, deck);

    expect(result.value).toHaveLength(54);

    const sorted = [...result.value].sort();
    const sortedOriginal = [...deck].sort();
    expect(sorted).toEqual(sortedOriginal);
  });

  it('does not mutate the original array', () => {
    const rng = createRng(42);
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffle(rng, original);
    expect(original).toEqual(copy);
  });

  it('throws for null array', () => {
    const rng = createRng(42);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    expect(() => shuffle(rng, null as any)).toThrow(
      'INVALID_ARRAY: array must not be null or undefined',
    );
  });

  it('throws for undefined array', () => {
    const rng = createRng(42);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    expect(() => shuffle(rng, undefined as any)).toThrow(
      'INVALID_ARRAY: array must not be null or undefined',
    );
  });

  it('advances RNG state by (n-1) for an n-element array', () => {
    const rng = createRng(42);
    const result = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Fisher-Yates: loops from index 9 down to 1 = 9 iterations = 9 random values consumed
    expect(result.nextRng.state).toBe(9);
  });

  it('produces a proper permutation (not just reverse or identity) for large arrays', () => {
    const rng = createRng(42);
    const input = Array.from({ length: 20 }, (_, i) => i);
    const result = shuffle(rng, input);

    // It should not be the same as the original (extremely unlikely with seed 42)
    expect(result.value).not.toEqual(input);
    // It should not be the reverse
    expect(result.value).not.toEqual([...input].reverse());
  });
});

// ---------------------------------------------------------------------------
// pick
// ---------------------------------------------------------------------------

describe('pick', () => {
  // Spec edge case #14: pick from single-element array
  it('always returns the only element from a single-element array', () => {
    const rng = createRng(42);
    let current = rng;
    for (let i = 0; i < 100; i++) {
      const result = pick(current, ['only']);
      expect(result.value).toBe('only');
      current = result.nextRng;
    }
  });

  // Spec edge case #15: pick from two-element array with fixed seed is deterministic
  it('returns deterministic element from a two-element array', () => {
    const rng = createRng(42);
    const result1 = pick(rng, ['a', 'b']);
    const result2 = pick(rng, ['a', 'b']);
    expect(result1.value).toBe(result2.value);
    expect(result1.nextRng.state).toBe(result2.nextRng.state);
  });

  it('returns elements from the array (not fabricated values)', () => {
    const rng = createRng(42);
    const items = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    let current = rng;
    for (let i = 0; i < 1000; i++) {
      const result = pick(current, items);
      expect(items).toContain(result.value);
      current = result.nextRng;
    }
  });

  it('advances state by 1 on each call', () => {
    const rng = createRng(42);
    const { nextRng } = pick(rng, [1, 2, 3]);
    expect(nextRng.state).toBe(1);
  });

  it('throws for empty array', () => {
    const rng = createRng(42);
    expect(() => pick(rng, [])).toThrow('EMPTY_ARRAY: cannot pick from empty array');
  });

  it('covers all elements given enough picks', () => {
    const rng = createRng(42);
    const items = ['a', 'b', 'c', 'd', 'e'];
    const seen = new Set<string>();
    let current = rng;
    for (let i = 0; i < 1000; i++) {
      const result = pick(current, items);
      seen.add(result.value);
      current = result.nextRng;
    }
    expect(seen.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: Immutability
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('nextFloat does not mutate the input RNG', () => {
    const rng = createRng(42);
    const snapshot = { ...rng };
    nextFloat(rng);
    expect(rng).toEqual(snapshot);
  });

  it('nextInt does not mutate the input RNG', () => {
    const rng = createRng(42);
    const snapshot = { ...rng };
    nextInt(rng, 0, 10);
    expect(rng).toEqual(snapshot);
  });

  it('shuffle does not mutate the input RNG', () => {
    const rng = createRng(42);
    const snapshot = { ...rng };
    shuffle(rng, [1, 2, 3, 4, 5]);
    expect(rng).toEqual(snapshot);
  });

  it('pick does not mutate the input RNG', () => {
    const rng = createRng(42);
    const snapshot = { ...rng };
    pick(rng, [1, 2, 3]);
    expect(rng).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: Determinism across chained operations
// ---------------------------------------------------------------------------

describe('determinism across chained operations', () => {
  it('produces identical results for identical call sequences', () => {
    // Simulate what State Factory does: shuffle a deck, then pick a starting player
    const deck = Array.from({ length: 54 }, (_, i) => `card_${i}`);
    const players = ['p1', 'p2', 'p3'];

    // Run 1
    const rng1 = createRng(42);
    const { value: shuffled1, nextRng: afterShuffle1 } = shuffle(rng1, deck);
    const { value: picked1, nextRng: afterPick1 } = pick(afterShuffle1, players);

    // Run 2
    const rng2 = createRng(42);
    const { value: shuffled2, nextRng: afterShuffle2 } = shuffle(rng2, deck);
    const { value: picked2, nextRng: afterPick2 } = pick(afterShuffle2, players);

    expect(shuffled1).toEqual(shuffled2);
    expect(picked1).toBe(picked2);
    expect(afterPick1.state).toBe(afterPick2.state);
    expect(afterPick1.seed).toBe(afterPick2.seed);
  });

  it('produces different results when seeds differ', () => {
    const deck = Array.from({ length: 54 }, (_, i) => `card_${i}`);
    const players = ['p1', 'p2', 'p3'];

    const rng1 = createRng(42);
    const { value: shuffled1, nextRng: afterShuffle1 } = shuffle(rng1, deck);
    const { value: picked1 } = pick(afterShuffle1, players);

    const rng2 = createRng(99);
    const { value: shuffled2, nextRng: afterShuffle2 } = shuffle(rng2, deck);
    const { value: picked2 } = pick(afterShuffle2, players);

    // Shuffles should differ (extremely high probability)
    expect(shuffled1).not.toEqual(shuffled2);
    // Picks may or may not differ, but at least one of {shuffle, pick} must differ
    const shufflesSame = JSON.stringify(shuffled1) === JSON.stringify(shuffled2);
    const picksSame = picked1 === picked2;
    expect(shufflesSame && picksSame).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: Replay capability
// ---------------------------------------------------------------------------

describe('replay capability', () => {
  it('recreating RNG from stored seed + replaying calls reproduces the same output', () => {
    const seed = 42;

    // Original run: shuffle, nextFloat, pick
    const rng = createRng(seed);
    const { value: originalShuffle, nextRng: rng2 } = shuffle(rng, [10, 20, 30, 40, 50]);
    const { value: originalFloat, nextRng: rng3 } = nextFloat(rng2);
    const { value: originalPick } = pick(rng3, ['x', 'y', 'z']);

    // Replay: same seed, same call sequence
    const replayRng = createRng(seed);
    const { value: replayShuffle, nextRng: replayRng2 } = shuffle(replayRng, [10, 20, 30, 40, 50]);
    const { value: replayFloat, nextRng: replayRng3 } = nextFloat(replayRng2);
    const { value: replayPick } = pick(replayRng3, ['x', 'y', 'z']);

    expect(replayShuffle).toEqual(originalShuffle);
    expect(replayFloat).toBe(originalFloat);
    expect(replayPick).toBe(originalPick);
  });
});
