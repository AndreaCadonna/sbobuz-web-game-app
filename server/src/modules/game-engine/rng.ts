/**
 * Seeded Pseudorandom Number Generator (PRNG) for the Sbobuz game engine.
 *
 * Uses the Mulberry32 algorithm -- a 32-bit generator with good statistical
 * properties, fast execution, and compact state. Deterministic across all
 * JavaScript runtimes (uses only integer math and `Math.imul`).
 *
 * The RNG instance is never mutated. Every operation returns a new
 * `SeededRNG` alongside the result, preserving immutability for the
 * event-sourced architecture.
 *
 * `Math.random()` is NEVER called. All randomness flows through this module.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 14 (Seeded RNG)
 * @see docs/specs/engine/rng-module.md
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A seeded PRNG instance. Encapsulates the internal state of the generator.
 *
 * Two instances with the same `seed` and `state` will produce the same
 * next value. The instance is immutable -- each call to a random method
 * returns a new `SeededRNG` with an advanced `state` counter.
 */
export interface SeededRNG {
  /** The original seed used to create this generator. */
  readonly seed: number;

  /**
   * Internal state counter. Tracks how many values have been consumed.
   * Starts at 0 for a freshly created RNG.
   */
  readonly state: number;
}

/**
 * Result of consuming one random value from the generator.
 * Contains both the produced value and the advanced RNG state.
 *
 * @typeParam T - The type of the random value produced.
 */
export interface RNGResult<T> {
  /** The random value produced. */
  readonly value: T;
  /** The RNG instance with advanced state, for use in the next call. */
  readonly nextRng: SeededRNG;
}

// ---------------------------------------------------------------------------
// Internal: Mulberry32 core
// ---------------------------------------------------------------------------

/**
 * Mulberry32 raw step. Takes the current internal state integer and produces
 * a float in [0, 1) plus the next state integer.
 *
 * The `internalState` here is `seed + state` (the seed offset by the
 * consumption counter).
 */
function mulberry32Step(internalState: number): { value: number; nextState: number } {
  let t = (internalState + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState: internalState + 1 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new SeededRNG instance from a numeric seed.
 *
 * The seed is floored to an integer. Non-finite values (NaN, Infinity)
 * are rejected.
 *
 * @param seed - A finite number. Non-integer values are floored.
 * @returns A fresh SeededRNG with state = 0.
 * @throws {Error} If `seed` is not a finite number.
 *
 * @example
 * ```typescript
 * const rng = createRng(42);
 * // rng.seed === 42, rng.state === 0
 * ```
 */
export function createRng(seed: number): SeededRNG {
  if (!Number.isFinite(seed)) {
    throw new Error('INVALID_SEED: seed must be a finite number');
  }
  return { seed: Math.floor(seed), state: 0 };
}

/**
 * Returns a pseudorandom floating-point number in [0, 1) and the
 * advanced RNG state.
 *
 * @param rng - The current RNG instance.
 * @returns An `RNGResult` containing the float and the next RNG state.
 *
 * @example
 * ```typescript
 * const rng = createRng(42);
 * const { value, nextRng } = nextFloat(rng);
 * // value is in [0, 1), nextRng.state === 1
 * ```
 */
export function nextFloat(rng: SeededRNG): RNGResult<number> {
  const internalState = rng.seed + rng.state;
  const { value } = mulberry32Step(internalState);
  return {
    value,
    nextRng: { seed: rng.seed, state: rng.state + 1 },
  };
}

/**
 * Returns a pseudorandom integer in [min, max] (inclusive on both ends)
 * and the advanced RNG state.
 *
 * @param rng - The current RNG instance.
 * @param min - The minimum value (inclusive). Must be an integer.
 * @param max - The maximum value (inclusive). Must be an integer >= min.
 * @returns An `RNGResult` containing the integer and the next RNG state.
 * @throws {Error} If `min` or `max` are not integers, or if `min > max`.
 *
 * @example
 * ```typescript
 * const rng = createRng(42);
 * const { value, nextRng } = nextInt(rng, 1, 6);
 * // value is in {1, 2, 3, 4, 5, 6}
 * ```
 */
export function nextInt(rng: SeededRNG, min: number, max: number): RNGResult<number> {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error('INVALID_BOUNDS: min and max must be integers');
  }
  if (min > max) {
    throw new Error('INVALID_BOUNDS: min must be <= max');
  }

  const { value: floatValue, nextRng } = nextFloat(rng);
  const range = max - min + 1;
  const intValue = min + Math.floor(floatValue * range);
  return { value: intValue, nextRng };
}

/**
 * Shuffles an array using the Fisher-Yates (Knuth) algorithm with the
 * seeded RNG. Returns a new array -- the original is never mutated.
 *
 * Produces an unbiased permutation in O(n) time, consuming n-1 random
 * values (one per swap step).
 *
 * @typeParam T - The element type of the array.
 * @param rng - The current RNG instance.
 * @param array - The array to shuffle. Not mutated.
 * @returns An `RNGResult` containing the shuffled array and the next RNG state.
 * @throws {Error} If `array` is null or undefined.
 *
 * @example
 * ```typescript
 * const rng = createRng(42);
 * const { value: shuffled, nextRng } = shuffle(rng, [1, 2, 3, 4, 5]);
 * ```
 */
export function shuffle<T>(rng: SeededRNG, array: readonly T[]): RNGResult<T[]> {
  if (array == null) {
    throw new Error('INVALID_ARRAY: array must not be null or undefined');
  }

  const result = [...array];
  let currentRng = rng;

  for (let i = result.length - 1; i > 0; i--) {
    const { value: j, nextRng: advancedRng } = nextInt(currentRng, 0, i);
    currentRng = advancedRng;

    // Swap result[i] and result[j]
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }

  return { value: result, nextRng: currentRng };
}

/**
 * Picks a random element from a non-empty array.
 *
 * @typeParam T - The element type of the array.
 * @param rng - The current RNG instance.
 * @param array - A non-empty array to pick from. Not mutated.
 * @returns An `RNGResult` containing the selected element and the next RNG state.
 * @throws {Error} If the array is empty.
 *
 * @example
 * ```typescript
 * const rng = createRng(42);
 * const { value: chosen, nextRng } = pick(rng, ['alice', 'bob', 'charlie']);
 * ```
 */
export function pick<T>(rng: SeededRNG, array: readonly T[]): RNGResult<T> {
  if (array.length === 0) {
    throw new Error('EMPTY_ARRAY: cannot pick from empty array');
  }

  const { value: index, nextRng } = nextInt(rng, 0, array.length - 1);
  return { value: array[index]!, nextRng };
}
