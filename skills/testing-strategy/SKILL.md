---
name: testing-strategy
description: Testing patterns and quality assurance for Node.js/TypeScript applications using Vitest. Covers unit testing, integration testing, test architecture, mocking strategy, coverage targets, and test organization. Use this skill whenever writing tests, setting up test infrastructure, deciding what to test, choosing between unit and integration tests, implementing test fixtures, or when the user asks about testing strategy, coverage requirements, mocking patterns, or test-driven development. Also activate when debugging flaky tests, structuring test suites, or setting up test databases and service containers.
origin: ECC
---

# Testing Strategy

Production patterns for testing Node.js/TypeScript applications with Vitest. These conventions define what to test, how to test it, and how to keep tests reliable and fast.

## When to Activate

- Writing unit or integration tests
- Deciding what to test and at what level
- Setting up test infrastructure (test DB, fixtures)
- Implementing mocking strategies
- Debugging flaky or slow tests
- Structuring test files and suites

## Test Pyramid

```
         ╱╲
        ╱  ╲        E2E Tests (few, slow, high confidence)
       ╱────╲       Smoke tests, critical paths only
      ╱      ╲
     ╱────────╲     Integration Tests (moderate, with real dependencies)
    ╱          ╲    Service + DB, service + Redis, API routes
   ╱────────────╲
  ╱              ╲  Unit Tests (many, fast, isolated)
 ╱________________╲ Pure functions, validators, reducers, state machines
```

| Level | What | Dependencies | Speed | Count |
|-------|------|-------------|-------|-------|
| Unit | Pure logic, validators, reducers | None (no I/O) | < 1ms each | Many |
| Integration | Service + real DB/Redis | PostgreSQL, Redis containers | 10-100ms each | Moderate |
| E2E/Smoke | Full API flows | Full stack | 1-10s each | Few |

## Unit Tests

Unit tests cover pure functions — functions with no I/O, no database calls, no network requests. They are fast, deterministic, and the foundation of your test suite.

### What to Unit Test

- Game engine state machine (reducer, validator)
- Zod validation schemas
- Business logic functions
- Utility functions
- Error class construction
- Data transformations

### Test File Organization

```
src/
├── modules/
│   ├── game-engine/
│   │   ├── engine.ts
│   │   ├── engine.test.ts        # Unit tests colocated
│   │   ├── validator.ts
│   │   └── validator.test.ts
│   └── auth/
│       ├── auth.service.ts
│       └── auth.service.test.ts
└── shared/
    ├── errors.ts
    └── errors.test.ts

tests/
└── integration/                   # Integration tests in separate directory
    ├── auth.integration.test.ts
    ├── lobby.integration.test.ts
    └── setup.ts                   # Shared fixtures, DB setup
```

**Convention:** Unit tests are colocated with their source (`*.test.ts` next to `*.ts`). Integration tests live in a `tests/integration/` directory with shared setup.

### Writing Unit Tests

```typescript
// modules/game-engine/validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateAction } from './validator';
import { createInitialState } from './engine';

describe('validateAction', () => {
  describe('play_cards', () => {
    it('accepts a card higher than pile top', () => {
      const state = createTestState({
        pile: [card('7', 'hearts')],
        currentPlayerHand: [card('9', 'spades')],
      });

      const result = validateAction(state, {
        type: 'play_cards',
        playerId: 'player-1',
        payload: { cardIds: ['9-spades'] },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects a card lower than pile top', () => {
      const state = createTestState({
        pile: [card('9', 'hearts')],
        currentPlayerHand: [card('5', 'spades')],
      });

      const result = validateAction(state, {
        type: 'play_cards',
        playerId: 'player-1',
        payload: { cardIds: ['5-spades'] },
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('CARD_TOO_LOW');
    });

    it('accepts a 2 on any pile top (free play)', () => {
      const state = createTestState({
        pile: [card('K', 'hearts')],
        currentPlayerHand: [card('2', 'spades')],
      });

      const result = validateAction(state, {
        type: 'play_cards',
        playerId: 'player-1',
        payload: { cardIds: ['2-spades'] },
      });

      expect(result.valid).toBe(true);
    });
  });
});
```

### Test Helpers

Build test helpers that create valid state quickly. Helpers make tests readable by showing only the parts that matter for each scenario.

```typescript
// tests/helpers/game-helpers.ts
import type { GameState, Card } from '../../src/modules/game-engine/types';

export function createTestState(overrides: Partial<TestStateConfig> = {}): GameState {
  return {
    id: 'test-game',
    phase: 'playing',
    players: overrides.players ?? [createTestPlayer('player-1'), createTestPlayer('player-2')],
    pile: overrides.pile ?? [],
    currentPlayerIndex: overrides.currentPlayerIndex ?? 0,
    direction: overrides.direction ?? 'higher',
    seed: 12345,
    actionLog: [],
    ...overrides,
  };
}

export function card(rank: string, suit: string): Card {
  return { id: `${rank}-${suit}`, rank, suit };
}
```

## Integration Tests

Integration tests verify that modules work correctly with real external dependencies. They catch issues that unit tests miss: connection handling, transaction behavior, query correctness, race conditions.

