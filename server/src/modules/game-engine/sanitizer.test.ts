/**
 * Tests for the State Sanitizer module.
 *
 * Verifies that sanitizeStateForPlayer correctly hides private information
 * and preserves public information for the specified viewing player.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 18 (Client-Server Contract)
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, Suit } from '@shared/card.js';
import type { GameState, PlayerState, GameConfig } from '@shared/game-state.js';

import { sanitizeStateForPlayer } from './sanitizer.js';
import type { SanitizedGameState, SanitizedPlayerState } from './sanitizer.js';

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

/** Creates a full game state for testing. */
function createState(overrides: Partial<GameState> = {}): GameState {
  const defaults: GameState = {
    gameId: 'test-game-123',
    phase: 'playing',
    config: DEFAULT_CONFIG,
    drawPile: [stdCard('3', 'hearts'), stdCard('4', 'spades'), stdCard('5', 'clubs')],
    playPile: [stdCard('7', 'hearts'), stdCard('8', 'spades')],
    burnPile: [stdCard('K', 'clubs')],
    players: [
      createPlayer('p1', {
        hand: [stdCard('9', 'hearts'), stdCard('10', 'spades'), stdCard('J', 'clubs')],
        faceUp: [stdCard('Q', 'hearts'), stdCard('A', 'spades')],
        faceDown: [stdCard('2', 'clubs'), stdCard('6', 'diamonds'), stdCard('7', 'diamonds')],
      }),
      createPlayer('p2', {
        hand: [stdCard('3', 'diamonds'), stdCard('5', 'diamonds'), stdCard('8', 'diamonds')],
        faceUp: [stdCard('4', 'clubs'), stdCard('6', 'spades')],
        faceDown: [stdCard('9', 'diamonds'), stdCard('10', 'clubs')],
      }),
    ],
    turnOrder: ['p1', 'p2'],
    currentPlayerIndex: 0,
    turnDirection: 1,
    freePlay: false,
    nextCardOverride: null,
    rngSeed: 42,
    actionCount: 5,
  };

  return { ...defaults, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sanitizeStateForPlayer', () => {
  // -----------------------------------------------------------------------
  // Own hand visibility
  // -----------------------------------------------------------------------

  describe('own hand visibility', () => {
    it('viewing player can see their own hand cards', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      const p1 = sanitized.players.find((p) => p.id === 'p1');
      expect(p1).toBeDefined();
      expect(p1!.hand).not.toBeNull();
      expect(p1!.hand).toEqual(state.players[0]!.hand);
    });

    it('viewing player hand count matches hand array length', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      const p1 = sanitized.players.find((p) => p.id === 'p1');
      expect(p1!.handCount).toBe(3);
      expect(p1!.hand!.length).toBe(p1!.handCount);
    });
  });

  // -----------------------------------------------------------------------
  // Other players' hand hiding
  // -----------------------------------------------------------------------

  describe('other players hand hiding', () => {
    it('other players hands are null', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      const p2 = sanitized.players.find((p) => p.id === 'p2');
      expect(p2).toBeDefined();
      expect(p2!.hand).toBeNull();
    });

    it('other players hand count is correct', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      const p2 = sanitized.players.find((p) => p.id === 'p2');
      expect(p2!.handCount).toBe(3);
    });

    it('when viewed by p2, p1 hand is hidden and p2 hand is visible', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p2');

      const p1 = sanitized.players.find((p) => p.id === 'p1');
      const p2 = sanitized.players.find((p) => p.id === 'p2');

      expect(p1!.hand).toBeNull();
      expect(p2!.hand).not.toBeNull();
      expect(p2!.hand).toEqual(state.players[1]!.hand);
    });
  });

  // -----------------------------------------------------------------------
  // Face-up cards visibility
  // -----------------------------------------------------------------------

  describe('face-up cards visibility', () => {
    it('all players face-up cards are visible to everyone', () => {
      const state = createState();

      const sanitizedForP1 = sanitizeStateForPlayer(state, 'p1');
      const sanitizedForP2 = sanitizeStateForPlayer(state, 'p2');

      // p1's face-up visible to both
      expect(sanitizedForP1.players[0]!.faceUpCards).toEqual(state.players[0]!.faceUpCards);
      expect(sanitizedForP2.players[0]!.faceUpCards).toEqual(state.players[0]!.faceUpCards);

      // p2's face-up visible to both
      expect(sanitizedForP1.players[1]!.faceUpCards).toEqual(state.players[1]!.faceUpCards);
      expect(sanitizedForP2.players[1]!.faceUpCards).toEqual(state.players[1]!.faceUpCards);
    });
  });

  // -----------------------------------------------------------------------
  // Face-down cards hiding
  // -----------------------------------------------------------------------

  describe('face-down cards hiding', () => {
    it('face-down cards are count only for all players (including self)', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      // p1's own face-down: count only
      const p1 = sanitized.players.find((p) => p.id === 'p1');
      expect(p1!.faceDownCount).toBe(3);
      // SanitizedPlayerState has no faceDownCards field with card values

      // p2's face-down: count only
      const p2 = sanitized.players.find((p) => p.id === 'p2');
      expect(p2!.faceDownCount).toBe(2);
    });

    it('face-down count reflects actual card count', () => {
      const state = createState({
        players: [
          createPlayer('p1', {
            hand: [stdCard('9', 'hearts')],
            faceDown: [stdCard('2', 'clubs')],
          }),
          createPlayer('p2', {
            hand: [stdCard('5', 'hearts')],
            faceDown: [],
          }),
        ],
      });
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.players[0]!.faceDownCount).toBe(1);
      expect(sanitized.players[1]!.faceDownCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Draw pile hiding
  // -----------------------------------------------------------------------

  describe('draw pile hiding', () => {
    it('draw pile shows count only, never card values', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.drawPileCount).toBe(3);
      // SanitizedGameState has no drawPile field with card values
      expect((sanitized as Record<string, unknown>)['drawPile']).toBeUndefined();
    });

    it('draw pile count is 0 when empty', () => {
      const state = createState({ drawPile: [] });
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.drawPileCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Play pile visibility
  // -----------------------------------------------------------------------

  describe('play pile visibility', () => {
    it('play pile is fully visible', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.playPile).toEqual(state.playPile);
    });

    it('play pile includes all cards including jokers', () => {
      const state = createState({
        playPile: [stdCard('7', 'hearts'), joker(1), stdCard('8', 'spades')],
      });
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.playPile).toHaveLength(3);
      expect(sanitized.playPile[1]!.type).toBe('joker');
    });

    it('empty play pile is represented correctly', () => {
      const state = createState({ playPile: [] });
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.playPile).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Burn pile
  // -----------------------------------------------------------------------

  describe('burn pile', () => {
    it('burn pile shows count only', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.burnPileCount).toBe(1);
      expect((sanitized as Record<string, unknown>)['burnPile']).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Metadata preservation
  // -----------------------------------------------------------------------

  describe('metadata preservation', () => {
    it('preserves gameId', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.gameId).toBe('test-game-123');
    });

    it('preserves phase', () => {
      const state = createState({ phase: 'awaiting_queen_declaration' });
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.phase).toBe('awaiting_queen_declaration');
    });

    it('preserves config', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.config).toEqual(DEFAULT_CONFIG);
    });

    it('preserves turnOrder', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.turnOrder).toEqual(['p1', 'p2']);
    });

    it('preserves currentPlayerIndex', () => {
      const state = createState({ currentPlayerIndex: 1 });
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.currentPlayerIndex).toBe(1);
    });

    it('preserves turnDirection', () => {
      const state = createState({ turnDirection: -1 });
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.turnDirection).toBe(-1);
    });

    it('preserves freePlay flag', () => {
      const state = createState({ freePlay: true });
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.freePlay).toBe(true);
    });

    it('preserves nextCardOverride flag', () => {
      const state = createState({ nextCardOverride: 'lower' });
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.nextCardOverride).toBe('lower');
    });

    it('preserves actionCount', () => {
      const state = createState({ actionCount: 42 });
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      expect(sanitized.actionCount).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // Does not leak private information
  // -----------------------------------------------------------------------

  describe('information leakage prevention', () => {
    it('sanitized state does not contain draw pile cards', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      const json = JSON.stringify(sanitized);

      // The draw pile contains hearts_3, spades_4, clubs_5
      // These should NOT appear in the sanitized output
      expect(json).not.toContain('hearts_3');
      expect(json).not.toContain('spades_4');
      expect(json).not.toContain('clubs_5');
    });

    it('sanitized state does not contain other player hand contents', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      const json = JSON.stringify(sanitized);

      // p2's hand contains diamonds_3, diamonds_5, diamonds_8
      expect(json).not.toContain('diamonds_3');
      expect(json).not.toContain('diamonds_5');
      expect(json).not.toContain('diamonds_8');
    });

    it('sanitized state does not contain any face-down card contents', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');
      const json = JSON.stringify(sanitized);

      // p1's face-down: clubs_2, diamonds_6, diamonds_7
      expect(json).not.toContain('clubs_2');
      expect(json).not.toContain('diamonds_6');
      expect(json).not.toContain('diamonds_7');

      // p2's face-down: diamonds_9, clubs_10
      expect(json).not.toContain('diamonds_9');
      expect(json).not.toContain('clubs_10');
    });

    it('sanitized state does not contain rngSeed', () => {
      const state = createState({ rngSeed: 12345 });
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect((sanitized as Record<string, unknown>)['rngSeed']).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles unknown viewing player (all hands hidden)', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'unknown');

      // All players' hands should be hidden
      for (const player of sanitized.players) {
        expect(player.hand).toBeNull();
      }
    });

    it('handles 5-player game', () => {
      const state = createState({
        players: [
          createPlayer('p1', { hand: [stdCard('3', 'hearts')] }),
          createPlayer('p2', { hand: [stdCard('4', 'hearts')] }),
          createPlayer('p3', { hand: [stdCard('5', 'hearts')] }),
          createPlayer('p4', { hand: [stdCard('6', 'hearts')] }),
          createPlayer('p5', { hand: [stdCard('7', 'hearts')] }),
        ],
        turnOrder: ['p1', 'p2', 'p3', 'p4', 'p5'],
      });

      const sanitized = sanitizeStateForPlayer(state, 'p3');

      expect(sanitized.players).toHaveLength(5);

      // p3 sees own hand
      const p3 = sanitized.players.find((p) => p.id === 'p3');
      expect(p3!.hand).not.toBeNull();

      // All others hidden
      for (const p of sanitized.players) {
        if (p.id !== 'p3') {
          expect(p.hand).toBeNull();
          expect(p.handCount).toBe(1);
        }
      }
    });

    it('handles empty game state (all piles empty, no cards)', () => {
      const state = createState({
        drawPile: [],
        playPile: [],
        burnPile: [],
        players: [
          createPlayer('p1'),
          createPlayer('p2'),
        ],
      });
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.drawPileCount).toBe(0);
      expect(sanitized.playPile).toHaveLength(0);
      expect(sanitized.burnPileCount).toBe(0);
    });

    it('preserves player order in sanitized output', () => {
      const state = createState();
      const sanitized = sanitizeStateForPlayer(state, 'p1');

      expect(sanitized.players[0]!.id).toBe('p1');
      expect(sanitized.players[1]!.id).toBe('p2');
    });

    it('same state sanitized for different players produces different results', () => {
      const state = createState();

      const forP1 = sanitizeStateForPlayer(state, 'p1');
      const forP2 = sanitizeStateForPlayer(state, 'p2');

      // p1's hand visible in forP1, hidden in forP2
      const p1InP1View = forP1.players.find((p) => p.id === 'p1')!;
      const p1InP2View = forP2.players.find((p) => p.id === 'p1')!;
      expect(p1InP1View.hand).not.toBeNull();
      expect(p1InP2View.hand).toBeNull();

      // p2's hand hidden in forP1, visible in forP2
      const p2InP1View = forP1.players.find((p) => p.id === 'p2')!;
      const p2InP2View = forP2.players.find((p) => p.id === 'p2')!;
      expect(p2InP1View.hand).toBeNull();
      expect(p2InP2View.hand).not.toBeNull();
    });

    it('does not modify the original state', () => {
      const state = createState();
      const originalJson = JSON.stringify(state);

      sanitizeStateForPlayer(state, 'p1');
      sanitizeStateForPlayer(state, 'p2');

      expect(JSON.stringify(state)).toBe(originalJson);
    });
  });
});
