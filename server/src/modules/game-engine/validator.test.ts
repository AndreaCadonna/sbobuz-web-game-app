/**
 * Tests for the Action Validator module.
 *
 * Covers all 26 edge cases from the action-validator spec plus
 * additional tests for thoroughness.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 10 (Action Validation Rules)
 * @see docs/specs/engine/action-validator.md Section 5 (Edge Cases)
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, Suit } from '@shared/card.js';
import type { GameAction } from '@shared/game-action.js';
import type { GameState, PlayerState, GamePhase, GameConfig } from '@shared/game-state.js';

import { validateAction } from './validator.js';
import type { ValidationResult } from './validator.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a standard card with the given rank and suit. */
function stdCard(rank: Rank, suit: Suit): Card {
  return { type: 'standard', rank, suit, id: `${suit}_${rank}` };
}

/** Creates a joker card. */
function joker(n: 1 | 2): Card {
  return { type: 'joker', id: `joker_${String(n)}` as 'joker_1' | 'joker_2' };
}

const DEFAULT_CONFIG: GameConfig = {
  turnTimerSeconds: 30,
  disconnectGraceSeconds: 30,
  maxPlayers: 5,
  minPlayers: 2,
};

/** Creates a player state with specified cards. */
function createPlayer(
  id: string,
  opts: {
    hand?: ReadonlyArray<Card>;
    faceUp?: ReadonlyArray<Card>;
    faceDown?: ReadonlyArray<Card>;
  } = {},
): PlayerState {
  return {
    id,
    hand: opts.hand ?? [],
    faceUpCards: opts.faceUp ?? [],
    faceDownCards: opts.faceDown ?? [],
  };
}

/** Creates a minimal game state for testing. */
function createState(overrides: Partial<GameState> = {}): GameState {
  const defaults: GameState = {
    gameId: 'test-game',
    phase: 'playing',
    config: DEFAULT_CONFIG,
    drawPile: [],
    playPile: [],
    burnPile: [],
    players: [
      createPlayer('p1', {
        hand: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
      }),
      createPlayer('p2', {
        hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
      }),
    ],
    turnOrder: ['p1', 'p2'],
    currentPlayerIndex: 0,
    turnDirection: 1,
    freePlay: false,
    nextCardOverride: null,
    rngSeed: 42,
    actionCount: 0,
  };

  return { ...defaults, ...overrides };
}

/** Asserts a validation result is valid. */
function expectValid(result: ValidationResult): void {
  expect(result).toEqual({ valid: true });
}

/** Asserts a validation result is invalid with the given code. */
function expectInvalid(result: ValidationResult, expectedCode: string): void {
  expect(result.valid).toBe(false);
  if (!result.valid) {
    expect(result.reason.code).toBe(expectedCode);
  }
}

// ---------------------------------------------------------------------------
// Universal checks
// ---------------------------------------------------------------------------

describe('validateAction — Universal checks', () => {
  // Spec scenario #1: Play a card when game is finished
  it('rejects any action when game is finished (scenario #1)', () => {
    const state = createState({ phase: 'finished' });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectInvalid(validateAction(state, action), 'GAME_NOT_ACTIVE');
  });

  it('rejects any action when game is cancelled', () => {
    const state = createState({ phase: 'cancelled' });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectInvalid(validateAction(state, action), 'GAME_NOT_ACTIVE');
  });

  // Spec scenario #20: Cancel game when game is already finished
  it('allows CANCEL_GAME even when game is finished (scenario #20)', () => {
    const state = createState({ phase: 'finished' });
    const action: GameAction = { type: 'CANCEL_GAME', reason: 'admin' };
    expectValid(validateAction(state, action));
  });

  it('allows CANCEL_GAME when game is cancelled', () => {
    const state = createState({ phase: 'cancelled' });
    const action: GameAction = { type: 'CANCEL_GAME', reason: 'admin' };
    expectValid(validateAction(state, action));
  });

  it('allows CANCEL_GAME in any phase', () => {
    for (const phase of ['setup', 'playing', 'awaiting_queen_declaration', 'awaiting_post_clear_play', 'finished', 'cancelled'] as GamePhase[]) {
      const state = createState({ phase });
      const action: GameAction = { type: 'CANCEL_GAME', reason: 'admin' };
      expectValid(validateAction(state, action));
    }
  });

  it('rejects action from unknown player', () => {
    const state = createState();
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'unknown', cardIds: ['hearts_7'] };
    expectInvalid(validateAction(state, action), 'PLAYER_NOT_FOUND');
  });

  // Spec scenario #2: Play a card when it is not your turn
  it('rejects action from wrong player (scenario #2)', () => {
    const state = createState({ currentPlayerIndex: 0 });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p2', cardIds: ['hearts_5'] };
    expectInvalid(validateAction(state, action), 'NOT_YOUR_TURN');
  });

  // Spec scenario #22: Player who has finished tries to play
  it('rejects action from finished player (scenario #22)', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [], faceDown: [] }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
      currentPlayerIndex: 0,
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: [] };
    expectInvalid(validateAction(state, action), 'PLAYER_FINISHED');
  });

  it('skips turn check for TIMEOUT_FORFEIT', () => {
    const state = createState({ currentPlayerIndex: 0 });
    // TIMEOUT_FORFEIT from a non-current player -- should pass turn check
    // but still needs to pass phase check
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p2' };
    // p2 exists, game is active, phase is playing -- should pass
    expectValid(validateAction(state, action));
  });

  it('skips finished check for TIMEOUT_FORFEIT', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [], faceDown: [] }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts')],
        }),
      ],
      currentPlayerIndex: 0,
    });
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p1' };
    expectValid(validateAction(state, action));
  });
});

