# RNG Module — Seeded Pseudorandom Number Generator

> **Document Type:** Engine Component Spec
> **Status:** Implementation-Ready
> **Last Updated:** March 2026
> **Parent Spec:** [SBOBUZ_ENGINE_SPEC.md](../../../SBOBUZ_ENGINE_SPEC.md) — Section 14

---

## 1. Overview

The RNG Module provides all randomness for the Sbobuz game engine through a seeded pseudorandom number generator (PRNG). Given the same seed, the module produces the same sequence of random values every time. This determinism is the foundation of the engine's replay, debugging, and spectator capabilities.

The module is used in exactly two places: deck shuffling during game setup, and starting player selection when a tiebreaker requires random choice. After setup, no randomness exists in the game — the entire game is fully deterministic from the action sequence.

`Math.random()` is never called inside the engine. All random operations flow through this module.

---

## 2. Data Model

### 2.1 Types Owned by This Component

```typescript
/**
 * A seeded PRNG instance. Encapsulates the internal state of the
 * generator and exposes methods for consuming random values.
 *
 * The instance is NOT mutated in place. Each call to a random method
 * returns a new SeededRNG instance alongside the result, preserving
 * immutability for the event-sourced architecture.
 */
interface SeededRNG {
  /** The original seed used to create this generator. */
  readonly seed: number;

  /**
   * Internal state counter. Tracks how many values have been consumed.
   * Two RNG instances with the same seed and same state produce the
   * same next value.
   */
  readonly state: number;
}

/**
 * Result of consuming one random value from the generator.
 * Returns both the value and the advanced RNG state.
 */
interface RNGResult<T> {
  value: T;
  nextRng: SeededRNG;
}
```

### 2.2 Types Referenced from Parent Spec

- `Card` — shuffled by this module
- `GameState.rngSeed` — stores the seed for replay

---

## 3. Public Interface

```typescript
/**
 * Creates a new SeededRNG instance from a numeric seed.
 * The seed should be a 32-bit integer. Non-integer values are floored.
 */
function createRng(seed: number): SeededRNG;

/**
 * Returns a pseudorandom floating-point number in [0, 1) and the
 * advanced RNG state.
 */
function nextFloat(rng: SeededRNG): RNGResult<number>;

/**
 * Returns a pseudorandom integer in [min, max] (inclusive on both ends)
 * and the advanced RNG state.
 */
function nextInt(rng: SeededRNG, min: number, max: number): RNGResult<number>;

/**
 * Shuffles an array using the Fisher-Yates algorithm with the seeded RNG.
 * Returns the shuffled array (new array, original is not mutated) and
 * the advanced RNG state.
 */
function shuffle<T>(rng: SeededRNG, array: readonly T[]): RNGResult<T[]>;

/**
 * Picks a random element from a non-empty array.
 * Returns the selected element and the advanced RNG state.
 */
function pick<T>(rng: SeededRNG, array: readonly T[]): RNGResult<T>;
```

---

## 4. Behavior Rules

### 4.1 Determinism Guarantee

The core invariant: for any seed S and call sequence C, the outputs are identical across every invocation, every platform, every JavaScript runtime.

```
createRng(42) → nextFloat → nextFloat → nextInt(1, 6)
```

This sequence must produce the same three values every time, regardless of when or where it runs.

### 4.2 Immutability

The RNG instance is never mutated. Every operation returns a new `SeededRNG` with an advanced `state` counter. This enables:
- The State Factory to pass the RNG through multiple operations (shuffle, then pick starting player) without side effects.
- Replay: re-creating the RNG from the stored seed and replaying the same call sequence reproduces the same game setup.

### 4.3 Algorithm: Mulberry32

The PRNG uses the Mulberry32 algorithm — a 32-bit generator with good statistical properties, fast execution, and compact state.

```
function mulberry32(state: number): { value: number; nextState: number } {
  let t = (state + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;  // normalize to [0, 1)
  return { value, nextState: state + 1 };
}
```

**Why Mulberry32:**
- 32-bit state fits in a single JavaScript number without precision loss.
- Passes BigCrush statistical tests.
- No external dependencies.
- Deterministic across all JavaScript runtimes (uses only integer math and `Math.imul`).

### 4.4 Fisher-Yates Shuffle

The `shuffle` function implements the Fisher-Yates (Knuth) shuffle:

```
1. Create a copy of the input array.
2. For i from array.length - 1 down to 1:
   a. Generate a random integer j in [0, i] using nextInt(rng, 0, i).
   b. Swap array[i] and array[j].
   c. Advance rng to nextRng.
3. Return the shuffled array and final rng state.
```

This produces an unbiased permutation in O(n) time.

---

## 5. Validation Rules