### Test Database Setup

```typescript
// tests/integration/setup.ts
import { Pool } from 'pg';
import { beforeAll, afterAll, beforeEach } from 'vitest';

let testPool: Pool;

export function setupTestDatabase() {
  beforeAll(async () => {
    testPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Run migrations
    await runMigrations(testPool);
  });

  beforeEach(async () => {
    // Truncate all tables between tests for isolation
    await testPool.query(`
      TRUNCATE users, games, game_actions
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await testPool.end();
  });

  return { getPool: () => testPool };
}
```

### Writing Integration Tests

```typescript
// tests/integration/auth.integration.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { setupTestDatabase } from './setup';
import { createAuthService } from '../../src/modules/auth/auth.service';

describe('AuthService (integration)', () => {
  const { getPool } = setupTestDatabase();

  it('registers a new user and returns tokens', async () => {
    const authService = createAuthService(getPool());

    const result = await authService.register({
      email: 'alice@example.com',
      username: 'alice',
      password: 'securepassword123',
    });

    expect(result.user.email).toBe('alice@example.com');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('rejects duplicate email registration', async () => {
    const authService = createAuthService(getPool());

    await authService.register({
      email: 'alice@example.com',
      username: 'alice',
      password: 'password123',
    });

    await expect(
      authService.register({
        email: 'alice@example.com',
        username: 'alice2',
        password: 'password456',
      }),
    ).rejects.toThrow('CONFLICT');
  });
});
```

## Mocking Strategy

### When to Mock

| Situation | Mock? | Why |
|-----------|-------|-----|
| External HTTP API | Yes | Unreliable, slow, costs money |
| Database in unit tests | Yes | Unit tests must be fast and isolated |
| Database in integration tests | No | That's the point of integration tests |
| Time/Date | Yes | Deterministic tests |
| Random/crypto | Yes | Reproducible tests |
| Internal module in unit tests | Usually no | Test real behavior, not mocked behavior |

### Mocking with Vitest

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock a module
vi.mock('../../src/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock time
describe('token expiration', () => {
  it('rejects expired tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    const token = generateAccessToken('user-1', 'alice');

    // Advance 16 minutes (past 15-min TTL)
    vi.advanceTimersByTime(16 * 60 * 1000);

    expect(() => verifyAccessToken(token)).toThrow();

    vi.useRealTimers();
  });
});
```

### Avoid Over-Mocking

If a test mocks everything the function calls, it's testing the mock setup, not the function. Only mock what you can't control (I/O, time, randomness).

```typescript
// BAD — mocks everything, tests nothing meaningful
it('registers a user', async () => {
  vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');
  vi.spyOn(db, 'query').mockResolvedValue({ rows: [{ id: '1' }] });
  vi.spyOn(jwt, 'sign').mockReturnValue('token');

  const result = await register({ email: 'a@b.com', password: 'pw' });
  expect(result.token).toBe('token'); // Just testing your mock setup
});

// GOOD — test the actual logic, mock only the boundary
// In integration tests: use real DB, real bcrypt, real JWT
```

## Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests: colocated, fast, no I/O
    include: ['src/**/*.test.ts'],
    exclude: ['tests/integration/**'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      exclude: [
        'src/**/*.test.ts',
        'src/config/**',
        'tests/**',
      ],
    },
  },
});
```

```typescript
// vitest.integration.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 10_000,
    hookTimeout: 30_000,
    // Run serially — integration tests share a database
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
```

### npm Scripts

```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Test Naming

Test descriptions should read as specifications. Use `it('does X when Y')` format.

```typescript
// GOOD — reads like a specification
it('rejects a card lower than the pile top');
it('clears the pile when a King is played');
it('reverses direction when a Joker is played');
it('returns 401 when the access token is expired');

// AVOID — vague or implementation-focused
it('works correctly');
it('handles edge case');
it('calls the repository');
```

## Dealing with Flaky Tests

A flaky test is worse than no test — it erodes trust in the entire suite.

| Cause | Fix |
|-------|-----|
| Race condition in async code | Use proper `await`, remove arbitrary delays |
| Shared mutable state between tests | Reset state in `beforeEach` |
| Time-dependent logic | Use `vi.useFakeTimers()` |
| Order-dependent tests | Each test must be independently runnable |
| Network calls in unit tests | Mock external HTTP calls |
| Random data without seed | Use seeded random or fixed test data |

## Checklist

Before shipping tests:

- [ ] Unit tests cover all pure business logic (validators, reducers, transforms)
- [ ] Integration tests verify DB queries and service interactions with real deps
- [ ] Test names read as specifications (`it('does X when Y')`)
- [ ] No `console.log` in tests — use Vitest's built-in assertion messages
- [ ] Each test is independent — no order dependency
- [ ] Mocks are minimal — only mock I/O boundaries, not internal logic
- [ ] Coverage meets thresholds (80% branches, functions, lines, statements)
- [ ] Integration tests truncate/reset state in `beforeEach`
- [ ] No hardcoded ports or URLs — use env vars or config
- [ ] Flaky tests are fixed or quarantined, never ignored
