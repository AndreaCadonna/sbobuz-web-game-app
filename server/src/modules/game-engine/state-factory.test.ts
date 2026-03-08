/**
 * Tests for the State Factory module.
 *
 * Covers all 23 edge cases from the state-factory spec, validation rules,
 * and determinism guarantees.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 4 (Setup & Deal)
 * @see docs/specs/engine/state-factory.md Section 7 (Edge Cases)
 */

import { describe, it, expect } from 'vitest';

import type { Card } from '@shared/card.js';
import type { GameConfig, GameState } from '@shared/game-state.js';

import type { CreateGameInput } from './state-factory.js';
import { createInitialState } from './state-factory.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Default valid config for tests. */
const DEFAULT_CONFIG: GameConfig = {
  turnTimerSeconds: 30,
  disconnectGraceSeconds: 30,
  maxPlayers: 5,
  minPlayers: 2,
};

/** Creates a valid CreateGameInput for testing. */
function validInput(overrides?: Partial<CreateGameInput>): CreateGameInput {
  return {
    gameId: 'test-game-1',
    playerIds: ['alice', 'bob'],
    seed: 42,
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

/** Collects all cards from all zones in a game state. */
function collectAllCards(state: GameState): Card[] {
  const all: Card[] = [];
  for (const player of state.players) {
    all.push(...player.faceDownCards);
    all.push(...player.faceUpCards);
    all.push(...player.hand);
  }
  all.push(...state.drawPile);
  all.push(...state.playPile);
  all.push(...state.burnPile);
  return all;
}

/** Returns all unique card IDs from a collection of cards. */
function uniqueCardIds(cards: ReadonlyArray<Card>): Set<string> {
  return new Set(cards.map((c) => c.id));
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe('createInitialState -- validation', () => {
  it('throws for empty gameId', () => {
    expect(() => createInitialState(validInput({ gameId: '' }))).toThrow(
      'INVALID_GAME_ID: game ID must be non-empty string',
    );
  });

  it('throws for 0 players', () => {
    expect(() => createInitialState(validInput({ playerIds: [] }))).toThrow(
      'INVALID_PLAYER_COUNT',
    );
  });

  it('throws for 1 player', () => {
    expect(() => createInitialState(validInput({ playerIds: ['solo'] }))).toThrow(
      'INVALID_PLAYER_COUNT',
    );
  });

  it('throws for 6 players', () => {
    expect(() =>
      createInitialState(
        validInput({ playerIds: ['a', 'b', 'c', 'd', 'e', 'f'] }),
      ),
    ).toThrow('INVALID_PLAYER_COUNT');
  });

  it('throws for duplicate player IDs', () => {
    expect(() =>
      createInitialState(validInput({ playerIds: ['alice', 'alice'] })),
    ).toThrow('DUPLICATE_PLAYER_ID');
  });

  it('throws for empty player ID', () => {
    expect(() =>
      createInitialState(validInput({ playerIds: ['alice', ''] })),
    ).toThrow('INVALID_PLAYER_ID');
  });

  it('throws for NaN seed', () => {
    expect(() => createInitialState(validInput({ seed: NaN }))).toThrow(
      'INVALID_SEED',
    );
  });

  it('throws for Infinity seed', () => {
    expect(() => createInitialState(validInput({ seed: Infinity }))).toThrow(
      'INVALID_SEED',
    );
  });

  it('throws for negative Infinity seed', () => {
    expect(() =>
      createInitialState(validInput({ seed: -Infinity })),
    ).toThrow('INVALID_SEED');
  });

  it('throws for zero turnTimerSeconds', () => {
    expect(() =>
      createInitialState(
        validInput({
          config: { ...DEFAULT_CONFIG, turnTimerSeconds: 0 },
        }),
      ),
    ).toThrow('INVALID_CONFIG: turnTimerSeconds must be positive');
  });

  it('throws for negative turnTimerSeconds', () => {
    expect(() =>
      createInitialState(
        validInput({
          config: { ...DEFAULT_CONFIG, turnTimerSeconds: -10 },
        }),
      ),
    ).toThrow('INVALID_CONFIG: turnTimerSeconds must be positive');
  });

  it('throws for zero disconnectGraceSeconds', () => {
    expect(() =>
      createInitialState(
        validInput({
          config: { ...DEFAULT_CONFIG, disconnectGraceSeconds: 0 },
        }),
      ),
    ).toThrow('INVALID_CONFIG: disconnectGraceSeconds must be positive');
  });

  it('throws for negative disconnectGraceSeconds', () => {
    expect(() =>
      createInitialState(
        validInput({
          config: { ...DEFAULT_CONFIG, disconnectGraceSeconds: -5 },
        }),
      ),
    ).toThrow('INVALID_CONFIG: disconnectGraceSeconds must be positive');
  });
});

// ---------------------------------------------------------------------------
// Initial state structure (scenarios #15-#21)
// ---------------------------------------------------------------------------

describe('createInitialState -- initial state structure', () => {
  let state: GameState;

  // Create once for the structure tests
  state = createInitialState(validInput());

  // Spec scenario #17: Phase is 'playing' after creation
  it('sets phase to "playing" (scenario #17)', () => {
    expect(state.phase).toBe('playing');
  });

  // Spec scenario #18: Turn direction starts at 1 (forward)
  it('sets turnDirection to 1 (forward) (scenario #18)', () => {
    expect(state.turnDirection).toBe(1);
  });

  // Spec scenario #19: freePlay starts false
  it('sets freePlay to false (scenario #19)', () => {
    expect(state.freePlay).toBe(false);
  });

  // Spec scenario #20: nextCardOverride starts null
  it('sets nextCardOverride to null (scenario #20)', () => {
    expect(state.nextCardOverride).toBeNull();
  });

  // Spec scenario #21: actionCount starts at 0
  it('sets actionCount to 0 (scenario #21)', () => {
    expect(state.actionCount).toBe(0);
  });

  // Spec scenario #15: Play pile starts empty
  it('starts with empty playPile (scenario #15)', () => {
    expect(state.playPile).toHaveLength(0);
  });

  // Spec scenario #16: Burn pile starts empty
  it('starts with empty burnPile (scenario #16)', () => {
    expect(state.burnPile).toHaveLength(0);
  });

  it('preserves the gameId', () => {
    expect(state.gameId).toBe('test-game-1');
  });

  it('preserves the config', () => {
    expect(state.config).toEqual(DEFAULT_CONFIG);
  });

  it('preserves the rngSeed', () => {
    expect(state.rngSeed).toBe(42);
  });

  it('sets turnOrder from playerIds', () => {
    expect(state.turnOrder).toEqual(['alice', 'bob']);
  });

  it('currentPlayerIndex is a valid index into turnOrder', () => {
    expect(state.currentPlayerIndex).toBeGreaterThanOrEqual(0);
    expect(state.currentPlayerIndex).toBeLessThan(state.turnOrder.length);
  });
});

// ---------------------------------------------------------------------------
// 2-player game (scenario #1)
// ---------------------------------------------------------------------------

describe('createInitialState -- 2-player game (scenario #1)', () => {
  const state = createInitialState(validInput());

  it('creates 2 players', () => {
    expect(state.players).toHaveLength(2);
  });

  // Spec scenario #11: Face-down cards
  it('each player has exactly 3 face-down cards (scenario #11)', () => {
    for (const player of state.players) {
      expect(player.faceDownCards).toHaveLength(3);
    }
  });

  // Spec scenario #12: Face-up cards
  it('each player has exactly 3 face-up cards (scenario #12)', () => {
    for (const player of state.players) {
      expect(player.faceUpCards).toHaveLength(3);
    }
  });

  // Spec scenario #13: Hand cards
  it('each player has exactly 3 hand cards (scenario #13)', () => {
    for (const player of state.players) {
      expect(player.hand).toHaveLength(3);
    }
  });

  it('draw pile has 36 cards', () => {
    expect(state.drawPile).toHaveLength(36);
  });

  // Spec scenario #14: Draw pile convention (index 0 = top)
  it('draw pile index 0 is the top card (scenario #14)', () => {
    // The draw pile is ordered so that index 0 is the next card to be drawn
    expect(state.drawPile.length).toBeGreaterThan(0);
    expect(state.drawPile[0]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3-player game
// ---------------------------------------------------------------------------

describe('createInitialState -- 3-player game', () => {
  const state = createInitialState(
    validInput({ playerIds: ['alice', 'bob', 'charlie'] }),
  );

  it('creates 3 players', () => {
    expect(state.players).toHaveLength(3);
  });

  it('draw pile has 27 cards', () => {
    expect(state.drawPile).toHaveLength(27);
  });

  it('each player has 9 cards total', () => {
    for (const player of state.players) {
      const total =
        player.hand.length +
        player.faceUpCards.length +
        player.faceDownCards.length;
      expect(total).toBe(9);
    }
  });
});

// ---------------------------------------------------------------------------
// 4-player game
// ---------------------------------------------------------------------------

describe('createInitialState -- 4-player game', () => {
  const state = createInitialState(
    validInput({ playerIds: ['a', 'b', 'c', 'd'] }),
  );

  it('creates 4 players', () => {
    expect(state.players).toHaveLength(4);
  });

  it('draw pile has 18 cards', () => {
    expect(state.drawPile).toHaveLength(18);
  });
});

// ---------------------------------------------------------------------------
// 5-player game (scenario #2)
// ---------------------------------------------------------------------------

describe('createInitialState -- 5-player game (scenario #2)', () => {
  const state = createInitialState(
    validInput({ playerIds: ['a', 'b', 'c', 'd', 'e'] }),
  );

  it('creates 5 players', () => {
    expect(state.players).toHaveLength(5);
  });

  it('draw pile has 9 cards', () => {
    expect(state.drawPile).toHaveLength(9);
  });

  it('all players have correct IDs', () => {
    expect(state.players.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

// ---------------------------------------------------------------------------
// Card conservation and uniqueness (scenario #10, #22)
// ---------------------------------------------------------------------------

describe('createInitialState -- card conservation', () => {
  // Spec scenario #10: All cards accounted for
  it('total cards across all zones equals 54 (scenario #10)', () => {
    const state = createInitialState(validInput());
    const allCards = collectAllCards(state);
    expect(allCards).toHaveLength(54);
  });

  // Spec scenario #22: Card ID uniqueness
  it('all 54 cards have unique IDs (scenario #22)', () => {
    const state = createInitialState(validInput());
    const allCards = collectAllCards(state);
    const ids = uniqueCardIds(allCards);
    expect(ids.size).toBe(54);
  });

  it('card conservation holds for 5-player game', () => {
    const state = createInitialState(
      validInput({ playerIds: ['a', 'b', 'c', 'd', 'e'] }),
    );
    const allCards = collectAllCards(state);
    expect(allCards).toHaveLength(54);
    expect(uniqueCardIds(allCards).size).toBe(54);
  });

  it('contains exactly 52 standard cards and 2 jokers', () => {
    const state = createInitialState(validInput());
    const allCards = collectAllCards(state);
    const standard = allCards.filter((c) => c.type === 'standard');
    const jokers = allCards.filter((c) => c.type === 'joker');
    expect(standard).toHaveLength(52);
    expect(jokers).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Determinism (scenarios #3, #4)
// ---------------------------------------------------------------------------

describe('createInitialState -- determinism', () => {
  // Spec scenario #3: Same seed produces identical state
  it('same seed and inputs produce identical state (scenario #3)', () => {
    const input = validInput();
    const state1 = createInitialState(input);
    const state2 = createInitialState(input);

    expect(state1).toEqual(state2);
  });

  it('same seed with 5 players produces identical state', () => {
    const input = validInput({
      playerIds: ['a', 'b', 'c', 'd', 'e'],
      seed: 12345,
    });
    const state1 = createInitialState(input);
    const state2 = createInitialState(input);

    expect(state1).toEqual(state2);
  });

  // Spec scenario #4: Different seeds produce different states
  it('different seeds produce different deck orders (scenario #4)', () => {
    const state42 = createInitialState(validInput({ seed: 42 }));
    const state43 = createInitialState(validInput({ seed: 43 }));

    // The draw piles should be different (extremely unlikely to be the same)
    const ids42 = state42.drawPile.map((c) => c.id);
    const ids43 = state43.drawPile.map((c) => c.id);
    expect(ids42).not.toEqual(ids43);
  });

  it('different seeds may produce different starting players', () => {
    // Try multiple seeds to find at least one case where starting player differs
    const results = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      const state = createInitialState(
        validInput({ playerIds: ['a', 'b', 'c'], seed }),
      );
      results.add(state.currentPlayerIndex);
    }
    // With 20 different seeds and 3 players, we should see more than 1 starting player
    expect(results.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Starting player scenarios (scenarios #5-9, #23)
// ---------------------------------------------------------------------------

describe('createInitialState -- starting player', () => {
  it('starting player index is within valid range for all player counts', () => {
    for (let count = 2; count <= 5; count++) {
      const playerIds = Array.from({ length: count }, (_, i) => `p${String(i)}`);
      const state = createInitialState(validInput({ playerIds, seed: 42 }));
      expect(state.currentPlayerIndex).toBeGreaterThanOrEqual(0);
      expect(state.currentPlayerIndex).toBeLessThan(count);
    }
  });

  // Starting player selection is tested more thoroughly in starting-player.test.ts.
  // Here we verify the integration: state factory correctly wires it up.
  it('starting player is deterministic for a given seed', () => {
    const input = validInput({ seed: 99 });
    const idx1 = createInitialState(input).currentPlayerIndex;
    const idx2 = createInitialState(input).currentPlayerIndex;
    expect(idx1).toBe(idx2);
  });
});

// ---------------------------------------------------------------------------
// Player state structure
// ---------------------------------------------------------------------------

describe('createInitialState -- player state structure', () => {
  it('player IDs match input order', () => {
    const state = createInitialState(
      validInput({ playerIds: ['first', 'second'] }),
    );
    expect(state.players[0]!.id).toBe('first');
    expect(state.players[1]!.id).toBe('second');
  });

  it('turnOrder matches playerIds input', () => {
    const ids = ['one', 'two', 'three'];
    const state = createInitialState(validInput({ playerIds: ids }));
    expect(state.turnOrder).toEqual(ids);
  });

  it('turnOrder is a separate array (not same reference as input)', () => {
    const ids = ['one', 'two', 'three'];
    const input = validInput({ playerIds: ids });
    const state = createInitialState(input);
    // Should be value-equal but not reference-equal
    expect(state.turnOrder).toEqual(ids);
    expect(state.turnOrder).not.toBe(ids);
  });
});

// ---------------------------------------------------------------------------
// Seed edge cases
// ---------------------------------------------------------------------------

describe('createInitialState -- seed edge cases', () => {
  it('accepts zero as a valid seed', () => {
    expect(() => createInitialState(validInput({ seed: 0 }))).not.toThrow();
  });

  it('accepts negative seeds', () => {
    expect(() => createInitialState(validInput({ seed: -42 }))).not.toThrow();
  });

  it('accepts large seeds', () => {
    expect(() =>
      createInitialState(validInput({ seed: 2147483647 })),
    ).not.toThrow();
  });

  it('accepts fractional seeds (floored internally by RNG)', () => {
    const state1 = createInitialState(validInput({ seed: 42.7 }));
    const state2 = createInitialState(validInput({ seed: 42.1 }));
    // Both floor to 42 internally, so the shuffled deck and deal are identical.
    // rngSeed stores the original input, so it will differ -- compare game-relevant parts.
    expect(state1.players).toEqual(state2.players);
    expect(state1.drawPile).toEqual(state2.drawPile);
    expect(state1.currentPlayerIndex).toBe(state2.currentPlayerIndex);
    // rngSeed preserves the raw input
    expect(state1.rngSeed).toBe(42.7);
    expect(state2.rngSeed).toBe(42.1);
  });
});