| Check | Condition | Error |
|-------|-----------|-------|
| Seed is finite number | `Number.isFinite(seed)` | `'INVALID_SEED: seed must be a finite number'` |
| nextInt bounds valid | `min <= max` | `'INVALID_BOUNDS: min must be <= max'` |
| nextInt bounds are integers | `Number.isInteger(min) && Number.isInteger(max)` | `'INVALID_BOUNDS: min and max must be integers'` |
| pick array is non-empty | `array.length > 0` | `'EMPTY_ARRAY: cannot pick from empty array'` |
| shuffle array is defined | `array !== null && array !== undefined` | `'INVALID_ARRAY: array must not be null or undefined'` |

---

## 6. Edge Cases & Test Scenarios

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Same seed produces same shuffle | `shuffle(createRng(42), deck)` returns identical result on every call. |
| 2 | Different seeds produce different shuffles | `shuffle(createRng(42), deck)` differs from `shuffle(createRng(43), deck)`. |
| 3 | Shuffle of empty array | Returns empty array. RNG state unchanged (no random values consumed). |
| 4 | Shuffle of single-element array | Returns array with same element. RNG state advanced once (the loop runs 0 times for Fisher-Yates, but implementation may vary — test the output). |
| 5 | nextInt(rng, 5, 5) | Always returns 5. RNG state still advances. |
| 6 | nextFloat returns values in [0, 1) | Over 10,000 calls, no value is < 0 or >= 1. |
| 7 | nextInt distribution is uniform | Over 100,000 calls to nextInt(rng, 1, 6), each value appears approximately 16,667 times (within 2% tolerance). |
| 8 | Seed of 0 works | `createRng(0)` produces valid output (0 is a valid seed). |
| 9 | Negative seed works | `createRng(-12345)` produces valid, deterministic output. |
| 10 | Large seed works | `createRng(2147483647)` (max 32-bit signed int) works correctly. |
| 11 | Non-integer seed is floored | `createRng(42.7)` behaves identically to `createRng(42)`. |
| 12 | Sequential calls advance state correctly | After `nextFloat` called 100 times, the 101st call produces the same value as calling `nextFloat` 101 times from the same seed. |
| 13 | Shuffle of 54-card deck produces all cards | Output array has length 54 and contains every card from the input exactly once. |
| 14 | pick from single-element array | Always returns that element. |
| 15 | pick from two-element array with fixed seed | Returns deterministic element. Repeatable. |

---

## 7. Integration Points

### 7.1 Inbound

| Source | Interface | Data |
|--------|-----------|------|
| State Factory | `createRng(seed)`, `shuffle(rng, deck)`, `pick(rng, players)` | Seed number, card array, player ID array |

### 7.2 Outbound

None. The RNG Module is a leaf component with no outbound dependencies.

### 7.3 Side Effects

None. This is a pure function module.

---

## 8. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Which PRNG algorithm? | Mulberry32 | Fast, compact 32-bit state, passes BigCrush, deterministic across JS runtimes. Alternatives considered: xorshift128 (more state to serialize), Mersenne Twister (heavy, overkill for a card game). |
| 2 | Mutable or immutable RNG state? | Immutable — each operation returns a new instance | Aligns with event-sourced architecture. No hidden mutation. The State Factory chains RNG calls by passing the returned `nextRng` forward. |
| 3 | Should the RNG be a class or functions? | Free functions operating on a plain data object | Easier to serialize (just seed + state counter). No prototype chains. Aligns with data-oriented design. |
| 4 | How is the seed generated? | Outside the engine — the Lobby Module or server infrastructure generates the seed (e.g., from `crypto.getRandomValues`). The engine receives it as input. | The engine must be deterministic. Seed generation is the only true randomness in the system, and it happens before the engine is invoked. |

---

## 9. Implications for Architecture

1. **The seed is the only source of non-determinism in the entire engine.** Once the seed is chosen, the game's setup is fully determined. This means replay is trivially implementable: store the seed and the action log.

2. **The RNG is only used during State Factory execution.** After the initial game state is created, no component ever calls the RNG again. The game is deterministic from that point forward.

3. **The immutable RNG pattern means State Factory must thread the RNG through calls.** Each call returns a new `nextRng`, and the State Factory passes that forward. This is a functional programming pattern — the RNG acts as a "state monad" threaded through the setup pipeline.

4. **Cross-platform determinism requires avoiding `Math.random()` and any floating-point operations that vary by runtime.** The Mulberry32 implementation uses only integer arithmetic (`Math.imul`, bitwise ops, unsigned right shift) plus a single division for normalization. The division `>>> 0 / 4294967296` is safe because both operands are exact integers representable as IEEE 754 doubles.