// ---------------------------------------------------------------------------
// Phase checks
// ---------------------------------------------------------------------------

describe('validateAction — Phase checks', () => {
  // Spec scenario #8: Play a card during 'awaiting_queen_declaration' phase
  it('rejects PLAY_CARDS during awaiting_queen_declaration (scenario #8)', () => {
    const state = createState({ phase: 'awaiting_queen_declaration' });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectInvalid(validateAction(state, action), 'WRONG_PHASE');
  });

  // Spec scenario #9: Declare direction during 'playing' phase
  it('rejects DECLARE_DIRECTION during playing phase (scenario #9)', () => {
    const state = createState({ phase: 'playing' });
    const action: GameAction = { type: 'DECLARE_DIRECTION', playerId: 'p1', direction: 'higher' };
    expectInvalid(validateAction(state, action), 'WRONG_PHASE');
  });

  // Spec scenario #13: Play cards during awaiting_post_clear_play
  it('allows PLAY_CARDS during awaiting_post_clear_play (scenario #13)', () => {
    const state = createState({ phase: 'awaiting_post_clear_play' });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectValid(validateAction(state, action));
  });

  it('rejects PICK_UP_PILE during awaiting_queen_declaration', () => {
    const state = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
    });
    const action: GameAction = { type: 'PICK_UP_PILE', playerId: 'p1' };
    expectInvalid(validateAction(state, action), 'WRONG_PHASE');
  });

  it('rejects PICK_UP_PILE during awaiting_post_clear_play', () => {
    const state = createState({
      phase: 'awaiting_post_clear_play',
      playPile: [stdCard('7', 'hearts')],
    });
    const action: GameAction = { type: 'PICK_UP_PILE', playerId: 'p1' };
    expectInvalid(validateAction(state, action), 'WRONG_PHASE');
  });

  it('allows PLAY_BLIND during awaiting_post_clear_play', () => {
    const state = createState({
      phase: 'awaiting_post_clear_play',
      players: [
        createPlayer('p1', { hand: [], faceUp: [], faceDown: [stdCard('7', 'hearts')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_BLIND', playerId: 'p1', cardIndex: 0 };
    expectValid(validateAction(state, action));
  });

  it('allows TIMEOUT_FORFEIT during awaiting_queen_declaration', () => {
    const state = createState({ phase: 'awaiting_queen_declaration' });
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p1' };
    expectValid(validateAction(state, action));
  });

  it('allows TIMEOUT_FORFEIT during awaiting_post_clear_play', () => {
    const state = createState({ phase: 'awaiting_post_clear_play' });
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p1' };
    expectValid(validateAction(state, action));
  });

  it('rejects TIMEOUT_FORFEIT during setup phase', () => {
    const state = createState({ phase: 'setup' });
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p1' };
    expectInvalid(validateAction(state, action), 'WRONG_PHASE');
  });

  it('rejects PLAY_CARDS during setup phase', () => {
    const state = createState({ phase: 'setup' });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectInvalid(validateAction(state, action), 'WRONG_PHASE');
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS validation
// ---------------------------------------------------------------------------

describe('validateAction — PLAY_CARDS', () => {
  // Spec scenario #21: Play empty card list
  it('rejects empty card list (scenario #21)', () => {
    const state = createState();
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: [] };
    expectInvalid(validateAction(state, action), 'EMPTY_CARD_LIST');
  });

  // Spec scenario #3: Play a card not in your hand
  it('rejects card not in active zone (scenario #3)', () => {
    const state = createState();
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['diamonds_A'] };
    expectInvalid(validateAction(state, action), 'CARDS_NOT_IN_ZONE');
  });

  // Spec scenario #4: Play two cards of different ranks
  it('rejects cards of different ranks (scenario #4)', () => {
    const state = createState();
    const action: GameAction = {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7', 'spades_8'],
    };
    expectInvalid(validateAction(state, action), 'CARDS_NOT_SAME_RANK');
  });

  // Spec scenario #5: Play a 5 on a 7 (rank too low)
  it('rejects card with rank too low (scenario #5)', () => {
    const state = createState({
      currentPlayerIndex: 1,
      playPile: [stdCard('7', 'hearts')],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p2', cardIds: ['hearts_5'] };
    expectInvalid(validateAction(state, action), 'CARD_NOT_LEGAL');
  });

  // Spec scenario #6: Play a 2 on any card
  it('allows 2 on any card (scenario #6)', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [stdCard('2', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
      playPile: [stdCard('A', 'spades')],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_2'] };
    expectValid(validateAction(state, action));
  });

  // Spec scenario #7: Play a Joker on any card
  it('allows Joker on any card (scenario #7)', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [joker(1), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
      playPile: [stdCard('A', 'spades')],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['joker_1'] };
    expectValid(validateAction(state, action));
  });

  // Spec scenario #17: Play a card with freePlay active
  it('allows any card when freePlay is active (scenario #17)', () => {
    const state = createState({
      freePlay: true,
      playPile: [stdCard('A', 'spades')],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectValid(validateAction(state, action));
  });

  // Spec scenario #18: Play K on Q with 'lower' override
  it('rejects K on Q with lower override (scenario #18)', () => {
    const state = createState({
      nextCardOverride: 'lower',
      playPile: [stdCard('Q', 'hearts')],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['clubs_9'] };
    // 9 ordinal 7, Q ordinal 10 => 7 < 10 => rank lower or equal => valid!
    // Wait, we need to test K specifically
    const state2 = createState({
      nextCardOverride: 'lower',
      playPile: [stdCard('Q', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('K', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action2: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_K'] };
    expectInvalid(validateAction(state2, action2), 'CARD_NOT_LEGAL');
  });

  // Spec scenario #19: Play J on Q with 'lower' override
  it('allows J on Q with lower override (scenario #19)', () => {
    const state = createState({
      nextCardOverride: 'lower',
      playPile: [stdCard('Q', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('J', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_J'] };
    expectValid(validateAction(state, action));
  });

  // Spec scenario #23: Play two Jokers together
  it('rejects two Jokers played together (scenario #23)', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [joker(1), joker(2), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['joker_1', 'joker_2'] };
    expectInvalid(validateAction(state, action), 'CARDS_NOT_SAME_RANK');
  });

  // Spec scenario #24: PLAY_CARDS from faceDown zone
  it('rejects PLAY_CARDS from faceDown zone (scenario #24)', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [], faceDown: [stdCard('7', 'hearts')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectInvalid(validateAction(state, action), 'CARDS_NOT_IN_ZONE');
  });

  // Spec scenario #25: Play face-up card when active zone is face-up
  it('allows playing face-up card when zone is faceUp (scenario #25)', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [stdCard('7', 'hearts')], faceDown: [stdCard('3', 'clubs')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectValid(validateAction(state, action));
  });

  // Spec scenario #26: Play multiple same-rank face-up cards
  it('allows multiple same-rank face-up cards (scenario #26)', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), stdCard('7', 'clubs')],
          faceDown: [stdCard('3', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7', 'diamonds_7', 'clubs_7'],
    };
    expectValid(validateAction(state, action));
  });

  it('allows playing on empty pile', () => {
    const state = createState({ playPile: [] });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectValid(validateAction(state, action));
  });

  it('allows playing equal rank card', () => {
    const state = createState({ playPile: [stdCard('7', 'diamonds')] });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectValid(validateAction(state, action));
  });

  it('allows playing higher rank card', () => {
    const state = createState({ playPile: [stdCard('5', 'diamonds')] });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectValid(validateAction(state, action));
  });

  it('allows playing multiple same-rank hand cards', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7', 'diamonds_7'],
    };
    expectValid(validateAction(state, action));
  });

  it('uses hand zone when draw pile is not empty', () => {
    const state = createState({
      drawPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts')],
          faceUp: [stdCard('8', 'spades')],
          faceDown: [stdCard('3', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectValid(validateAction(state, action));
  });
});

// ---------------------------------------------------------------------------
// PLAY_BLIND validation
// ---------------------------------------------------------------------------

describe('validateAction — PLAY_BLIND', () => {
  // Spec scenario #11: Blind play from hand zone
  it('rejects blind play when not in faceDown zone (scenario #11)', () => {
    const state = createState();
    const action: GameAction = { type: 'PLAY_BLIND', playerId: 'p1', cardIndex: 0 };
    expectInvalid(validateAction(state, action), 'NOT_IN_FACEDOWN_ZONE');
  });

  // Spec scenario #12: Blind play with index out of bounds
  it('rejects blind play with index out of bounds (scenario #12)', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [], faceDown: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_BLIND', playerId: 'p1', cardIndex: 5 };
    expectInvalid(validateAction(state, action), 'CARD_INDEX_OUT_OF_BOUNDS');
  });

  it('rejects blind play with negative index', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [], faceDown: [stdCard('7', 'hearts')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_BLIND', playerId: 'p1', cardIndex: -1 };
    expectInvalid(validateAction(state, action), 'CARD_INDEX_OUT_OF_BOUNDS');
  });

  it('allows valid blind play', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [], faceDown: [stdCard('7', 'hearts'), stdCard('8', 'spades')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_BLIND', playerId: 'p1', cardIndex: 0 };
    expectValid(validateAction(state, action));
  });

  it('allows blind play with index at boundary', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [], faceDown: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_BLIND', playerId: 'p1', cardIndex: 2 };
    expectValid(validateAction(state, action));
  });

  it('rejects blind play from faceUp zone', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [], faceUp: [stdCard('7', 'hearts')], faceDown: [stdCard('8', 'spades')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_BLIND', playerId: 'p1', cardIndex: 0 };
    expectInvalid(validateAction(state, action), 'NOT_IN_FACEDOWN_ZONE');
  });
});

// ---------------------------------------------------------------------------
// PICK_UP_PILE validation
// ---------------------------------------------------------------------------

describe('validateAction — PICK_UP_PILE', () => {
  // Spec scenario #10: Pick up empty pile
  it('rejects picking up empty pile (scenario #10)', () => {
    const state = createState({ playPile: [] });
    const action: GameAction = { type: 'PICK_UP_PILE', playerId: 'p1' };
    expectInvalid(validateAction(state, action), 'PILE_EMPTY');
  });

  it('allows picking up non-empty pile', () => {
    const state = createState({ playPile: [stdCard('7', 'hearts')] });
    const action: GameAction = { type: 'PICK_UP_PILE', playerId: 'p1' };
    expectValid(validateAction(state, action));
  });

  it('allows picking up pile with multiple cards', () => {
    const state = createState({
      playPile: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
    });
    const action: GameAction = { type: 'PICK_UP_PILE', playerId: 'p1' };
    expectValid(validateAction(state, action));
  });
});

// ---------------------------------------------------------------------------
// DECLARE_DIRECTION validation
// ---------------------------------------------------------------------------

describe('validateAction — DECLARE_DIRECTION', () => {
  const queenState = createState({
    phase: 'awaiting_queen_declaration',
    playPile: [stdCard('Q', 'hearts')],
  });

  // Spec scenario #14: Declare 'higher'
  it('allows declaring higher (scenario #14)', () => {
    const action: GameAction = { type: 'DECLARE_DIRECTION', playerId: 'p1', direction: 'higher' };
    expectValid(validateAction(queenState, action));
  });

  // Spec scenario #15: Declare 'lower'
  it('allows declaring lower (scenario #15)', () => {
    const action: GameAction = { type: 'DECLARE_DIRECTION', playerId: 'p1', direction: 'lower' };
    expectValid(validateAction(queenState, action));
  });

  // Spec scenario #16: Declare invalid direction
  it('rejects invalid direction (scenario #16)', () => {
    // Force an invalid direction value through type assertion for testing
    const action: GameAction = {
      type: 'DECLARE_DIRECTION',
      playerId: 'p1',
      direction: 'sideways' as 'higher' | 'lower',
    };
    expectInvalid(validateAction(queenState, action), 'INVALID_DIRECTION');
  });

  it('rejects declaration from wrong player', () => {
    const action: GameAction = { type: 'DECLARE_DIRECTION', playerId: 'p2', direction: 'higher' };
    expectInvalid(validateAction(queenState, action), 'NOT_YOUR_TURN');
  });

  it('rejects declaration in wrong phase', () => {
    const state = createState({ phase: 'playing' });
    const action: GameAction = { type: 'DECLARE_DIRECTION', playerId: 'p1', direction: 'higher' };
    expectInvalid(validateAction(state, action), 'WRONG_PHASE');
  });
});

// ---------------------------------------------------------------------------
// TIMEOUT_FORFEIT validation
// ---------------------------------------------------------------------------

describe('validateAction — TIMEOUT_FORFEIT', () => {
  it('accepts TIMEOUT_FORFEIT during playing phase', () => {
    const state = createState({ phase: 'playing' });
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p1' };
    expectValid(validateAction(state, action));
  });

  it('accepts TIMEOUT_FORFEIT during awaiting_queen_declaration', () => {
    const state = createState({ phase: 'awaiting_queen_declaration' });
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p1' };
    expectValid(validateAction(state, action));
  });

  it('accepts TIMEOUT_FORFEIT during awaiting_post_clear_play', () => {
    const state = createState({ phase: 'awaiting_post_clear_play' });
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p1' };
    expectValid(validateAction(state, action));
  });

  it('rejects TIMEOUT_FORFEIT during setup', () => {
    const state = createState({ phase: 'setup' });
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'p1' };
    expectInvalid(validateAction(state, action), 'WRONG_PHASE');
  });

  it('rejects TIMEOUT_FORFEIT for unknown player', () => {
    const state = createState();
    const action: GameAction = { type: 'TIMEOUT_FORFEIT', playerId: 'unknown' };
    expectInvalid(validateAction(state, action), 'PLAYER_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// CANCEL_GAME validation
// ---------------------------------------------------------------------------

describe('validateAction — CANCEL_GAME', () => {
  it('always valid regardless of phase', () => {
    const phases: GamePhase[] = [
      'setup', 'playing', 'awaiting_queen_declaration',
      'awaiting_post_clear_play', 'finished', 'cancelled',
    ];
    for (const phase of phases) {
      const state = createState({ phase });
      const action: GameAction = { type: 'CANCEL_GAME', reason: 'disconnect_timeout', disconnectedPlayerId: 'p1' };
      expectValid(validateAction(state, action));
    }
  });

  it('allows admin cancel', () => {
    const state = createState();
    const action: GameAction = { type: 'CANCEL_GAME', reason: 'admin' };
    expectValid(validateAction(state, action));
  });
});

// ---------------------------------------------------------------------------
// Compound / integration scenarios
// ---------------------------------------------------------------------------

describe('validateAction — Compound scenarios', () => {
  it('checks card legality with pile top context', () => {
    // Play 3 on pile with 10 on top -- should fail (rank too low)
    const state = createState({
      playPile: [stdCard('10', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('3', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_3'] };
    expectInvalid(validateAction(state, action), 'CARD_NOT_LEGAL');
  });

  it('allows playing on pile with Joker on top (treated as empty)', () => {
    const state = createState({
      playPile: [joker(1)],
      players: [
        createPlayer('p1', {
          hand: [stdCard('3', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_3'] };
    expectValid(validateAction(state, action));
  });

  it('checks legality with lower override and pile top', () => {
    // Queen override lower, pile top is 8, play 9 -- should fail (9 > 8)
    const state = createState({
      nextCardOverride: 'lower',
      playPile: [stdCard('8', 'hearts')],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['clubs_9'] };
    expectInvalid(validateAction(state, action), 'CARD_NOT_LEGAL');
  });

  it('allows lower card with lower override', () => {
    // Queen override lower, pile top is 9, play 7 -- should pass (7 < 9)
    const state = createState({
      nextCardOverride: 'lower',
      playPile: [stdCard('9', 'hearts')],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    expectValid(validateAction(state, action));
  });

  it('2 is always legal even with lower override', () => {
    const state = createState({
      nextCardOverride: 'lower',
      playPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('2', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_2'] };
    expectValid(validateAction(state, action));
  });

  it('handles active zone correctly with non-empty draw pile', () => {
    // Player has empty hand but draw pile is non-empty -> active zone is 'hand'
    // So PLAY_CARDS should fail because no cards in hand
    const state = createState({
      drawPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [stdCard('7', 'hearts')],
          faceDown: [stdCard('3', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });
    const action: GameAction = { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] };
    // Zone is 'hand' because draw pile is not empty, but hearts_7 is in faceUp, not hand
    expectInvalid(validateAction(state, action), 'CARDS_NOT_IN_ZONE');
  });
});
