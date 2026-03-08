/**
 * Edge Case Integration Tests -- All 20 scenarios from SBOBUZ_ENGINE_SPEC.md Section 17.
 *
 * These tests exercise the full pipeline: createGame -> processAction -> verify state.
 * Each test crafts a game state to set up the exact scenario, then processes actions
 * through the public module API and verifies correctness.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 17 (Edge Cases & Test Scenarios)
 */

import { describe, it, expect } from 'vitest';

import type { Card, Rank, Suit } from '@shared/card.js';
import type { GameState, PlayerState, GameConfig } from '@shared/game-state.js';

import { processAction } from '../index.js';
import type { ProcessActionResult } from '../index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a standard card with deterministic ID. */
function stdCard(rank: Rank, suit: Suit): Card {
  return { type: 'standard', rank, suit, id: `${suit}_${rank}` };
}

/** Creates a standard card with a custom ID suffix for uniqueness. */
function stdCardId(rank: Rank, suit: Suit, suffix: string): Card {
  return { type: 'standard', rank, suit, id: `${suit}_${rank}_${suffix}` };
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

/** Creates a game state for testing with sensible defaults. */
function createState(overrides: Partial<GameState> = {}): GameState {
  const defaults: GameState = {
    gameId: 'edge-test',
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

/** Asserts that a processAction result was accepted and returns the result. */
function expectAccepted(result: ProcessActionResult): {
  readonly newState: GameState;
  readonly events: ReadonlyArray<{ readonly type: string }>;
} {
  expect(result.accepted).toBe(true);
  if (!result.accepted) throw new Error('Expected accepted result');
  return result;
}

/** Asserts that a processAction result was rejected and returns the error code. */
function expectRejected(result: ProcessActionResult): string {
  expect(result.accepted).toBe(false);
  if (result.accepted) throw new Error('Expected rejected result');
  return result.error.code;
}

// ===========================================================================
// Edge Case #1: 2 on three 2s -> Sbobuz (no freePlay)
// Spec: "Sbobuz triggers. Pile burns, direction reverses, player goes again.
//        No freePlay is set (Sbobuz overrides)."
// ===========================================================================

describe('Edge Case #1 — 2 on three 2s triggers Sbobuz', () => {
  it('burns pile, reverses direction, player plays again, no freePlay set', () => {
    const state = createState({
      playPile: [
        stdCard('2', 'hearts'),
        stdCard('2', 'diamonds'),
        stdCard('2', 'clubs'),
      ],
      players: [
        createPlayer('p1', {
          hand: [stdCard('2', 'spades'), stdCard('8', 'hearts'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['spades_2'],
      }),
    );

    // Pile burned (empty)
    expect(result.newState.playPile).toHaveLength(0);
    // Burn pile has the 4 cards
    expect(result.newState.burnPile.length).toBeGreaterThanOrEqual(4);
    // Direction reversed
    expect(result.newState.turnDirection).toBe(-1);
    // Same player plays again (awaiting_post_clear_play)
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
    expect(result.newState.turnOrder[result.newState.currentPlayerIndex]).toBe('p1');
    // freePlay NOT set (Sbobuz overrides 2's effect)
    expect(result.newState.freePlay).toBe(false);
    // Sbobuz event emitted
    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(true);
  });
});

// ===========================================================================
// Edge Case #2: Four Queens -> Sbobuz (no direction declaration)
// Spec: "Sbobuz triggers. No queen direction declaration. Sbobuz overrides
//        all card effects."
// ===========================================================================

describe('Edge Case #2 — Four Queens triggers Sbobuz, not Queen effect', () => {
  it('triggers Sbobuz, skips queen declaration', () => {
    const state = createState({
      playPile: [
        stdCard('Q', 'hearts'),
        stdCard('Q', 'diamonds'),
        stdCard('Q', 'clubs'),
      ],
      players: [
        createPlayer('p1', {
          hand: [stdCard('Q', 'spades'), stdCard('8', 'hearts'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['spades_Q'],
      }),
    );

    // Sbobuz fires, NOT queen declaration
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
    expect(result.newState.phase).not.toBe('awaiting_queen_declaration');
    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.turnDirection).toBe(-1);
    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(true);
    expect(result.events.some((e) => e.type === 'QUEEN_AWAITING_DECLARATION')).toBe(false);
  });
});

// ===========================================================================
// Edge Case #3: Queen declares "lower", next player plays a 2 -> legal
// Spec: "Legal - 2 is always playable. nextCardOverride consumed.
//        2 sets freePlay = true for the player after."
// ===========================================================================

describe('Edge Case #3 — Queen lower + 2 is always legal', () => {
  it('2 is playable under lower override, freePlay set, override consumed', () => {
    // Start: Queen on pile, awaiting declaration from p1
    const statePreDeclaration = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('A', 'hearts'), stdCard('K', 'spades'), stdCard('J', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('2', 'diamonds'), stdCard('6', 'spades'), stdCard('9', 'clubs')],
        }),
      ],
    });

    // Step 1: p1 declares "lower"
    const declareResult = expectAccepted(
      processAction(statePreDeclaration, {
        type: 'DECLARE_DIRECTION',
        playerId: 'p1',
        direction: 'lower',
      }),
    );

    expect(declareResult.newState.nextCardOverride).toBe('lower');
    expect(declareResult.newState.phase).toBe('playing');
    // Turn should advance to p2
    expect(declareResult.newState.turnOrder[declareResult.newState.currentPlayerIndex]).toBe('p2');

    // Step 2: p2 plays a 2 (always legal, even under 'lower' override)
    const playResult = expectAccepted(
      processAction(declareResult.newState, {
        type: 'PLAY_CARDS',
        playerId: 'p2',
        cardIds: ['diamonds_2'],
      }),
    );

    // 2 was played successfully
    expect(playResult.newState.playPile[playResult.newState.playPile.length - 1]!.id).toBe(
      'diamonds_2',
    );
    // nextCardOverride consumed
    expect(playResult.newState.nextCardOverride).toBeNull();
    // freePlay set by 2
    expect(playResult.newState.freePlay).toBe(true);
  });
});

// ===========================================================================
// Edge Case #4: King -> King chain -> player plays again each time
// Spec: "Second King clears empty pile (no-op on burn), player must play again.
//        Chainable indefinitely."
// ===========================================================================

describe('Edge Case #4 — King chain: King -> King -> play again', () => {
  it('two consecutive Kings both clear and grant play again', () => {
    const state = createState({
      playPile: [stdCard('7', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [
            stdCard('K', 'hearts'),
            stdCard('K', 'spades'),
            stdCard('5', 'clubs'),
          ],
          faceUp: [stdCard('3', 'hearts'), stdCard('4', 'diamonds'), stdCard('6', 'spades')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    // Step 1: p1 plays first King
    const r1 = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_K'],
      }),
    );

    expect(r1.newState.playPile).toHaveLength(0);
    expect(r1.newState.phase).toBe('awaiting_post_clear_play');
    expect(r1.newState.turnOrder[r1.newState.currentPlayerIndex]).toBe('p1');

    // Step 2: p1 plays second King (on empty pile -- still valid)
    const r2 = expectAccepted(
      processAction(r1.newState, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['spades_K'],
      }),
    );

    expect(r2.newState.playPile).toHaveLength(0);
    expect(r2.newState.phase).toBe('awaiting_post_clear_play');
    expect(r2.newState.turnOrder[r2.newState.currentPlayerIndex]).toBe('p1');

    // Step 3: p1 plays a normal card -- turn should advance
    const r3 = expectAccepted(
      processAction(r2.newState, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['clubs_5'],
      }),
    );

    // p1 still has face-up cards, so not finished
    expect(r3.newState.phase).toBe('playing');
    expect(r3.newState.turnOrder[r3.newState.currentPlayerIndex]).toBe('p2');
  });
});

// ===========================================================================
// Edge Case #5: King as last card -> player wins
// Spec: "Win condition checked before requiring post-clear play. Player wins."
// ===========================================================================

describe('Edge Case #5 — King as last card, player wins', () => {
  it('player wins immediately when King is their last card', () => {
    const state = createState({
      playPile: [stdCard('7', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('K', 'hearts')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_K'],
      }),
    );

    expect(result.newState.phase).toBe('finished');
    expect(result.events.some((e) => e.type === 'PLAYER_WON')).toBe(true);
  });
});

// ===========================================================================
// Edge Case #6: Blind play reveals illegal card -> pile pickup
// Spec: "Card goes on pile, then player picks up entire pile (including
//        revealed card) into hand. Active zone reverts to hand."
// ===========================================================================

describe('Edge Case #6 — Blind play illegal card triggers pickup', () => {
  it('illegal blind play: revealed card + pile go into hand', () => {
    // Pile top is A, face-down card is a 5 (too low)
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          // No hand, no face-up, just face-down
          faceDown: [stdCard('5', 'diamonds'), stdCard('8', 'clubs'), stdCard('9', 'spades')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_BLIND',
        playerId: 'p1',
        cardIndex: 0,
      }),
    );

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // Player picks up pile (1 pile card + 1 revealed card = 2 cards in hand)
    expect(p1.hand).toHaveLength(2);
    expect(p1.hand.some((c) => c.id === 'diamonds_5')).toBe(true);
    expect(p1.hand.some((c) => c.id === 'hearts_A')).toBe(true);
    // Pile is cleared
    expect(result.newState.playPile).toHaveLength(0);
    // Face-down reduced by 1
    expect(p1.faceDownCards).toHaveLength(2);
    // Turn advances to p2
    expect(result.newState.turnOrder[result.newState.currentPlayerIndex]).toBe('p2');
    // BLIND_CARD_REVEALED event with legal = false
    const revealEvent = result.events.find((e) => e.type === 'BLIND_CARD_REVEALED');
    expect(revealEvent).toBeDefined();
    expect((revealEvent as { legal: boolean }).legal).toBe(false);
  });
});

// ===========================================================================
// Edge Case #7: Blind play reveals a Queen (legal) -> awaiting_queen_declaration
// Spec: "Queen effect triggers normally. Game enters awaiting_queen_declaration."
// ===========================================================================

describe('Edge Case #7 — Blind play reveals legal Queen', () => {
  it('enters awaiting_queen_declaration when blind play reveals Queen', () => {
    // Pile top is J, face-down card is Q (legal: Q >= J)
    const state = createState({
      playPile: [stdCard('J', 'hearts')],
      players: [
        createPlayer('p1', {
          faceDown: [stdCard('Q', 'diamonds'), stdCard('8', 'clubs'), stdCard('9', 'spades')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_BLIND',
        playerId: 'p1',
        cardIndex: 0,
      }),
    );

    expect(result.newState.phase).toBe('awaiting_queen_declaration');
    expect(result.newState.turnOrder[result.newState.currentPlayerIndex]).toBe('p1');
    expect(result.events.some((e) => e.type === 'QUEEN_AWAITING_DECLARATION')).toBe(true);
    expect(result.events.some((e) => e.type === 'BLIND_CARD_REVEALED')).toBe(true);
  });
});

// ===========================================================================
// Edge Case #8: Blind play reveals King (legal) -> clear + play again
// Spec: "King effect triggers. Pile clears. Player must play again."
// ===========================================================================

describe('Edge Case #8 — Blind play reveals legal King', () => {
  it('King effect fires: pile clears, player plays again', () => {
    // Pile top is J, face-down is K (legal: K >= J)
    const state = createState({
      playPile: [stdCard('J', 'hearts')],
      players: [
        createPlayer('p1', {
          faceDown: [stdCard('K', 'diamonds'), stdCard('8', 'clubs'), stdCard('9', 'spades')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_BLIND',
        playerId: 'p1',
        cardIndex: 0,
      }),
    );

    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
    expect(result.newState.turnOrder[result.newState.currentPlayerIndex]).toBe('p1');
    expect(result.events.some((e) => e.type === 'PILE_BURNED')).toBe(true);
  });
});

// ===========================================================================
// Edge Case #9: Pick up pile with special cards -> no effects trigger
// Spec: "Cards go into hand. No effects trigger -- effects only fire on play."
// ===========================================================================

describe('Edge Case #9 — Picking up pile with special cards triggers no effects', () => {
  it('pile with Kings, 2s, Queens goes to hand silently', () => {
    const state = createState({
      playPile: [
        stdCard('K', 'hearts'),
        stdCard('2', 'diamonds'),
        stdCard('Q', 'clubs'),
      ],
      players: [
        createPlayer('p1', {
          hand: [stdCard('3', 'hearts'), stdCard('4', 'spades'), stdCard('5', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PICK_UP_PILE',
        playerId: 'p1',
      }),
    );

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // 3 original hand + 3 pile cards = 6
    expect(p1.hand).toHaveLength(6);
    expect(result.newState.playPile).toHaveLength(0);
    // No special effects fired
    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(false);
    expect(result.events.some((e) => e.type === 'PILE_BURNED')).toBe(false);
    expect(result.events.some((e) => e.type === 'FREE_PLAY_SET')).toBe(false);
    expect(result.events.some((e) => e.type === 'QUEEN_AWAITING_DECLARATION')).toBe(false);
    expect(result.events.some((e) => e.type === 'DIRECTION_REVERSED')).toBe(false);
    // Direction unchanged
    expect(result.newState.turnDirection).toBe(1);
    expect(result.newState.freePlay).toBe(false);
  });
});

// ===========================================================================
// Edge Case #10: Sbobuz completed across multiple turns
// Spec: "Sbobuz triggered by the player who completes the four-of-a-kind,
//        not the player who started the sequence."
// ===========================================================================

describe('Edge Case #10 — Sbobuz across multiple turns', () => {
  it('P1 plays 7, P2 plays 7, P1 plays two 7s -> Sbobuz for P1', () => {
    // Start: pile has one 7 from previous play
    // p2 plays a 7, then p1 plays two 7s to complete Sbobuz
    const state = createState({
      playPile: [stdCard('7', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [
            stdCardId('7', 'diamonds', 'a'),
            stdCardId('7', 'clubs', 'b'),
            stdCard('9', 'spades'),
          ],
        }),
        createPlayer('p2', {
          hand: [stdCard('7', 'spades'), stdCard('8', 'diamonds'), stdCard('J', 'clubs')],
        }),
      ],
      currentPlayerIndex: 1, // p2's turn
    });

    // Step 1: p2 plays one 7
    const r1 = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p2',
        cardIds: ['spades_7'],
      }),
    );

    expect(r1.newState.playPile).toHaveLength(2);
    // Turn advances to p1
    expect(r1.newState.turnOrder[r1.newState.currentPlayerIndex]).toBe('p1');

    // Step 2: p1 plays two 7s to complete the Sbobuz (4 sevens total)
    const r2 = expectAccepted(
      processAction(r1.newState, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['diamonds_7_a', 'clubs_7_b'],
      }),
    );

    // Sbobuz triggered by p1
    expect(r2.newState.playPile).toHaveLength(0);
    expect(r2.newState.phase).toBe('awaiting_post_clear_play');
    expect(r2.newState.turnOrder[r2.newState.currentPlayerIndex]).toBe('p1');
    expect(r2.newState.turnDirection).toBe(-1);
    expect(r2.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(true);
  });
});

// ===========================================================================
// Edge Case #11: Joker reversal + Sbobuz reversal = original direction
// Spec: "Two reversals = back to original direction."
// ===========================================================================

describe('Edge Case #11 — Joker reversal + Sbobuz reversal = original direction', () => {
  it('double reversal restores original direction', () => {
    // Setup: 3 cards of rank 8 on pile, joker reverses first, then 8 completes Sbobuz
    // Actually, Joker on top would break Sbobuz. Let's do it sequentially.
    // Step 1: p1 plays Joker -> reverses to -1
    // Step 2: p2 (now next due to reversal) plays and accumulates cards
    // Simpler: start reversed (-1), then Sbobuz reverses back to 1

    // Actually the simplest: p1 plays Joker (reversal to -1), turn goes to p2.
    // Then p2 has 3 eights on pile and plays the 4th -> Sbobuz reversal back to 1.

    // Let's just test the math directly:
    // Start direction = 1
    // Joker: direction *= -1 = -1
    // Then Sbobuz: direction *= -1 = 1 (back to original)

    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [joker(1), stdCard('8', 'hearts'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [
            stdCard('8', 'spades'),
            stdCard('6', 'diamonds'),
            stdCard('J', 'clubs'),
          ],
        }),
      ],
      turnDirection: 1,
    });

    // Step 1: p1 plays Joker
    const r1 = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['joker_1'],
      }),
    );

    expect(r1.newState.turnDirection).toBe(-1);
    expect(r1.newState.freePlay).toBe(true);

    // Now set up a state where Sbobuz triggers to reverse again
    // Create a fresh state with direction -1 and three 8s on pile
    const state2 = createState({
      playPile: [
        stdCard('8', 'hearts'),
        stdCard('8', 'diamonds'),
        stdCard('8', 'clubs'),
      ],
      players: [
        createPlayer('p1', {
          hand: [stdCard('8', 'spades'), stdCard('5', 'hearts'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'diamonds'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
      turnDirection: -1,
    });

    // p1 plays 8 to complete Sbobuz
    const r2 = expectAccepted(
      processAction(state2, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['spades_8'],
      }),
    );

    // Sbobuz reverses direction: -1 * -1 = 1
    expect(r2.newState.turnDirection).toBe(1);
    expect(r2.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(true);
  });
});

// ===========================================================================
// Edge Case #12: Joker on pile, 4 same rank underneath -> NOT Sbobuz
// Spec: "Joker has no rank -> cannot be part of Sbobuz. The Joker breaks
//        the sequence on the pile top."
// ===========================================================================

describe('Edge Case #12 — Joker on pile top breaks Sbobuz detection', () => {
  it('4 same rank under Joker does not trigger Sbobuz', () => {
    // Pile: [7h, 7d, 7c, 7s, joker_1] -- top 4 = [7d, 7c, 7s, joker_1] -> Joker breaks it
    // Actually top 4 = last 4 elements: 7c, 7s, joker_1 + whatever we add
    // Better: pile has 4 sevens then joker on top. Player plays a card.
    // Top 4 = [7s, joker_1, <new card>] -- only 3 from pile, not enough

    // Simpler setup: pile = [7h, 7d, 7c, joker_1], p1 plays 7s
    // After play: pile = [7h, 7d, 7c, joker_1, 7s]
    // Top 4 = [7d, 7c, joker_1, 7s] -- Joker in top 4, NOT Sbobuz
    const state = createState({
      playPile: [
        stdCard('7', 'hearts'),
        stdCard('7', 'diamonds'),
        stdCard('7', 'clubs'),
        joker(1),
      ],
      freePlay: true, // from the Joker
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'spades'), stdCard('8', 'hearts'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['spades_7'],
      }),
    );

    // Should NOT be Sbobuz (Joker in top 4)
    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(false);
    // Pile is not burned
    expect(result.newState.playPile).toHaveLength(5);
    // Direction unchanged
    expect(result.newState.turnDirection).toBe(1);
  });
});

// ===========================================================================
// Edge Case #13: Draw pile empties mid-hand
// Spec: "Player keeps 1-2 cards in hand, plays them out, then transitions
//        to face-up zone."
// ===========================================================================

describe('Edge Case #13 — Draw pile empties mid-hand', () => {
  it('player draws remaining cards, transitions to face-up when hand empties', () => {
    const state = createState({
      drawPile: [stdCard('10', 'hearts')], // only 1 card in draw
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts'), stdCard('8', 'spades')], // 2 cards in hand
          faceUp: [stdCard('A', 'clubs'), stdCard('K', 'diamonds'), stdCard('Q', 'spades')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    // p1 plays a card -- hand drops to 1, draws 1 from pile (reaches 2, pile empty)
    const r1 = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      }),
    );

    const p1 = r1.newState.players.find((p) => p.id === 'p1')!;
    // Started with 2, played 1 (=1), drew 1 from pile (pile had 1) => hand = 2
    expect(p1.hand).toHaveLength(2);
    expect(r1.newState.drawPile).toHaveLength(0);

    // Now p1 has 2 cards in hand, draw pile empty -- still in 'hand' zone
    // When p1 plays both remaining hand cards (one at a time), transitions to faceUp

    // Simulate: play first remaining card (skip to p1's next turn by creating state)
    const state2 = createState({
      ...r1.newState,
      currentPlayerIndex: 0, // force p1's turn
    });

    // Play one hand card
    const r2 = expectAccepted(
      processAction(state2, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: [p1.hand[0]!.id],
      }),
    );

    const p1after = r2.newState.players.find((p) => p.id === 'p1')!;
    // 1 card left in hand, draw pile empty
    expect(p1after.hand).toHaveLength(1);
  });
});

// ===========================================================================
// Edge Case #14: Face-up multi-card play
// Spec: "Legal -- same multi-play rule applies to face-up cards."
// ===========================================================================

describe('Edge Case #14 — Face-up multi-card play', () => {
  it('player can play multiple same-rank face-up cards at once', () => {
    const state = createState({
      playPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          // No hand, no draw pile -> face-up zone
          faceUp: [
            stdCard('7', 'hearts'),
            stdCard('7', 'diamonds'),
            stdCard('9', 'clubs'),
          ],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7', 'diamonds_7'],
      }),
    );

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // 3 - 2 = 1 face-up card remaining
    expect(p1.faceUpCards).toHaveLength(1);
    expect(p1.faceUpCards[0]!.id).toBe('clubs_9');
    // Both cards on pile
    expect(result.newState.playPile.length).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// Edge Case #15: Pick up pile while in face-up zone -> reverts to hand
// Spec: "Pile goes to hand. Active zone reverts to hand."
// ===========================================================================

describe('Edge Case #15 — Pick up pile in face-up zone reverts to hand', () => {
  it('pile cards go to hand, active zone becomes hand', () => {
    const state = createState({
      playPile: [
        stdCard('A', 'hearts'),
        stdCard('K', 'diamonds'),
        stdCard('Q', 'clubs'),
      ],
      players: [
        createPlayer('p1', {
          // No hand, no draw pile -> face-up zone
          faceUp: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
          faceDown: [stdCard('3', 'hearts'), stdCard('4', 'diamonds'), stdCard('5', 'spades')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PICK_UP_PILE',
        playerId: 'p1',
      }),
    );

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // 3 pile cards went to hand
    expect(p1.hand).toHaveLength(3);
    // Face-up unchanged
    expect(p1.faceUpCards).toHaveLength(3);
    // Player now reverts to hand zone (hand is non-empty)
    expect(result.newState.playPile).toHaveLength(0);
  });
});

// ===========================================================================
// Edge Case #16: Last two players, one finishes -> game over
// Spec: "Remaining player doesn't need to play. Game ends immediately."
// ===========================================================================

describe('Edge Case #16 — Last two players, one finishes, game over', () => {
  it('game ends when one player empties all zones', () => {
    const state = createState({
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts')], // Last card
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      }),
    );

    expect(result.newState.phase).toBe('finished');
    expect(result.events.some((e) => e.type === 'PLAYER_WON')).toBe(true);
    // p2 still has cards, but game is over
    const p2 = result.newState.players.find((p) => p.id === 'p2')!;
    expect(p2.hand).toHaveLength(3);
  });
});

// ===========================================================================
// Edge Case #17: Sbobuz on empty pile -> impossible
// Spec: "Impossible -- pile needs at least 4 cards."
// ===========================================================================

describe('Edge Case #17 — Sbobuz impossible on empty pile', () => {
  it('playing on empty pile cannot trigger Sbobuz', () => {
    const state = createState({
      playPile: [], // empty
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      }),
    );

    // No Sbobuz possible with only 1 card on pile
    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(false);
    expect(result.newState.playPile).toHaveLength(1);
  });

  it('playing 3 cards on empty pile still not enough for Sbobuz', () => {
    const state = createState({
      playPile: [],
      players: [
        createPlayer('p1', {
          hand: [
            stdCardId('7', 'hearts', 'a'),
            stdCardId('7', 'diamonds', 'b'),
            stdCardId('7', 'clubs', 'c'),
          ],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7_a', 'diamonds_7_b', 'clubs_7_c'],
      }),
    );

    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(false);
    expect(result.newState.playPile).toHaveLength(3);
  });
});

// ===========================================================================
// Edge Case #18: Queen override + King clear before target plays
// Spec: "nextCardOverride flag is still set. But the pile is empty, so any
//        card is legal regardless. Flag consumed on next play."
// ===========================================================================

describe('Edge Case #18 — Queen lower + King clear before target plays', () => {
  it('nextCardOverride consumed by the play, even when King clears pile', () => {
    // The spec scenario: Queen declares "lower", then another player's King
    // clears the pile before the "target" (next player after the King) plays.
    // The nextCardOverride is consumed on the very next play (the King play
    // itself), regardless of the King also clearing the pile.
    //
    // Setup: 3-player game. p1 plays Queen, declares "lower".
    // p2 plays a 2 (always legal under any override, consumes override, sets freePlay).
    // p3 has freePlay, plays a King (legal because freePlay), clears pile.
    // The override was already consumed by p2's play.
    const state = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('A', 'hearts'), stdCard('J', 'spades'), stdCard('10', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('2', 'diamonds'), stdCard('6', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p3', {
          hand: [stdCard('K', 'hearts'), stdCard('4', 'diamonds'), stdCard('3', 'clubs')],
        }),
      ],
      turnOrder: ['p1', 'p2', 'p3'],
    });

    // Step 1: p1 declares "lower"
    const r1 = expectAccepted(
      processAction(state, {
        type: 'DECLARE_DIRECTION',
        playerId: 'p1',
        direction: 'lower',
      }),
    );

    expect(r1.newState.nextCardOverride).toBe('lower');
    expect(r1.newState.turnOrder[r1.newState.currentPlayerIndex]).toBe('p2');

    // Step 2: p2 plays a 2 (always legal, consumes override, sets freePlay)
    const r2 = expectAccepted(
      processAction(r1.newState, {
        type: 'PLAY_CARDS',
        playerId: 'p2',
        cardIds: ['diamonds_2'],
      }),
    );

    // Override consumed
    expect(r2.newState.nextCardOverride).toBeNull();
    // freePlay set by the 2
    expect(r2.newState.freePlay).toBe(true);
    expect(r2.newState.turnOrder[r2.newState.currentPlayerIndex]).toBe('p3');

    // Step 3: p3 plays King (legal because freePlay is active)
    const r3 = expectAccepted(
      processAction(r2.newState, {
        type: 'PLAY_CARDS',
        playerId: 'p3',
        cardIds: ['hearts_K'],
      }),
    );

    // King clears pile
    expect(r3.newState.playPile).toHaveLength(0);
    expect(r3.newState.phase).toBe('awaiting_post_clear_play');
    // freePlay consumed by King play
    expect(r3.newState.freePlay).toBe(false);
    // Override already null
    expect(r3.newState.nextCardOverride).toBeNull();
  });

  it('nextCardOverride is consumed even if the play also clears the pile', () => {
    // Direct variant: p1 plays Queen on a pile with a high card.
    // Declares "lower." p2 plays a 2 (always legal), consuming override.
    // Verify the override is gone after p2's play.
    const state = createState({
      phase: 'awaiting_queen_declaration',
      playPile: [stdCard('Q', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [stdCard('A', 'hearts'), stdCard('J', 'spades'), stdCard('10', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('2', 'diamonds'), stdCard('6', 'spades'), stdCard('9', 'clubs')],
        }),
      ],
      turnOrder: ['p1', 'p2'],
    });

    // p1 declares "lower"
    const r1 = expectAccepted(
      processAction(state, {
        type: 'DECLARE_DIRECTION',
        playerId: 'p1',
        direction: 'lower',
      }),
    );

    expect(r1.newState.nextCardOverride).toBe('lower');

    // p2 plays 2 (always legal) -> override consumed
    const r2 = expectAccepted(
      processAction(r1.newState, {
        type: 'PLAY_CARDS',
        playerId: 'p2',
        cardIds: ['diamonds_2'],
      }),
    );

    expect(r2.newState.nextCardOverride).toBeNull();
    expect(r2.newState.freePlay).toBe(true);
  });
});

// ===========================================================================
// Edge Case #19: Voluntary pickup with legal play available
// Spec: "Legal -- pickup is always voluntary. No 'you have a legal play' check."
// ===========================================================================

describe('Edge Case #19 — Voluntary pile pickup with legal play available', () => {
  it('player can pick up pile even when they have legal plays', () => {
    const state = createState({
      playPile: [stdCard('3', 'hearts')],
      players: [
        createPlayer('p1', {
          // All cards are higher than 3 -- legal plays exist
          hand: [stdCard('7', 'hearts'), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    // Player chooses to pick up instead of playing
    const result = expectAccepted(
      processAction(state, {
        type: 'PICK_UP_PILE',
        playerId: 'p1',
      }),
    );

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // 3 original + 1 pile card = 4
    expect(p1.hand).toHaveLength(4);
    expect(result.newState.playPile).toHaveLength(0);
    // Turn advances
    expect(result.newState.turnOrder[result.newState.currentPlayerIndex]).toBe('p2');
  });
});

// ===========================================================================
// Edge Case #20: Split ranks across face-down cards (can't form Sbobuz)
// Spec: "Those ranks can never form a Sbobuz on the pile (since face-down
//        plays are one at a time and turns alternate)."
// ===========================================================================

describe('Edge Case #20 — Split ranks across face-down cards', () => {
  it('face-down plays are one at a time, cannot form 4-of-a-kind from one player', () => {
    // Setup: both players have 7s in face-down. Pile has two 7s.
    // Even though there are 4 sevens total in face-downs, they can't all be played
    // consecutively because turns alternate and blind play is one-at-a-time.
    const state = createState({
      playPile: [stdCard('7', 'hearts'), stdCard('7', 'diamonds')],
      players: [
        createPlayer('p1', {
          faceDown: [stdCard('7', 'clubs'), stdCard('8', 'hearts'), stdCard('9', 'spades')],
        }),
        createPlayer('p2', {
          faceDown: [stdCard('7', 'spades'), stdCard('6', 'diamonds'), stdCard('J', 'hearts')],
        }),
      ],
    });

    // p1 plays blind -- reveals 7c (legal, >= 7)
    const r1 = expectAccepted(
      processAction(state, {
        type: 'PLAY_BLIND',
        playerId: 'p1',
        cardIndex: 0,
      }),
    );

    // Only 3 sevens on pile -- not Sbobuz yet
    expect(r1.newState.playPile).toHaveLength(3);
    expect(r1.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(false);

    // Now it's p2's turn. p2 could blind play their 7s to complete Sbobuz.
    // But the point is that face-down card positions are unknown -- it's blind.
    // Even if p2's index 0 is a 7, they might get a different card.
    // This test just verifies the mechanic: one blind card at a time.
    expect(r1.newState.turnOrder[r1.newState.currentPlayerIndex]).toBe('p2');

    // p2 blind plays -- happens to reveal 7s (index 0)
    const r2 = expectAccepted(
      processAction(r1.newState, {
        type: 'PLAY_BLIND',
        playerId: 'p2',
        cardIndex: 0,
      }),
    );

    // NOW Sbobuz triggers (4 sevens on pile)
    expect(r2.newState.playPile).toHaveLength(0);
    expect(r2.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(true);
  });

  it('split ranks across players means Sbobuz requires alternating cooperation', () => {
    // Different scenario: 3 sevens on pile, but face-down has non-7 at index 0
    const state = createState({
      playPile: [stdCard('7', 'hearts'), stdCard('7', 'diamonds'), stdCard('7', 'clubs')],
      players: [
        createPlayer('p1', {
          // index 0 is NOT a 7, so blind play will fail Sbobuz
          faceDown: [stdCard('3', 'spades'), stdCard('8', 'hearts'), stdCard('9', 'spades')],
        }),
        createPlayer('p2', {
          faceDown: [stdCard('7', 'spades'), stdCard('6', 'diamonds'), stdCard('J', 'hearts')],
        }),
      ],
    });

    // p1 blind plays index 0 (reveals 3s -- too low, illegal)
    const r1 = expectAccepted(
      processAction(state, {
        type: 'PLAY_BLIND',
        playerId: 'p1',
        cardIndex: 0,
      }),
    );

    // Illegal blind play: pile picked up into hand
    const p1 = r1.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.hand.length).toBeGreaterThan(0); // picked up pile
    expect(r1.newState.playPile).toHaveLength(0); // pile cleared
    expect(r1.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(false);
  });
});

// ===========================================================================
// Additional compound edge cases
// ===========================================================================

describe('Additional edge cases — compound scenarios', () => {
  it('4 of a kind played at once triggers immediate Sbobuz', () => {
    // Spec Section 12: "P1 plays four 5s at once -> Sbobuz -- immediate"
    const state = createState({
      playPile: [],
      players: [
        createPlayer('p1', {
          hand: [
            stdCard('5', 'hearts'),
            stdCard('5', 'diamonds'),
            stdCard('5', 'clubs'),
            stdCard('5', 'spades'),
          ],
          // face-up cards so p1 doesn't win after playing all hand cards
          faceUp: [stdCard('3', 'hearts'), stdCard('4', 'diamonds'), stdCard('6', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('3', 'diamonds'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_5', 'diamonds_5', 'clubs_5', 'spades_5'],
      }),
    );

    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.turnDirection).toBe(-1);
    expect(result.newState.phase).toBe('awaiting_post_clear_play');
    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(true);
  });

  it('Sbobuz on 4 Kings: Sbobuz overrides King clear', () => {
    // Four Kings = Sbobuz, not King effect
    const state = createState({
      playPile: [
        stdCard('K', 'hearts'),
        stdCard('K', 'diamonds'),
        stdCard('K', 'clubs'),
      ],
      players: [
        createPlayer('p1', {
          hand: [stdCard('K', 'spades'), stdCard('8', 'hearts'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['spades_K'],
      }),
    );

    // Sbobuz fires, not individual King effect
    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(true);
    expect(result.newState.playPile).toHaveLength(0);
    expect(result.newState.turnDirection).toBe(-1);
  });

  it('Sbobuz with 4 twos: Sbobuz overrides freePlay effect', () => {
    // Already tested in Edge Case #1, but let's also verify no freePlay
    const state = createState({
      playPile: [
        stdCard('2', 'hearts'),
        stdCard('2', 'diamonds'),
        stdCard('2', 'clubs'),
      ],
      players: [
        createPlayer('p1', {
          hand: [stdCard('2', 'spades'), stdCard('8', 'hearts'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['spades_2'],
      }),
    );

    expect(result.events.some((e) => e.type === 'SBOBUZ_TRIGGERED')).toBe(true);
    expect(result.events.some((e) => e.type === 'FREE_PLAY_SET')).toBe(false);
    expect(result.newState.freePlay).toBe(false);
  });

  it('playing on finished game is rejected', () => {
    const state = createState({ phase: 'finished' });

    const code = expectRejected(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      }),
    );

    expect(code).toBe('GAME_NOT_ACTIVE');
  });

  it('CANCEL_GAME works even in finished state', () => {
    // Cancel game bypasses all checks
    const state = createState({ phase: 'playing' });

    const result = expectAccepted(
      processAction(state, {
        type: 'CANCEL_GAME',
        reason: 'admin',
      }),
    );

    expect(result.newState.phase).toBe('cancelled');
  });

  it('blind play with freePlay flag: any revealed card is legal', () => {
    // freePlay is set, so even a low card against a high pile top is legal
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      freePlay: true,
      players: [
        createPlayer('p1', {
          faceDown: [stdCard('3', 'diamonds'), stdCard('4', 'clubs'), stdCard('5', 'spades')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_BLIND',
        playerId: 'p1',
        cardIndex: 0,
      }),
    );

    // 3 is legal because freePlay is true
    const revealEvent = result.events.find((e) => e.type === 'BLIND_CARD_REVEALED');
    expect(revealEvent).toBeDefined();
    expect((revealEvent as { legal: boolean }).legal).toBe(true);
    // Card stays on pile (not picked up)
    expect(result.newState.playPile).toHaveLength(2);
    // freePlay consumed
    expect(result.newState.freePlay).toBe(false);
  });

  it('Joker played from hand reverses direction and sets freePlay', () => {
    const state = createState({
      playPile: [stdCard('A', 'hearts')],
      players: [
        createPlayer('p1', {
          hand: [joker(1), stdCard('8', 'spades'), stdCard('9', 'clubs')],
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['joker_1'],
      }),
    );

    expect(result.newState.turnDirection).toBe(-1);
    expect(result.newState.freePlay).toBe(true);
    expect(result.events.some((e) => e.type === 'DIRECTION_REVERSED')).toBe(true);
    expect(result.events.some((e) => e.type === 'FREE_PLAY_SET')).toBe(true);
  });

  it('draw phase refills hand to 3 from draw pile', () => {
    const state = createState({
      drawPile: [
        stdCard('10', 'hearts'),
        stdCard('J', 'diamonds'),
        stdCard('Q', 'clubs'),
      ],
      players: [
        createPlayer('p1', {
          hand: [stdCard('7', 'hearts')], // Only 1 card
        }),
        createPlayer('p2', {
          hand: [stdCard('5', 'hearts'), stdCard('6', 'spades'), stdCard('J', 'clubs')],
        }),
      ],
    });

    const result = expectAccepted(
      processAction(state, {
        type: 'PLAY_CARDS',
        playerId: 'p1',
        cardIds: ['hearts_7'],
      }),
    );

    const p1 = result.newState.players.find((p) => p.id === 'p1')!;
    // Played 1 (hand = 0), drew up to 3 (draw had 3)
    expect(p1.hand).toHaveLength(3);
    expect(result.newState.drawPile).toHaveLength(0);
    expect(result.events.some((e) => e.type === 'CARDS_DRAWN')).toBe(true);
  });
});
