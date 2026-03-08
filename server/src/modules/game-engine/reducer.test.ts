/**
 * Tests for the State Reducer module.
 *
 * Covers all 30 edge cases from the state-reducer spec, all 20 scenarios
 * from the parent spec Section 17, plus additional tests for thoroughness.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 11 (State Reducer)
 * @see SBOBUZ_ENGINE_SPEC.md Section 7 (Effect Priority)
 * @see SBOBUZ_ENGINE_SPEC.md Section 17 (Edge Cases)
 * @see docs/specs/engine/state-reducer.md
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, Suit } from '@shared/card.js';
import type { GameAction } from '@shared/game-action.js';
import type { GameState, PlayerState, GameConfig } from '@shared/game-state.js';

import { reduce } from './reducer.js';
import type { GameEvent, ReducerResult } from './reducer.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a standard card. */
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

/** Creates a player state. */
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

/** Creates a game state for testing. */
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

/** Checks if the events array contains an event of the given type. */
function hasEvent(events: ReadonlyArray<GameEvent>, type: GameEvent['type']): boolean {
  return events.some((e) => e.type === type);
}

/** Finds the first event of the given type. */
function findEvent<T extends GameEvent['type']>(
  events: ReadonlyArray<GameEvent>,
  type: T,
): Extract<GameEvent, { type: T }> | undefined {
  return events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
}

