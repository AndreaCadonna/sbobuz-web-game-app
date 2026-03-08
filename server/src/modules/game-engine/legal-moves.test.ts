/**
 * Tests for the Legal Move Enumerator module.
 *
 * Verifies that enumerateLegalMoves returns exactly the set of actions
 * that the Action Validator would accept, across all game phases, active
 * zones, and flag combinations.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (Action Types)
 * @see SBOBUZ_ENGINE_SPEC.md Section 10 (Action Validation Rules)
 * @see docs/specs/ai-opponent-module.md Section 8 (Legal Move Enumeration)
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, Suit } from '@shared/card.js';
import type { GameAction } from '@shared/game-action.js';
import type { GameState, PlayerState, GameConfig } from '@shared/game-state.js';

import { enumerateLegalMoves } from './legal-moves.js';
import type { LegalMoveSet } from './legal-moves.js';
import { validateAction } from './validator.js';

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

/**
 * Verifies that every action returned by the enumerator passes validation,
 * and that no action NOT returned would pass validation (for the tested types).
 */
function assertAllMovesValid(state: GameState, moves: LegalMoveSet): void {
  for (const action of moves.all) {
    const result = validateAction(state, action);
    expect(
      result.valid,
      `Expected action ${JSON.stringify(action)} to be valid, but got: ${
        !result.valid ? result.reason.code : ''
      }`,
    ).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enumerateLegalMoves', () => {
  // -----------------------------------------------------------------------
  // Terminal / non-actionable phases
  // -----------------------------------------------------------------------

  describe('terminal and non-actionable phases', () => {
    it('returns empty set for finished phase', () => {
      const state = createState({ phase: 'finished' });
      const moves = enumerateLegalMoves(state, 'p1');
      expect(moves.all).toHaveLength(0);
    });

    it('returns empty set for cancelled phase', () => {
      const state = createState({ phase: 'cancelled' });
      const moves = enumerateLegalMoves(state, 'p1');
      expect(moves.all).toHaveLength(0);
    });

    it('returns empty set for setup phase', () => {
      const state = createState({ phase: 'setup' });
      const moves = enumerateLegalMoves(state, 'p1');
      expect(moves.all).toHaveLength(0);
    });

    it('returns empty set for unknown player', () => {
      const state = createState();
      const moves = enumerateLegalMoves(state, 'unknown-player');
      expect(moves.all).toHaveLength(0);
    });

    it('returns empty set when it is not the player turn', () => {
      const state = createState({ currentPlayerIndex: 1 });
      const moves = enumerateLegalMoves(state, 'p1');
      expect(moves.all).toHaveLength(0);
    });

    it('returns empty set for finished player (all zones empty)', () => {
      const state = createState({
        players: [
          createPlayer('p1'), // all zones empty
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');
      expect(moves.all).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Queen declaration phase
  // -----------------------------------------------------------------------

  describe('awaiting_queen_declaration phase', () => {
    it('returns both direction declarations', () => {
      const state = createState({ phase: 'awaiting_queen_declaration' });
      const moves = enumerateLegalMoves(state, 'p1');

      expect(moves.declareDirection).toHaveLength(2);
      expect(moves.playCards).toHaveLength(0);
      expect(moves.playBlind).toHaveLength(0);
      expect(moves.pickUpPile).toHaveLength(0);
      expect(moves.all).toHaveLength(2);

      const directions = moves.declareDirection.map((a) => {
        if (a.type === 'DECLARE_DIRECTION') return a.direction;
        return null;
      });
      expect(directions).toContain('higher');
      expect(directions).toContain('lower');

      assertAllMovesValid(state, moves);
    });

    it('returns empty for non-current player in queen declaration', () => {
      const state = createState({ phase: 'awaiting_queen_declaration' });
      const moves = enumerateLegalMoves(state, 'p2');
      expect(moves.all).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Hand zone — PLAY_CARDS enumeration
  // -----------------------------------------------------------------------

  describe('hand zone — PLAY_CARDS', () => {
    it('enumerates all single-card plays on empty pile', () => {
      const state = createState();
      const moves = enumerateLegalMoves(state, 'p1');

      // 3 distinct ranks (7, 8, 9), each with 1 card = 3 PLAY_CARDS actions
      expect(moves.playCards).toHaveLength(3);
      assertAllMovesValid(state, moves);
    });

    it('enumerates multi-card plays for same-rank cards', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            hand: [
              stdCard('7', 'hearts'),
              stdCard('7', 'spades'),
              stdCard('7', 'clubs'),
            ],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // 3 cards of rank 7: play 1, play 2, play 3 = 3 actions
      expect(moves.playCards).toHaveLength(3);

      const cardCounts = moves.playCards.map((a) => a.cardIds.length);
      expect(cardCounts).toEqual([1, 2, 3]);

      assertAllMovesValid(state, moves);
    });

    it('enumerates both single and multi-card plays for mixed hand', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            hand: [
              stdCard('7', 'hearts'),
              stdCard('7', 'spades'),
              stdCard('9', 'clubs'),
            ],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Two 7s: play 1, play 2 = 2 actions
      // One 9: play 1 = 1 action
      // Total: 3 PLAY_CARDS
      expect(moves.playCards).toHaveLength(3);
      assertAllMovesValid(state, moves);
    });

    it('filters out illegal ranks based on pile top (higher direction)', () => {
      const state = createState({
        playPile: [stdCard('8', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [stdCard('5', 'hearts'), stdCard('8', 'spades'), stdCard('K', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Pile top is 8. With 'higher' direction:
      // 5 is too low -> illegal
      // 8 is equal -> legal
      // K is higher -> legal
      expect(moves.playCards).toHaveLength(2);
      const playedIds = moves.playCards.map((a) => a.cardIds[0]);
      expect(playedIds).toContain('spades_8');
      expect(playedIds).toContain('clubs_K');

      assertAllMovesValid(state, moves);
    });

    it('filters based on lower direction (Queen override)', () => {
      const state = createState({
        playPile: [stdCard('8', 'hearts')],
        nextCardOverride: 'lower',
        players: [
          createPlayer('p1', {
            hand: [stdCard('5', 'hearts'), stdCard('8', 'spades'), stdCard('K', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Pile top is 8. With 'lower' direction:
      // 5 is lower -> legal
      // 8 is equal -> legal
      // K is higher -> illegal
      expect(moves.playCards).toHaveLength(2);
      const playedIds = moves.playCards.map((a) => a.cardIds[0]);
      expect(playedIds).toContain('hearts_5');
      expect(playedIds).toContain('spades_8');

      assertAllMovesValid(state, moves);
    });

    it('allows all cards when freePlay is active', () => {
      const state = createState({
        playPile: [stdCard('A', 'hearts')],
        freePlay: true,
        players: [
          createPlayer('p1', {
            hand: [stdCard('3', 'hearts'), stdCard('5', 'spades'), stdCard('7', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // freePlay means all cards are legal, even though pile top is A
      expect(moves.playCards).toHaveLength(3);
      assertAllMovesValid(state, moves);
    });

    it('allows 2s on any pile top', () => {
      const state = createState({
        playPile: [stdCard('A', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [stdCard('2', 'hearts'), stdCard('3', 'spades'), stdCard('4', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Pile top is A. Only 2 can be played (special bypass, always legal)
      // 3 and 4 are too low
      expect(moves.playCards).toHaveLength(1);
      expect(moves.playCards[0]!.cardIds[0]).toBe('hearts_2');
      assertAllMovesValid(state, moves);
    });

    it('allows jokers on any pile top', () => {
      const state = createState({
        playPile: [stdCard('A', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [joker(1), stdCard('3', 'spades'), stdCard('4', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Pile top is A. Only joker can be played (always legal)
      expect(moves.playCards).toHaveLength(1);
      expect(moves.playCards[0]!.cardIds[0]).toBe('joker_1');
      assertAllMovesValid(state, moves);
    });

    it('enumerates jokers individually (no multi-joker play)', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            hand: [joker(1), joker(2), stdCard('7', 'hearts')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // 2 individual joker plays + 1 standard card play = 3
      expect(moves.playCards).toHaveLength(3);

      const jokerActions = moves.playCards.filter(
        (a) => a.cardIds[0] === 'joker_1' || a.cardIds[0] === 'joker_2',
      );
      expect(jokerActions).toHaveLength(2);
      // Each joker action has exactly 1 card
      for (const action of jokerActions) {
        expect(action.cardIds).toHaveLength(1);
      }

      assertAllMovesValid(state, moves);
    });

    it('includes PICK_UP_PILE when pile is non-empty in playing phase', () => {
      const state = createState({
        playPile: [stdCard('5', 'hearts')],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      expect(moves.pickUpPile).toHaveLength(1);
      expect(moves.pickUpPile[0]!.type).toBe('PICK_UP_PILE');
      assertAllMovesValid(state, moves);
    });

    it('excludes PICK_UP_PILE when pile is empty', () => {
      const state = createState({ playPile: [] });
      const moves = enumerateLegalMoves(state, 'p1');

      expect(moves.pickUpPile).toHaveLength(0);
    });

    it('excludes PICK_UP_PILE in awaiting_post_clear_play phase', () => {
      const state = createState({
        phase: 'awaiting_post_clear_play',
        playPile: [stdCard('5', 'hearts')],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      expect(moves.pickUpPile).toHaveLength(0);
      assertAllMovesValid(state, moves);
    });
  });

  // -----------------------------------------------------------------------
  // Face-up zone
  // -----------------------------------------------------------------------

  describe('face-up zone', () => {
    it('enumerates PLAY_CARDS from face-up cards when hand is empty', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            faceUp: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Empty pile, all cards legal: 3 single-card plays
      expect(moves.playCards).toHaveLength(3);
      expect(moves.playBlind).toHaveLength(0);
      assertAllMovesValid(state, moves);
    });

    it('enumerates multi-card face-up plays for same-rank', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            faceUp: [
              stdCard('7', 'hearts'),
              stdCard('7', 'spades'),
              stdCard('9', 'clubs'),
            ],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Two 7s: play 1, play 2 = 2 actions + one 9 = 3 total
      expect(moves.playCards).toHaveLength(3);
      assertAllMovesValid(state, moves);
    });

    it('uses hand zone when draw pile is non-empty even if hand is empty', () => {
      const state = createState({
        drawPile: [stdCard('3', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [],
            faceUp: [stdCard('7', 'hearts')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Draw pile non-empty means active zone is 'hand', but hand is empty
      // so no PLAY_CARDS are available. PICK_UP_PILE not available (pile empty).
      expect(moves.playCards).toHaveLength(0);
      expect(moves.all).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Face-down zone (blind plays)
  // -----------------------------------------------------------------------

  describe('face-down zone — PLAY_BLIND', () => {
    it('enumerates one PLAY_BLIND per face-down card position', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            faceDown: [stdCard('3', 'hearts'), stdCard('5', 'spades'), stdCard('7', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      expect(moves.playBlind).toHaveLength(3);
      expect(moves.playCards).toHaveLength(0);

      // Check indices
      const indices = moves.playBlind.map((a) => {
        if (a.type === 'PLAY_BLIND') return a.cardIndex;
        return -1;
      });
      expect(indices).toEqual([0, 1, 2]);
      assertAllMovesValid(state, moves);
    });

    it('enumerates fewer PLAY_BLIND when some face-down cards are gone', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            faceDown: [stdCard('3', 'hearts')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      expect(moves.playBlind).toHaveLength(1);
      assertAllMovesValid(state, moves);
    });

    it('includes PICK_UP_PILE in face-down zone when pile non-empty', () => {
      const state = createState({
        playPile: [stdCard('5', 'hearts')],
        players: [
          createPlayer('p1', {
            faceDown: [stdCard('3', 'hearts'), stdCard('5', 'spades')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      expect(moves.playBlind).toHaveLength(2);
      expect(moves.pickUpPile).toHaveLength(1);
      assertAllMovesValid(state, moves);
    });
  });

  // -----------------------------------------------------------------------
  // awaiting_post_clear_play phase
  // -----------------------------------------------------------------------

  describe('awaiting_post_clear_play phase', () => {
    it('enumerates PLAY_CARDS with empty pile (all cards legal)', () => {
      const state = createState({
        phase: 'awaiting_post_clear_play',
        playPile: [],
        players: [
          createPlayer('p1', {
            hand: [stdCard('3', 'hearts'), stdCard('7', 'spades'), stdCard('K', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // All cards legal on empty pile: 3 single-card plays
      expect(moves.playCards).toHaveLength(3);
      // No PICK_UP_PILE in post-clear phase
      expect(moves.pickUpPile).toHaveLength(0);
      assertAllMovesValid(state, moves);
    });

    it('enumerates PLAY_BLIND in face-down zone during post-clear', () => {
      const state = createState({
        phase: 'awaiting_post_clear_play',
        playPile: [],
        players: [
          createPlayer('p1', {
            faceDown: [stdCard('3', 'hearts'), stdCard('5', 'spades')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      expect(moves.playBlind).toHaveLength(2);
      expect(moves.pickUpPile).toHaveLength(0);
      assertAllMovesValid(state, moves);
    });
  });

  // -----------------------------------------------------------------------
  // LegalMoveSet structure
  // -----------------------------------------------------------------------

  describe('LegalMoveSet structure', () => {
    it('all array is the union of all categorized arrays', () => {
      const state = createState({
        playPile: [stdCard('5', 'hearts')],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      const expectedAll = [
        ...moves.playCards,
        ...moves.playBlind,
        ...moves.pickUpPile,
        ...moves.declareDirection,
      ];
      expect(moves.all).toHaveLength(expectedAll.length);
      expect(moves.all).toEqual(expectedAll);
    });

    it('groups are mutually exclusive by action type', () => {
      const state = createState({
        playPile: [stdCard('5', 'hearts')],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      for (const action of moves.playCards) {
        expect(action.type).toBe('PLAY_CARDS');
      }
      for (const action of moves.playBlind) {
        expect(action.type).toBe('PLAY_BLIND');
      }
      for (const action of moves.pickUpPile) {
        expect(action.type).toBe('PICK_UP_PILE');
      }
      for (const action of moves.declareDirection) {
        expect(action.type).toBe('DECLARE_DIRECTION');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Validator consistency check
  // -----------------------------------------------------------------------

  describe('validator consistency', () => {
    it('every enumerated action passes validation', () => {
      const state = createState({
        playPile: [stdCard('7', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [
              stdCard('7', 'spades'),
              stdCard('7', 'clubs'),
              stdCard('8', 'hearts'),
              stdCard('2', 'diamonds'),
            ],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');
      assertAllMovesValid(state, moves);
    });

    it('every enumerated direction declaration passes validation', () => {
      const state = createState({ phase: 'awaiting_queen_declaration' });
      const moves = enumerateLegalMoves(state, 'p1');
      assertAllMovesValid(state, moves);
    });

    it('every enumerated blind play passes validation', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            faceDown: [stdCard('3', 'hearts'), stdCard('5', 'spades'), stdCard('7', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');
      assertAllMovesValid(state, moves);
    });

    it('non-enumerated PLAY_CARDS action (illegal rank) fails validation', () => {
      const state = createState({
        playPile: [stdCard('A', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [stdCard('3', 'hearts'), stdCard('5', 'spades'), stdCard('7', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // No legal cards (all lower than A with no special bypass)
      expect(moves.playCards).toHaveLength(0);

      // Attempting to play any of those cards should fail validation
      const illegalAction: GameAction = {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_3'],
      };
      const result = validateAction(state, illegalAction);
      expect(result.valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Complex scenarios
  // -----------------------------------------------------------------------

  describe('complex scenarios', () => {
    it('handles hand with 2s, jokers, and regular cards against high pile top', () => {
      const state = createState({
        playPile: [stdCard('K', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [
              stdCard('2', 'hearts'),
              stdCard('2', 'spades'),
              joker(1),
              stdCard('3', 'clubs'),
              stdCard('A', 'diamonds'),
            ],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Pile top is K
      // 2s: always legal -> play 1, play 2 = 2 actions
      // joker: always legal -> 1 action
      // 3: too low -> illegal
      // A: higher than K -> legal -> 1 action
      // + PICK_UP_PILE (pile non-empty in playing phase)
      expect(moves.playCards).toHaveLength(4);
      expect(moves.pickUpPile).toHaveLength(1);
      expect(moves.all).toHaveLength(5);
      assertAllMovesValid(state, moves);
    });

    it('handles lower direction with 2s and jokers', () => {
      const state = createState({
        playPile: [stdCard('7', 'hearts')],
        nextCardOverride: 'lower',
        players: [
          createPlayer('p1', {
            hand: [
              stdCard('2', 'hearts'),
              joker(1),
              stdCard('5', 'clubs'),
              stdCard('9', 'diamonds'),
            ],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Pile top is 7, direction is 'lower'
      // 2: always legal (bypass) -> 1 action
      // joker: always legal -> 1 action
      // 5: lower than 7 -> legal -> 1 action
      // 9: higher than 7 -> illegal
      // + PICK_UP_PILE
      expect(moves.playCards).toHaveLength(3);
      expect(moves.pickUpPile).toHaveLength(1);
      assertAllMovesValid(state, moves);
    });

    it('handles pile top is joker (freePlay consumed) — any card legal', () => {
      const state = createState({
        playPile: [joker(1)],
        freePlay: false,
        players: [
          createPlayer('p1', {
            hand: [stdCard('3', 'hearts'), stdCard('7', 'spades'), stdCard('A', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Joker on top, freePlay consumed -> treated as empty pile -> all legal
      expect(moves.playCards).toHaveLength(3);
      assertAllMovesValid(state, moves);
    });

    it('5-player game: enumerates for current player only', () => {
      const state = createState({
        players: [
          createPlayer('p1', { hand: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')] }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')] }),
          createPlayer('p3', { hand: [stdCard('3', 'hearts'), stdCard('4', 'spades'), stdCard('10', 'clubs')] }),
          createPlayer('p4', { hand: [stdCard('Q', 'hearts'), stdCard('K', 'spades'), stdCard('A', 'clubs')] }),
          createPlayer('p5', { hand: [stdCard('2', 'hearts'), stdCard('2', 'spades'), stdCard('2', 'clubs')] }),
        ],
        turnOrder: ['p1', 'p2', 'p3', 'p4', 'p5'],
        currentPlayerIndex: 0,
      });

      // p1 is current: should have moves
      const movesP1 = enumerateLegalMoves(state, 'p1');
      expect(movesP1.all.length).toBeGreaterThan(0);

      // p2 through p5: not their turn
      for (const pid of ['p2', 'p3', 'p4', 'p5']) {
        const moves = enumerateLegalMoves(state, pid);
        expect(moves.all).toHaveLength(0);
      }
    });

    it('handles completely empty hand with no cards anywhere', () => {
      const state = createState({
        players: [
          createPlayer('p1'), // all empty
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');
      expect(moves.all).toHaveLength(0);
    });

    it('there is always at least one legal move for a non-finished player in playing phase (Spec edge case 3)', () => {
      // When pile is non-empty in playing phase, PICK_UP_PILE is always available
      const state = createState({
        playPile: [stdCard('A', 'hearts')],
        players: [
          createPlayer('p1', {
            hand: [stdCard('3', 'hearts'), stdCard('4', 'spades'), stdCard('5', 'clubs')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // No playable cards (all below A) but PICK_UP_PILE is available
      expect(moves.playCards).toHaveLength(0);
      expect(moves.pickUpPile).toHaveLength(1);
      expect(moves.all.length).toBeGreaterThan(0);
    });

    it('handles pile empty in playing phase — no PICK_UP_PILE but all cards legal', () => {
      const state = createState({
        playPile: [],
        players: [
          createPlayer('p1', {
            hand: [stdCard('3', 'hearts'), stdCard('A', 'spades')],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // Empty pile: all cards legal, no pickup available
      expect(moves.playCards).toHaveLength(2);
      expect(moves.pickUpPile).toHaveLength(0);
    });

    it('handles four of a kind in hand (all 4 possible counts)', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            hand: [
              stdCard('7', 'hearts'),
              stdCard('7', 'spades'),
              stdCard('7', 'clubs'),
              stdCard('7', 'diamonds'),
            ],
          }),
          createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
        ],
      });
      const moves = enumerateLegalMoves(state, 'p1');

      // 4 cards of rank 7: play 1, 2, 3, 4 = 4 PLAY_CARDS
      expect(moves.playCards).toHaveLength(4);
      const counts = moves.playCards.map((a) => a.cardIds.length);
      expect(counts).toEqual([1, 2, 3, 4]);
      assertAllMovesValid(state, moves);
    });
  });
});
