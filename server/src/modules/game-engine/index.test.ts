/**
 * Tests for the Game Engine Module Interface (index.ts).
 *
 * Focuses on the processAction() composed function that validates
 * then reduces in one step, and verifies that all public exports
 * are accessible.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 19 (Integration Points)
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, Suit } from '@shared/card.js';
import type { GameAction } from '@shared/game-action.js';
import type { GameState, PlayerState, GameConfig } from '@shared/game-state.js';

import {
  processAction,
  createGame,
  enumerateLegalMoves,
  sanitizeStateForPlayer,
  validateAction,
  reduce,
  getActiveZone,
  getActiveZoneCards,
  checkWinCondition,
  checkAnyWinner,
  checkSbobuz,
  advanceTurn,
  isCardLegal,
  compareRanks,
  rankToOrdinal,
  RANK_ORDER,
} from './index.js';

import type {
  ProcessActionResult,
  CreateGameInput,
  LegalMoveSet,
  SanitizedGameState,
  SanitizedPlayerState,
  ValidationResult,
  ValidationError,
  ValidationErrorCode,
  ReducerResult,
  GameEvent,
  WinCheckResult,
  ComparisonContext,
  ComparisonResult,
} from './index.js';

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

// ---------------------------------------------------------------------------
// processAction tests
// ---------------------------------------------------------------------------

describe('processAction', () => {
  describe('valid actions', () => {
    it('accepts a valid PLAY_CARDS action and returns new state', () => {
      const state = createState();
      const action: GameAction = {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      };

      const result = processAction(state, action);

      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.newState).toBeDefined();
        expect(result.events).toBeDefined();
        expect(result.events.length).toBeGreaterThan(0);
        // Card should be on the pile
        expect(result.newState.playPile.length).toBe(1);
        // Turn should have advanced
        expect(result.newState.actionCount).toBe(1);
      }
    });

    it('accepts a valid PICK_UP_PILE action', () => {
      const state = createState({
        playPile: [stdCard('5', 'hearts')],
      });
      const action: GameAction = {
        type: 'PICK_UP_PILE',
        playerId: 'p1',
      };

      const result = processAction(state, action);

      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.newState.playPile).toHaveLength(0);
        // Pile card should be in player's hand
        const p1 = result.newState.players.find((p) => p.id === 'p1')!;
        expect(p1.hand.length).toBe(4); // 3 original + 1 from pile
      }
    });

    it('accepts a valid CANCEL_GAME action', () => {
      const state = createState();
      const action: GameAction = {
        type: 'CANCEL_GAME',
        reason: 'admin',
      };

      const result = processAction(state, action);

      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.newState.phase).toBe('cancelled');
      }
    });

    it('accepts DECLARE_DIRECTION in queen declaration phase', () => {
      const state = createState({
        phase: 'awaiting_queen_declaration',
        playPile: [stdCard('Q', 'hearts')],
      });
      const action: GameAction = {
        type: 'DECLARE_DIRECTION',
        playerId: 'p1',
        direction: 'lower',
      };

      const result = processAction(state, action);

      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.newState.nextCardOverride).toBe('lower');
        expect(result.newState.phase).toBe('playing');
      }
    });
  });

  describe('invalid actions', () => {
    it('rejects action for wrong player turn', () => {
      const state = createState();
      const action: GameAction = {
        type: 'PLAY_CARDS',
        playerId: 'p2',
        cardIds: ['hearts_5'],
      };

      const result = processAction(state, action);

      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.error.code).toBe('NOT_YOUR_TURN');
      }
    });

    it('rejects illegal card play', () => {
      const state = createState({
        playPile: [stdCard('A', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [stdCard('3', 'hearts'), stdCard('4', 'spades'), stdCard('5', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const action: GameAction = {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_3'],
      };

      const result = processAction(state, action);

      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.error.code).toBe('CARD_NOT_LEGAL');
      }
    });

    it('rejects PICK_UP_PILE on empty pile', () => {
      const state = createState({ playPile: [] });
      const action: GameAction = {
        type: 'PICK_UP_PILE',
        playerId: 'p1',
      };

      const result = processAction(state, action);

      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.error.code).toBe('PILE_EMPTY');
      }
    });

    it('rejects action on finished game', () => {
      const state = createState({ phase: 'finished' });
      const action: GameAction = {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      };

      const result = processAction(state, action);

      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.error.code).toBe('GAME_NOT_ACTIVE');
      }
    });
  });

  describe('does not mutate input state', () => {
    it('original state is unchanged after processing', () => {
      const state = createState();
      const originalJson = JSON.stringify(state);

      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      });

      expect(JSON.stringify(state)).toBe(originalJson);
    });
  });

  describe('events are emitted correctly', () => {
    it('emits CARDS_PLAYED and TURN_ADVANCED for a normal play', () => {
      const state = createState();
      const result = processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      });

      expect(result.accepted).toBe(true);
      if (result.accepted) {
        const eventTypes = result.events.map((e) => e.type);
        expect(eventTypes).toContain('CARDS_PLAYED');
        expect(eventTypes).toContain('TURN_ADVANCED');
      }
    });

    it('emits GAME_CANCELLED for CANCEL_GAME', () => {
      const state = createState();
      const result = processAction(state, {
        type: 'CANCEL_GAME',
        reason: 'disconnect_timeout',
      });

      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.events[0]!.type).toBe('GAME_CANCELLED');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: processAction + enumerateLegalMoves consistency
// ---------------------------------------------------------------------------

describe('processAction + enumerateLegalMoves consistency', () => {
  it('every enumerated legal move is accepted by processAction', () => {
    const state = createState({
      playPile: [stdCard('7', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [
            stdCard('7', 'spades'),
            stdCard('7', 'clubs'),
            stdCard('8', 'hearts'),
            stdCard('2', 'diamonds'),
            joker(1),
          ],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const moves = enumerateLegalMoves(state, 'p1');

    for (const action of moves.all) {
      const result = processAction(state, action);
      expect(
        result.accepted,
        `Expected action ${JSON.stringify(action)} to be accepted`,
      ).toBe(true);
    }
  });

  it('processAction rejects actions not in the enumerated set (illegal rank)', () => {
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('3', 'hearts'), stdCard('5', 'spades')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const moves = enumerateLegalMoves(state, 'p1');
    // Only PICK_UP_PILE should be legal (no playable cards)
    expect(moves.playCards).toHaveLength(0);

    const illegalResult = processAction(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_3'],
    });
    expect(illegalResult.accepted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: createGame
// ---------------------------------------------------------------------------

describe('createGame', () => {
  it('creates a valid initial state', () => {
    const input: CreateGameInput = {
      gameId: 'game-test',
      playerIds: ['alice', 'bob'],
      seed: 42,
      config: DEFAULT_CONFIG,
    };

    const state = createGame(input);

    expect(state.gameId).toBe('game-test');
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(2);
    expect(state.drawPile.length).toBe(36); // 54 - 18 dealt
    expect(state.playPile).toHaveLength(0);
    expect(state.actionCount).toBe(0);
  });

  it('the created game state can be processed with actions', () => {
    const input: CreateGameInput = {
      gameId: 'game-test',
      playerIds: ['alice', 'bob'],
      seed: 42,
      config: DEFAULT_CONFIG,
    };

    const state = createGame(input);
    const currentPlayerId = state.turnOrder[state.currentPlayerIndex]!;
    const moves = enumerateLegalMoves(state, currentPlayerId);

    // Should always have at least one legal move
    expect(moves.all.length).toBeGreaterThan(0);

    // Process the first legal move
    const result = processAction(state, moves.all[0]!);
    expect(result.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: sanitizeStateForPlayer
// ---------------------------------------------------------------------------

describe('sanitizeStateForPlayer via module interface', () => {
  it('sanitizes a game state created by createGame', () => {
    const input: CreateGameInput = {
      gameId: 'game-test',
      playerIds: ['alice', 'bob'],
      seed: 42,
      config: DEFAULT_CONFIG,
    };

    const state = createGame(input);
    const sanitized = sanitizeStateForPlayer(state, 'alice');

    // Alice sees her own hand
    const alice = sanitized.players.find((p) => p.id === 'alice')!;
    expect(alice.hand).not.toBeNull();
    expect(alice.handCount).toBe(3);

    // Bob's hand is hidden
    const bob = sanitized.players.find((p) => p.id === 'bob')!;
    expect(bob.hand).toBeNull();
    expect(bob.handCount).toBe(3);

    // Draw pile is count only
    expect(sanitized.drawPileCount).toBe(36);
  });
});

// ---------------------------------------------------------------------------
// Module export verification
// ---------------------------------------------------------------------------

describe('module exports', () => {
  it('exports processAction as a function', () => {
    expect(typeof processAction).toBe('function');
  });

  it('exports createGame as a function', () => {
    expect(typeof createGame).toBe('function');
  });

  it('exports enumerateLegalMoves as a function', () => {
    expect(typeof enumerateLegalMoves).toBe('function');
  });

  it('exports sanitizeStateForPlayer as a function', () => {
    expect(typeof sanitizeStateForPlayer).toBe('function');
  });

  it('exports validateAction as a function', () => {
    expect(typeof validateAction).toBe('function');
  });

  it('exports reduce as a function', () => {
    expect(typeof reduce).toBe('function');
  });

  it('exports getActiveZone as a function', () => {
    expect(typeof getActiveZone).toBe('function');
  });

  it('exports getActiveZoneCards as a function', () => {
    expect(typeof getActiveZoneCards).toBe('function');
  });

  it('exports checkWinCondition as a function', () => {
    expect(typeof checkWinCondition).toBe('function');
  });

  it('exports checkAnyWinner as a function', () => {
    expect(typeof checkAnyWinner).toBe('function');
  });

  it('exports checkSbobuz as a function', () => {
    expect(typeof checkSbobuz).toBe('function');
  });

  it('exports advanceTurn as a function', () => {
    expect(typeof advanceTurn).toBe('function');
  });

  it('exports isCardLegal as a function', () => {
    expect(typeof isCardLegal).toBe('function');
  });

  it('exports compareRanks as a function', () => {
    expect(typeof compareRanks).toBe('function');
  });

  it('exports rankToOrdinal as a function', () => {
    expect(typeof rankToOrdinal).toBe('function');
  });

  it('exports RANK_ORDER as an array', () => {
    expect(Array.isArray(RANK_ORDER)).toBe(true);
    expect(RANK_ORDER).toHaveLength(13);
  });
});