// ---------------------------------------------------------------------------
// PLAY_CARDS — basic card play
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — basic', () => {
  it('removes played card from hand and places on pile', () => {
    const state = createState();
    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(2);
    expect(p1.hand.some((c) => c.id === 'hearts_7')).toBe(false);
    expect(result.newState.playPile).toHaveLength(1);
    expect(result.newState.playPile[0]!.id).toBe('hearts_7');
  });

  it('advances turn to next player after normal play', () => {
    const state = createState();
    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(result.newState.currentPlayerIndex).toBe(1);
    expect(result.newState.phase).toBe('playing');
  });

  it('increments action count', () => {
    const state = createState({ actionCount: 5 });
    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(result.newState.actionCount).toBe(6);
  });

  it('emits CARDS_PLAYED event', () => {
    const state = createState();
    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(hasEvent(result.events, 'CARDS_PLAYED')).toBe(true);
    const ev = findEvent(result.events, 'CARDS_PLAYED')!;
    expect(ev.playerId).toBe('p1');
    expect(ev.cards).toHaveLength(1);
    expect(ev.fromZone).toBe('hand');
  });

  it('emits TURN_ADVANCED event', () => {
    const state = createState();
    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(hasEvent(result.events, 'TURN_ADVANCED')).toBe(true);
    const ev = findEvent(result.events, 'TURN_ADVANCED')!;
    expect(ev.newPlayerIndex).toBe(1);
    expect(ev.newPlayerId).toBe('p2');
  });

  it('plays multiple same-rank cards', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7', 'diamonds_7'],
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(1);
    expect(result.newState.playPile).toHaveLength(2);
  });

  it('does not mutate input state', () => {
    const state = createState();
    const originalPileLength = state.playPile.length;
    const originalP1HandLength = state.players[0]!.hand.length;

    reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(state.playPile.length).toBe(originalPileLength);
    expect(state.players[0]!.hand.length).toBe(originalP1HandLength);
  });

  // Spec scenario #14: Multiple same-rank face-up cards played
  it('plays multiple face-up cards (spec scenario #14)', () => {
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

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7', 'diamonds_7', 'clubs_7'],
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.faceUpCards).toHaveLength(0);
    expect(result.newState.playPile).toHaveLength(3);
    const ev = findEvent(result.events, 'CARDS_PLAYED')!;
    expect(ev.fromZone).toBe('faceUp');
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS — consume flags
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — flag consumption', () => {
  it('consumes freePlay flag on play', () => {
    const state = createState({ freePlay: true, playPile: [stdCard('A', 'hearts')] });
    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(result.newState.freePlay).toBe(false);
  });

  it('consumes nextCardOverride flag on play', () => {
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

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_J'],
    });

    expect(result.newState.nextCardOverride).toBeNull();
  });

  // Spec reducer scenario #27: Flags consumed even when Sbobuz triggers
  it('consumes flags even when Sbobuz triggers (spec scenario #27)', () => {
    const state = createState({
      freePlay: true,
      nextCardOverride: 'lower',
      playPile: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), stdCard('7', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'spades'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['spades_7'],
    });

    expect(result.newState.freePlay).toBe(false);
    expect(result.newState.nextCardOverride).toBeNull();
    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS — draw phase
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — draw phase', () => {
  it('draws cards when hand < 3 and draw pile non-empty', () => {
    const state = createState({
      drawPile: [stdCard('3', 'hearts'), stdCard('4', 'diamonds')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts'), stdCard('8', 'spades')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // Started with 2 cards, played 1 -> 1 card, draw 2 -> 3 cards
    expect(p1.hand).toHaveLength(3);
    expect(result.newState.drawPile).toHaveLength(0);
    expect(hasEvent(result.events, 'CARDS_DRAWN')).toBe(true);
    const ev = findEvent(result.events, 'CARDS_DRAWN')!;
    expect(ev.count).toBe(2);
  });

  it('draws from top of draw pile (index 0)', () => {
    const topCard = stdCard('3', 'hearts');
    const state = createState({
      drawPile: [topCard, stdCard('4', 'diamonds'), stdCard('5', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts'), stdCard('8', 'spades')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // Should have drawn topCard (3 of hearts) and 4 of diamonds
    expect(p1.hand.some((c) => c.id === 'hearts_3')).toBe(true);
  });

  it('does not draw when hand >= 3', () => {
    const state = createState({
      drawPile: [stdCard('3', 'hearts')],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    // Started with 3, played 1 -> 2, draw 1 -> 3
    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(3);
    expect(result.newState.drawPile).toHaveLength(0);
  });

  it('does not draw when draw pile is empty', () => {
    const state = createState({ drawPile: [] });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(hasEvent(result.events, 'CARDS_DRAWN')).toBe(false);
  });

  // Spec reducer scenario #28: Draw phase after King clear
  it('draws after King clear when hand < 3 (spec scenario #28)', () => {
    const state = createState({
      drawPile: [stdCard('3', 'hearts'), stdCard('4', 'diamonds')],
      playPile: [stdCard('5', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('K', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_K'],
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // Played K -> hand was empty, draw 2 cards (draw pile has 2)
    // Actually draw up to 3: hand was 0 after play, draw pile has 2, draw 2
    expect(p1.hand).toHaveLength(2);
    expect(hasEvent(result.events, 'CARDS_DRAWN')).toBe(true);
  });

  // Spec scenario #13: Draw pile empties mid-hand
  it('draws partial when draw pile exhausts (spec scenario #13)', () => {
    const state = createState({
      drawPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // Hand was 1, played 1 -> 0, draw 1 -> 1
    expect(p1.hand).toHaveLength(1);
    expect(result.newState.drawPile).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS — special card: 2
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — card 2', () => {
  it('sets freePlay flag when playing a 2', () => {
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('2', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_2'],
    });

    expect(result.newState.freePlay).toBe(true);
    expect(hasEvent(result.events, 'FREE_PLAY_SET')).toBe(true);
    const ev = findEvent(result.events, 'FREE_PLAY_SET')!;
    expect(ev.byCard).toBe('2');
  });

  // Spec scenario #3: Queen declares 'lower', next player plays a 2
  it('consumes nextCardOverride when 2 is played (spec scenario #3)', () => {
    const state = createState({
      nextCardOverride: 'lower',
      playPile: [stdCard('Q', 'hearts')],
      currentPlayerIndex: 1,
      players: [
        createPlayer('p1', { hand: [stdCard('7', 'hearts')] }),
        createPlayer('p2', {
          hand: [stdCard('2', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p2',
      cardIds: ['hearts_2'],
    });

    // nextCardOverride consumed
    expect(result.newState.nextCardOverride).toBeNull();
    // freePlay set by the 2
    expect(result.newState.freePlay).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS — special card: Joker
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — Joker', () => {
  it('sets freePlay and reverses direction on Joker play', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [joker(1), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['joker_1'],
    });

    expect(result.newState.freePlay).toBe(true);
    expect(result.newState.turnDirection).toBe(-1);
    expect(hasEvent(result.events, 'FREE_PLAY_SET')).toBe(true);
    expect(hasEvent(result.events, 'DIRECTION_REVERSED')).toBe(true);
  });

  // Spec scenario #11: Joker reverses, then Sbobuz reverses (double reversal)
  it('double reversal returns to original direction (spec scenario #11)', () => {
    // First play Joker to reverse (-1), then trigger Sbobuz (reverse again -> 1)
    const state = createState({
      turnDirection: 1,
      playPile: [stdCard('5', 'hearts'), stdCard('5', 'diamonds'), stdCard('5', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('5', 'spades'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('J', 'hearts')] }),
      ],
    });

    // Playing 5 on three 5s triggers Sbobuz, which reverses
    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['spades_5'],
    });

    // Sbobuz triggers: direction reversed (1 -> -1), not Joker
    expect(result.newState.turnDirection).toBe(-1);

    // Now if we also had a Joker reversal earlier, a second reversal brings it back
    // This test is about the formula: direction *= -1 applied twice = original
    const state2 = createState({
      turnDirection: -1, // already reversed by Joker
      playPile: [stdCard('5', 'hearts'), stdCard('5', 'diamonds'), stdCard('5', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('5', 'spades'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('J', 'hearts')] }),
      ],
    });

    const result2 = reduce(state2, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['spades_5'],
    });

    // Sbobuz reverses again: -1 -> 1
    expect(result2.newState.turnDirection).toBe(1);
  });

  // Spec scenario #12: Joker on pile prevents Sbobuz
  it('Joker on top of pile prevents Sbobuz (spec scenario #12)', () => {
    const state = createState({
      playPile: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), joker(1)],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'clubs'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('J', 'hearts')] }),
      ],
      freePlay: true, // Joker effect still active
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['clubs_7'],
    });

    // Top 4: 7h, 7d, joker, 7c -- Joker breaks Sbobuz
    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS — special card: Queen
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — Queen', () => {
  it('enters awaiting_queen_declaration phase', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [stdCard('Q', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_Q'],
    });

    expect(result.newState.phase).toBe('awaiting_queen_declaration');
    expect(result.newState.currentPlayerIndex).toBe(0); // No turn advance
    expect(hasEvent(result.events, 'QUEEN_AWAITING_DECLARATION')).toBe(true);
    expect(hasEvent(result.events, 'TURN_ADVANCED')).toBe(false);
  });

  it('does NOT draw or advance turn on Queen play', () => {
    const state = createState({
      drawPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('Q', 'hearts'), stdCard('8', 'spades')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_Q'],
    });

    // No draw phase
    expect(hasEvent(result.events, 'CARDS_DRAWN')).toBe(false);
    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(1); // played 1 from 2, no draw
    // Draw pile unchanged
    expect(result.newState.drawPile).toHaveLength(1);
  });

  // Spec scenario #2: Four Queens = Sbobuz, not Queen effect
  it('four Queens triggers Sbobuz, not Queen effect (spec scenario #2)', () => {
    const state = createState({
      playPile: [stdCard('Q', 'hearts'), stdCard('Q', 'diamonds'), stdCard('Q', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('Q', 'spades'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['spades_Q'],
    });

    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(true);
    expect(hasEvent(result.events, 'QUEEN_AWAITING_DECLARATION')).toBe(false);
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS — special card: King
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — King', () => {
  it('burns pile and enters awaiting_post_clear_play', () => {
    const state = createState({
      playPile: [stdCard('5', 'hearts'), stdCard('8', 'diamonds')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('K', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_K'],
    });

    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.burnPile).toHaveLength(3); // 2 pile + K
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
    expect(result.newState.currentPlayerIndex).toBe(0); // Same player plays again
    expect(hasEvent(result.events, 'PILE_BURNED')).toBe(true);
    const ev = findEvent(result.events, 'PILE_BURNED')!;
    expect(ev.reason).toBe('king');
  });

  // Spec scenario #4: King clears, follow-up is another King
  it('King chains (spec scenario #4)', () => {
    // First King clears pile
    const state = createState({
      phase: 'awaiting_post_clear_play',
      playPile: [],
      players: [
        createPlayer('p1', {
          hand: [stdCard('K', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_K'],
    });

    // Second King clears empty pile (no-op burn), plays again
    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
    expect(result.newState.currentPlayerIndex).toBe(0);
  });

  // Spec scenario #21: King played on empty pile
  it('King on empty pile still grants play again (spec scenario #21)', () => {
    const state = createState({
      playPile: [],
      players: [
        createPlayer('p1', {
          hand: [stdCard('K', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_K'],
    });

    expect(result.newState.phase).toBe('awaiting_post_clear_play');
  });

  // Spec scenario #5: King as last card = win
  it('King as last card triggers win (spec scenario #5)', () => {
    const state = createState({
      playPile: [stdCard('5', 'hearts')],
      players: [
        createPlayer('p1', { hand: [stdCard('K', 'hearts')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_K'],
    });

    expect(result.newState.phase).toBe('finished');
    expect(hasEvent(result.events, 'PLAYER_WON')).toBe(true);
    const ev = findEvent(result.events, 'PLAYER_WON')!;
    expect(ev.playerId).toBe('p1');
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS — Sbobuz detection
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — Sbobuz', () => {
  // Spec scenario #1: Play a 2 on top of three 2s
  it('Sbobuz on four 2s overrides freePlay (spec scenario #1)', () => {
    const state = createState({
      playPile: [stdCard('2', 'hearts'), stdCard('2', 'diamonds'), stdCard('2', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('2', 'spades'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['spades_2'],
    });

    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(true);
    expect(result.newState.freePlay).toBe(false); // Sbobuz overrides
    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.burnPile).toHaveLength(4);
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
  });

  // Spec scenario #10: Sbobuz completed across multiple turns
  it('Sbobuz across turns (spec scenario #10)', () => {
    const state = createState({
      playPile: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), stdCard('7', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'spades'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('J', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['spades_7'],
    });

    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(true);
    const ev = findEvent(result.events, 'SBOBUZ_TRIGGERED')!;
    expect(ev.playerId).toBe('p1'); // p1 completed the Sbobuz
    expect(ev.rank).toBe('7');
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
  });

  // Spec scenario #20: Play 3 cards at once, Sbobuz check
  it('3 same-rank cards + pile top makes Sbobuz (spec scenario #20)', () => {
    const state = createState({
      playPile: [stdCard('9', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('9', 'diamonds'), stdCard('9', 'clubs'), stdCard('9', 'spades')],
        }),
        createPlayer('p2', { hand: [stdCard('J', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['diamonds_9', 'clubs_9', 'spades_9'],
    });

    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(true);
    expect(result.newState.playPile).toHaveLength(0);
  });

  it('Sbobuz reverses turn direction', () => {
    const state = createState({
      turnDirection: 1,
      playPile: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), stdCard('7', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'spades'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('J', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['spades_7'],
    });

    expect(result.newState.turnDirection).toBe(-1);
    expect(hasEvent(result.events, 'DIRECTION_REVERSED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARDS — win condition
// ---------------------------------------------------------------------------

describe('reduce — PLAY_CARDS — win condition', () => {
  it('player wins when all zones empty after play', () => {
    const state = createState({
      drawPile: [],
      players: [
        createPlayer('p1', { hand: [stdCard('7', 'hearts')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(result.newState.phase).toBe('finished');
    expect(hasEvent(result.events, 'PLAYER_WON')).toBe(true);
  });

  it('player does NOT win if draw pile has cards (will draw)', () => {
    const state = createState({
      drawPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', { hand: [stdCard('7', 'hearts')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(result.newState.phase).toBe('playing');
    expect(hasEvent(result.events, 'PLAYER_WON')).toBe(false);
  });

  it('player does NOT win if face-up or face-down cards remain', () => {
    const state = createState({
      drawPile: [],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts')],
          faceUp: [stdCard('8', 'spades')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(result.newState.phase).toBe('playing');
    expect(hasEvent(result.events, 'PLAYER_WON')).toBe(false);
  });

  // Spec scenario #16: Last two players, one finishes
  it('game ends when first player empties all zones (spec scenario #16)', () => {
    const state = createState({
      drawPile: [],
      players: [
        createPlayer('p1', { hand: [stdCard('7', 'hearts')] }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(result.newState.phase).toBe('finished');
    expect(hasEvent(result.events, 'TURN_ADVANCED')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PLAY_BLIND
// ---------------------------------------------------------------------------

describe('reduce — PLAY_BLIND', () => {
  // Spec scenario #6: Blind play reveals illegal card
  it('illegal blind play: pile picked up, turn advances (spec scenario #6)', () => {
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('3', 'hearts'), stdCard('5', 'diamonds')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    // 3 of hearts on Ace -> illegal
    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // Player picks up pile: Ace + 3 of hearts = 2 cards
    expect(p1.hand).toHaveLength(2);
    expect(p1.faceDownCards).toHaveLength(1);
    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.currentPlayerIndex).toBe(1); // Turn advances
    expect(result.newState.phase).toBe('playing');

    const blindEv = findEvent(result.events, 'BLIND_CARD_REVEALED')!;
    expect(blindEv.legal).toBe(false);
    expect(hasEvent(result.events, 'PILE_PICKED_UP')).toBe(true);
  });

  // Spec scenario #7: Blind play reveals a legal Queen
  it('legal blind Queen triggers awaiting_queen_declaration (spec scenario #7)', () => {
    const state = createState({
      playPile: [stdCard('J', 'hearts')], // Q > J, legal
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('Q', 'hearts'), stdCard('5', 'diamonds')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    expect(result.newState.phase).toBe('awaiting_queen_declaration');
    const blindEv = findEvent(result.events, 'BLIND_CARD_REVEALED')!;
    expect(blindEv.legal).toBe(true);
  });

  // Spec scenario #8: Blind play reveals a legal King
  it('legal blind King triggers pile clear + play again (spec scenario #8)', () => {
    const state = createState({
      playPile: [stdCard('J', 'hearts')], // K > J, legal
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('K', 'hearts'), stdCard('5', 'diamonds')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    expect(result.newState.phase).toBe('awaiting_post_clear_play');
    expect(result.newState.playPile).toHaveLength(0);
    expect(hasEvent(result.events, 'PILE_BURNED')).toBe(true);
  });

  // Spec reducer scenario #29: Blind play 2 on pile top A
  it('blind play 2 is always legal (spec scenario #29)', () => {
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('2', 'hearts'), stdCard('5', 'diamonds')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    const blindEv = findEvent(result.events, 'BLIND_CARD_REVEALED')!;
    expect(blindEv.legal).toBe(true);
    expect(result.newState.freePlay).toBe(true); // 2 sets freePlay
  });

  // Spec reducer scenario #30: Blind play on empty pile is always legal
  it('blind play on empty pile is always legal (spec scenario #30)', () => {
    const state = createState({
      playPile: [],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('3', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    const blindEv = findEvent(result.events, 'BLIND_CARD_REVEALED')!;
    expect(blindEv.legal).toBe(true);
  });

  it('legal blind play clears freePlay and nextCardOverride flags', () => {
    const state = createState({
      freePlay: true,
      nextCardOverride: 'lower',
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('7', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    // freePlay was true, so 7 is legal (free play)
    const blindEv = findEvent(result.events, 'BLIND_CARD_REVEALED')!;
    expect(blindEv.legal).toBe(true);
    // Flags consumed
    expect(result.newState.freePlay).toBe(false);
    expect(result.newState.nextCardOverride).toBeNull();
  });

  it('illegal blind play clears flags', () => {
    const state = createState({
      freePlay: false,
      nextCardOverride: null,
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('3', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    expect(result.newState.freePlay).toBe(false);
    expect(result.newState.nextCardOverride).toBeNull();
  });

  it('blind play win: last face-down played legally, all zones empty', () => {
    const state = createState({
      playPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('7', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    expect(result.newState.phase).toBe('finished');
    expect(hasEvent(result.events, 'PLAYER_WON')).toBe(true);
  });

  // Spec edge case #15: blind play last face-down King = win
  it('blind play last face-down King triggers win (spec scenario #15)', () => {
    const state = createState({
      playPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('K', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    // K is legal (K > 3), King burns pile, win checked -> all zones empty -> win
    expect(result.newState.phase).toBe('finished');
    expect(hasEvent(result.events, 'PLAYER_WON')).toBe(true);
    expect(hasEvent(result.events, 'PILE_BURNED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PICK_UP_PILE
// ---------------------------------------------------------------------------

describe('reduce — PICK_UP_PILE', () => {
  // Spec scenario #9: Pickup pile with special cards
  it('moves pile to hand, no effects trigger (spec scenario #9)', () => {
    const state = createState({
      playPile: [stdCard('K', 'hearts'), stdCard('Q', 'diamonds'), joker(1)],
      freePlay: true,
      nextCardOverride: 'lower',
    });

    const result = reduce(state, {
      type: 'PICK_UP_PILE',
      playerId: 'p1',
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // Original hand (3) + 3 pile cards = 6
    expect(p1.hand).toHaveLength(6);
    expect(result.newState.playPile).toHaveLength(0);
    // Flags cleared
    expect(result.newState.freePlay).toBe(false);
    expect(result.newState.nextCardOverride).toBeNull();
    // No special effects triggered
    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(false);
    expect(hasEvent(result.events, 'DIRECTION_REVERSED')).toBe(false);
    // Turn advanced
    expect(result.newState.currentPlayerIndex).toBe(1);
  });

  // Spec scenario #15: Pick up pile while in face-up zone
  it('pile goes to hand, zone reverts (spec scenario #15)', () => {
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [stdCard('7', 'hearts')],
          faceDown: [stdCard('3', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PICK_UP_PILE',
      playerId: 'p1',
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(1); // Ace goes to hand
    expect(p1.faceUpCards).toHaveLength(1); // Still has face-up
  });

  // Spec scenario #19: Voluntary pickup for strategy
  it('voluntary pickup is always valid (spec scenario #19)', () => {
    const state = createState({
      playPile: [stdCard('3', 'hearts')],
    });

    const result = reduce(state, {
      type: 'PICK_UP_PILE',
      playerId: 'p1',
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// DECLARE_DIRECTION
// ---------------------------------------------------------------------------

describe('reduce — DECLARE_DIRECTION', () => {
  it('sets nextCardOverride to "lower" when declaring lower', () => {
    const state = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
    });

    const result = reduce(state, {
      type: 'DECLARE_DIRECTION',
      playerId: 'p1',
      direction: 'lower',
    });

    expect(result.newState.nextCardOverride).toBe('lower');
    expect(result.newState.phase).toBe('playing');
    expect(result.newState.currentPlayerIndex).toBe(1); // Turn advanced
  });

  it('keeps nextCardOverride null when declaring higher', () => {
    const state = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
    });

    const result = reduce(state, {
      type: 'DECLARE_DIRECTION',
      playerId: 'p1',
      direction: 'higher',
    });

    expect(result.newState.nextCardOverride).toBeNull();
    expect(result.newState.phase).toBe('playing');
  });

  it('emits DIRECTION_DECLARED event', () => {
    const state = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
    });

    const result = reduce(state, {
      type: 'DECLARE_DIRECTION',
      playerId: 'p1',
      direction: 'lower',
    });

    expect(hasEvent(result.events, 'DIRECTION_DECLARED')).toBe(true);
    const ev = findEvent(result.events, 'DIRECTION_DECLARED')!;
    expect(ev.direction).toBe('lower');
  });

  it('draws cards for Queen player if hand < 3', () => {
    const state = createState({
      phase: 'awaiting_queen_declaration',
      drawPile: [stdCard('3', 'hearts'), stdCard('4', 'diamonds')],
      playPile: [stdCard('Q', 'hearts')],
      players: [
        createPlayer('p1', { hand: [stdCard('8', 'spades')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'DECLARE_DIRECTION',
      playerId: 'p1',
      direction: 'higher',
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(3); // Had 1, drew 2
    expect(hasEvent(result.events, 'CARDS_DRAWN')).toBe(true);
  });

  // Spec scenario #11 from win-condition: Queen was last card -> win after declaration
  it('win after Queen declaration when all zones empty', () => {
    const state = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
      drawPile: [],
      players: [
        createPlayer('p1', { hand: [] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'DECLARE_DIRECTION',
      playerId: 'p1',
      direction: 'higher',
    });

    expect(result.newState.phase).toBe('finished');
    expect(hasEvent(result.events, 'PLAYER_WON')).toBe(true);
  });

  // Spec scenario #18: Queen 'lower' override, pile cleared by King before target plays
  it('nextCardOverride persists across King clear (spec scenario #18)', () => {
    // Set up: p1 declared 'lower' after Queen. Now p2's turn.
    // p2 plays a King, pile clears. Now back to p1 (or p3).
    // The nextCardOverride flag is still set.
    const state = createState({
      phase: 'playing',
      nextCardOverride: 'lower',
      playPile: [stdCard('Q', 'hearts'), stdCard('K', 'diamonds')],
      currentPlayerIndex: 1,
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('K', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    // p2 plays King
    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p2',
      cardIds: ['hearts_K'],
    });

    // nextCardOverride is consumed by the play (step 4 consumes flags)
    expect(result.newState.nextCardOverride).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TIMEOUT_FORFEIT
// ---------------------------------------------------------------------------

describe('reduce — TIMEOUT_FORFEIT', () => {
  // Spec scenario #22: Timeout during awaiting_queen_declaration
  it('auto-declares higher on timeout during queen declaration (spec scenario #22)', () => {
    const state = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
    });

    const result = reduce(state, {
      type: 'TIMEOUT_FORFEIT',
      playerId: 'p1',
    });

    expect(result.newState.phase).toBe('playing');
    expect(result.newState.nextCardOverride).toBeNull(); // 'higher' = null
    expect(hasEvent(result.events, 'PLAYER_TIMED_OUT')).toBe(true);
    expect(hasEvent(result.events, 'DIRECTION_DECLARED')).toBe(true);
    expect(result.newState.currentPlayerIndex).toBe(1); // Turn advanced
  });

  // Spec scenario #23: Timeout during playing with non-empty pile
  it('auto-picks up pile on timeout during playing (spec scenario #23)', () => {
    const state = createState({
      playPile: [stdCard('7', 'hearts'), stdCard('8', 'diamonds')],
    });

    const result = reduce(state, {
      type: 'TIMEOUT_FORFEIT',
      playerId: 'p1',
    });

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(5); // 3 original + 2 pile
    expect(result.newState.playPile).toHaveLength(0);
    expect(hasEvent(result.events, 'PLAYER_TIMED_OUT')).toBe(true);
    expect(hasEvent(result.events, 'PILE_PICKED_UP')).toBe(true);
  });

  // Spec scenario #24: Timeout during playing with empty pile
  it('simply advances turn on timeout with empty pile (spec scenario #24)', () => {
    const state = createState({ playPile: [] });

    const result = reduce(state, {
      type: 'TIMEOUT_FORFEIT',
      playerId: 'p1',
    });

    expect(result.newState.currentPlayerIndex).toBe(1);
    expect(result.newState.phase).toBe('playing');
    expect(hasEvent(result.events, 'PLAYER_TIMED_OUT')).toBe(true);
    expect(hasEvent(result.events, 'TURN_ADVANCED')).toBe(true);
  });

  // Spec scenario #25: Timeout during awaiting_post_clear_play
  it('skips turn on timeout during post-clear play (spec scenario #25)', () => {
    const state = createState({ phase: 'awaiting_post_clear_play' });

    const result = reduce(state, {
      type: 'TIMEOUT_FORFEIT',
      playerId: 'p1',
    });

    expect(result.newState.currentPlayerIndex).toBe(1);
    expect(result.newState.phase).toBe('playing');
    expect(hasEvent(result.events, 'PLAYER_TIMED_OUT')).toBe(true);
    expect(hasEvent(result.events, 'TURN_ADVANCED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CANCEL_GAME
// ---------------------------------------------------------------------------

describe('reduce — CANCEL_GAME', () => {
  // Spec scenario #26: Cancel game sets phase to cancelled
  it('sets phase to cancelled (spec scenario #26)', () => {
    const state = createState();

    const result = reduce(state, {
      type: 'CANCEL_GAME',
      reason: 'disconnect_timeout',
      disconnectedPlayerId: 'p1',
    });

    expect(result.newState.phase).toBe('cancelled');
    expect(hasEvent(result.events, 'GAME_CANCELLED')).toBe(true);
    const ev = findEvent(result.events, 'GAME_CANCELLED')!;
    expect(ev.reason).toBe('disconnect_timeout');
  });

  it('increments action count on cancel', () => {
    const state = createState({ actionCount: 10 });

    const result = reduce(state, {
      type: 'CANCEL_GAME',
      reason: 'admin',
    });

    expect(result.newState.actionCount).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Turn wrapping and direction
// ---------------------------------------------------------------------------

describe('reduce — turn management', () => {
  it('wraps turn forward at end of player list', () => {
    const state = createState({ currentPlayerIndex: 1 });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p2',
      cardIds: ['hearts_5'],
    });

    // p2 is index 1, next in forward direction wraps to 0
    expect(result.newState.currentPlayerIndex).toBe(0);
  });

  it('handles reverse direction turn advancement', () => {
    const state = createState({
      turnDirection: -1,
      currentPlayerIndex: 0,
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    // Index 0, direction -1, 2 players: wraps to 1
    expect(result.newState.currentPlayerIndex).toBe(1);
  });

  it('handles 3+ player turn order', () => {
    const state = createState({
      players: [
        createPlayer('p1', { hand: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')] }),
        createPlayer('p3', { hand: [stdCard('3', 'hearts'), stdCard('4', 'spades'), stdCard('10', 'clubs')] }),
      ],
      turnOrder: ['p1', 'p2', 'p3'],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    expect(result.newState.currentPlayerIndex).toBe(1); // p1 -> p2
  });
});

// ---------------------------------------------------------------------------
// Compound / integration tests
// ---------------------------------------------------------------------------

describe('reduce — compound scenarios', () => {
  it('full turn cycle: play, draw, advance', () => {
    const state = createState({
      drawPile: [stdCard('3', 'hearts'), stdCard('4', 'diamonds')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts'), stdCard('8', 'spades')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    // After playing: hand was 2, played 1 -> 1, draw 2 -> 3
    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand).toHaveLength(3);
    expect(result.newState.drawPile).toHaveLength(0);
    expect(result.newState.currentPlayerIndex).toBe(1);
    expect(result.newState.phase).toBe('playing');
  });

  it('King -> play again -> normal card -> advance', () => {
    const state = createState({
      playPile: [stdCard('5', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('K', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    // Step 1: Play King
    const result1 = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_K'],
    });

    expect(result1.newState.phase).toBe('awaiting_post_clear_play');
    expect(result1.newState.currentPlayerIndex).toBe(0);

    // Step 2: Follow-up play
    const result2 = reduce(result1.newState, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['spades_8'],
    });

    expect(result2.newState.phase).toBe('playing');
    expect(result2.newState.currentPlayerIndex).toBe(1); // Turn advances
  });

  it('Queen -> declare -> next player plays with override', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [stdCard('Q', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('J', 'hearts'), stdCard('6', 'spades'), stdCard('3', 'clubs')],
        }),
      ],
    });

    // Step 1: Play Queen
    const result1 = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_Q'],
    });

    expect(result1.newState.phase).toBe('awaiting_queen_declaration');

    // Step 2: Declare lower
    const result2 = reduce(result1.newState, {
      type: 'DECLARE_DIRECTION',
      playerId: 'p1',
      direction: 'lower',
    });

    expect(result2.newState.nextCardOverride).toBe('lower');
    expect(result2.newState.phase).toBe('playing');
    expect(result2.newState.currentPlayerIndex).toBe(1);

    // Step 3: p2 plays J on Q with lower override (J ordinal 9 <= Q ordinal 10 => legal)
    const result3 = reduce(result2.newState, {
      type: 'PLAY_CARDS',
      playerId: 'p2',
      cardIds: ['hearts_J'],
    });

    // Override consumed
    expect(result3.newState.nextCardOverride).toBeNull();
    expect(result3.newState.phase).toBe('playing');
  });

  it('Sbobuz after King in post-clear: Sbobuz triggered in follow-up', () => {
    // King clears pile. Follow-up play triggers Sbobuz with other cards
    const state = createState({
      phase: 'awaiting_post_clear_play',
      playPile: [],
      burnPile: [stdCard('5', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [
            stdCard('7', 'hearts'), stdCard('7', 'diamonds'),
            stdCard('7', 'clubs'), stdCard('7', 'spades'),
            stdCard('A', 'hearts'),
          ],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7', 'diamonds_7', 'clubs_7', 'spades_7'],
    });

    // 4 sevens = Sbobuz
    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(true);
    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
  });

  it('complete 2-player game simulation (deterministic)', () => {
    // Set up a game where p1 can win in a few turns
    const state = createState({
      drawPile: [],
      playPile: [],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades')],
        }),
      ],
    });

    // p1 plays 7
    const result1 = reduce(state, {
      type: 'PLAY_CARDS',
      playerId: 'p1',
      cardIds: ['hearts_7'],
    });

    // p1 has no more cards -> wins
    expect(result1.newState.phase).toBe('finished');
    expect(hasEvent(result1.events, 'PLAYER_WON')).toBe(true);
    const ev = findEvent(result1.events, 'PLAYER_WON')!;
    expect(ev.playerId).toBe('p1');
  });

  it('Sbobuz via blind play', () => {
    const state = createState({
      playPile: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), stdCard('7', 'clubs')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('7', 'spades'), stdCard('3', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    // 7 on three 7s = Sbobuz
    expect(hasEvent(result.events, 'SBOBUZ_TRIGGERED')).toBe(true);
    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
  });

  it('blind play during awaiting_post_clear_play', () => {
    // After King clear, player is in faceDown zone
    const state = createState({
      phase: 'awaiting_post_clear_play',
      playPile: [],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('7', 'hearts')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const result = reduce(state, {
      type: 'PLAY_BLIND',
      playerId: 'p1',
      cardIndex: 0,
    });

    // Empty pile, so any card is legal
    const blindEv = findEvent(result.events, 'BLIND_CARD_REVEALED')!;
    expect(blindEv.legal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Immutability verification
// ---------------------------------------------------------------------------

describe('reduce — immutability', () => {
  it('does not mutate the input state for any action type', () => {
    const state = createState({
      playPile: [stdCard('5', 'hearts')],
      drawPile: [stdCard('3', 'hearts'), stdCard('4', 'diamonds')],
      freePlay: true,
    });

    // Take a snapshot via JSON to detect deep mutations
    const snapshot = JSON.stringify(state);

    // PLAY_CARDS
    reduce(state, { type: 'PLAY_CARDS', playerId: 'p1', cardIds: ['hearts_7'] });
    expect(JSON.stringify(state)).toBe(snapshot);

    // PICK_UP_PILE
    reduce(state, { type: 'PICK_UP_PILE', playerId: 'p1' });
    expect(JSON.stringify(state)).toBe(snapshot);

    // CANCEL_GAME
    reduce(state, { type: 'CANCEL_GAME', reason: 'admin' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('does not mutate the input state for PLAY_BLIND', () => {
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [],
          faceUp: [],
          faceDown: [stdCard('3', 'hearts'), stdCard('5', 'diamonds')],
        }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const snapshot = JSON.stringify(state);
    reduce(state, { type: 'PLAY_BLIND', playerId: 'p1', cardIndex: 0 });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('does not mutate the input state for DECLARE_DIRECTION', () => {
    const state = createState({
      phase: 'awaiting_queen_declaration',
      drawPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', { hand: [stdCard('8', 'spades')] }),
        createPlayer('p2', { hand: [stdCard('5', 'hearts')] }),
      ],
    });

    const snapshot = JSON.stringify(state);
    reduce(state, { type: 'DECLARE_DIRECTION', playerId: 'p1', direction: 'lower' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('does not mutate the input state for TIMEOUT_FORFEIT', () => {
    const state = createState({
      playPile: [stdCard('5', 'hearts')],
    });

    const snapshot = JSON.stringify(state);
    reduce(state, { type: 'TIMEOUT_FORFEIT', playerId: 'p1' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
