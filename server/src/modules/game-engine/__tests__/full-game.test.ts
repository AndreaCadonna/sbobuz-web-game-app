/**
 * Full Game Simulation Tests — Complete games from setup to win.
 *
 * These tests verify that the engine can run complete games without errors,
 * infinite loops, or invalid states. They use the public API exclusively:
 * createGame, processAction, enumerateLegalMoves.
 *
 * Each simulation uses deterministic seeds for both the game (deck shuffle,
 * starting player) and the move selection (which legal move to pick).
 *
 * Verification per simulation:
 * - Game terminates (doesn't loop forever)
 * - Exactly one winner (phase = 'finished')
 * - All cards accounted for (conservation check)
 * - Action count > 0
 * - Replay consistency: same seeds produce identical games
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 14 (Seeded RNG)
 * @see SBOBUZ_ENGINE_SPEC.md Section 15 (Event-Sourced Architecture)
 */

import { describe, it, expect } from 'vitest';

import type { GameAction } from '@shared/game-action.js';
import type { GameState, GameConfig } from '@shared/game-state.js';

import {
  createGame,
  processAction,
  enumerateLegalMoves,
} from '../index.js';
import type { ProcessActionResult } from '../index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: GameConfig = {
  turnTimerSeconds: 30,
  disconnectGraceSeconds: 30,
  maxPlayers: 5,
  minPlayers: 2,
};

/**
 * Safety net: maximum actions before declaring the game stuck.
 * Set high enough to handle worst-case games where players repeatedly
 * pick up the pile before eventually playing out all cards.
 */
const MAX_ACTIONS = 5000;

/** Total cards in a Sbobuz deck. */
const TOTAL_CARDS = 54;

// ---------------------------------------------------------------------------
// Seeded PRNG for move selection (independent from game engine's RNG)
// ---------------------------------------------------------------------------

/**
 * Simple Mulberry32 PRNG for selecting moves during simulation.
 * This is separate from the engine's RNG to avoid coupling.
 */
function createMoveRng(seed: number): { next: () => number } {
  let state = Math.floor(seed);
  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

// ---------------------------------------------------------------------------
// Simulation runner
// ---------------------------------------------------------------------------

interface SimulationResult {
  /** The final game state. */
  readonly finalState: GameState;
  /** Total number of actions applied. */
  readonly actionCount: number;
  /** The full action log for replay verification. */
  readonly actionLog: ReadonlyArray<GameAction>;
  /** Whether the game finished normally. */
  readonly finished: boolean;
  /** The winner's player ID, or null if game didn't finish. */
  readonly winnerId: string | null;
}

/**
 * Selects a move from the legal move set with a bias toward playing cards.
 *
 * If the player has playable cards (PLAY_CARDS or PLAY_BLIND), prefer those
 * over PICK_UP_PILE. Only pick up with a ~10% chance when card plays are
 * available. This prevents games from looping endlessly due to random pile
 * pickups while still exercising the pickup path.
 *
 * DECLARE_DIRECTION moves are always the only option when available.
 */
function selectMove(
  moves: { readonly playCards: ReadonlyArray<GameAction>; readonly playBlind: ReadonlyArray<GameAction>; readonly pickUpPile: ReadonlyArray<GameAction>; readonly declareDirection: ReadonlyArray<GameAction>; readonly all: ReadonlyArray<GameAction> },
  rng: { next: () => number },
): GameAction {
  // If only one option (e.g., DECLARE_DIRECTION), pick it
  if (moves.all.length === 1) {
    return moves.all[0]!;
  }

  // Separate card-playing moves from pile pickup
  const cardMoves = [...moves.playCards, ...moves.playBlind, ...moves.declareDirection];

  if (cardMoves.length > 0 && moves.pickUpPile.length > 0) {
    // 90% chance to play a card, 10% chance to pick up pile
    if (rng.next() < 0.9) {
      const idx = Math.floor(rng.next() * cardMoves.length);
      return cardMoves[idx]!;
    }
    return moves.pickUpPile[0]!;
  }

  // No card moves available (only pickup or only card plays)
  const idx = Math.floor(rng.next() * moves.all.length);
  return moves.all[idx]!;
}

/**
 * Runs a complete game simulation from setup to finish.
 *
 * On each turn, enumerates legal moves for the current player and selects
 * one using the biased move selection strategy. If no legal moves are
 * available, uses TIMEOUT_FORFEIT to advance.
 *
 * @param gameSeed - Seed for the game engine's RNG.
 * @param moveSeed - Seed for the move selection RNG.
 * @param playerIds - Player IDs in seating order.
 * @returns The simulation result.
 */
function runSimulation(
  gameSeed: number,
  moveSeed: number,
  playerIds: ReadonlyArray<string>,
): SimulationResult {
  const state = createGame({
    gameId: `sim-${String(gameSeed)}-${String(moveSeed)}`,
    playerIds,
    seed: gameSeed,
    config: DEFAULT_CONFIG,
  });

  const moveRng = createMoveRng(moveSeed);
  let currentState = state;
  const actionLog: GameAction[] = [];

  for (let i = 0; i < MAX_ACTIONS; i++) {
    if (currentState.phase === 'finished' || currentState.phase === 'cancelled') {
      break;
    }

    const currentPlayerId = currentState.turnOrder[currentState.currentPlayerIndex];
    if (currentPlayerId === undefined) {
      throw new Error(`No player at index ${String(currentState.currentPlayerIndex)}`);
    }

    const legalMoves = enumerateLegalMoves(currentState, currentPlayerId);

    let action: GameAction;

    if (legalMoves.all.length > 0) {
      action = selectMove(legalMoves, moveRng);
    } else {
      // No legal moves -- use timeout forfeit to advance
      action = {
        type: 'TIMEOUT_FORFEIT',
        playerId: currentPlayerId,
      };
    }

    const result: ProcessActionResult = processAction(currentState, action);

    if (!result.accepted) {
      // This should never happen -- legal move enumerator should agree with validator
      throw new Error(
        `Legal move rejected by validator: ${action.type} for ${currentPlayerId} — ` +
          `${result.error.code}: ${result.error.message}`,
      );
    }

    actionLog.push(action);
    currentState = result.newState;
  }

  // Determine winner
  let winnerId: string | null = null;
  if (currentState.phase === 'finished') {
    // Find the player with all zones empty
    for (const player of currentState.players) {
      if (
        player.hand.length === 0 &&
        player.faceUpCards.length === 0 &&
        player.faceDownCards.length === 0
      ) {
        winnerId = player.id;
        break;
      }
    }
  }

  return {
    finalState: currentState,
    actionCount: actionLog.length,
    actionLog,
    finished: currentState.phase === 'finished',
    winnerId,
  };
}

/**
 * Counts all cards in the game state (all zones) to verify conservation.
 */
function countAllCards(state: GameState): number {
  let count = 0;
  count += state.drawPile.length;
  count += state.playPile.length;
  count += state.burnPile.length;
  for (const player of state.players) {
    count += player.hand.length;
    count += player.faceUpCards.length;
    count += player.faceDownCards.length;
  }
  return count;
}

/**
 * Replays a game from the action log and verifies it produces the same final state.
 */
function replayGame(
  gameSeed: number,
  playerIds: ReadonlyArray<string>,
  actionLog: ReadonlyArray<GameAction>,
): GameState {
  let state = createGame({
    gameId: `replay-${String(gameSeed)}`,
    playerIds,
    seed: gameSeed,
    config: DEFAULT_CONFIG,
  });

  for (const action of actionLog) {
    const result = processAction(state, action);
    if (!result.accepted) {
      throw new Error(
        `Replay action rejected: ${action.type} — ${result.error.code}: ${result.error.message}`,
      );
    }
    state = result.newState;
  }

  return state;
}

/**
 * Compares two game states for equality (ignoring gameId since replay uses a different one).
 */
function statesEqual(a: GameState, b: GameState): boolean {
  // Compare all fields except gameId
  return (
    a.phase === b.phase &&
    a.actionCount === b.actionCount &&
    a.currentPlayerIndex === b.currentPlayerIndex &&
    a.turnDirection === b.turnDirection &&
    a.freePlay === b.freePlay &&
    a.nextCardOverride === b.nextCardOverride &&
    a.drawPile.length === b.drawPile.length &&
    a.playPile.length === b.playPile.length &&
    a.burnPile.length === b.burnPile.length &&
    a.players.length === b.players.length &&
    a.players.every((pa, i) => {
      const pb = b.players[i]!;
      return (
        pa.id === pb.id &&
        pa.hand.length === pb.hand.length &&
        pa.faceUpCards.length === pb.faceUpCards.length &&
        pa.faceDownCards.length === pb.faceDownCards.length &&
        pa.hand.every((c, j) => c.id === pb.hand[j]!.id) &&
        pa.faceUpCards.every((c, j) => c.id === pb.faceUpCards[j]!.id) &&
        pa.faceDownCards.every((c, j) => c.id === pb.faceDownCards[j]!.id)
      );
    }) &&
    a.drawPile.every((c, i) => c.id === b.drawPile[i]!.id) &&
    a.playPile.every((c, i) => c.id === b.playPile[i]!.id) &&
    a.burnPile.every((c, i) => c.id === b.burnPile[i]!.id)
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function generatePlayerIds(count: number): ReadonlyArray<string> {
  return Array.from({ length: count }, (_, i) => `player-${String(i + 1)}`);
}

describe('Full Game Simulation — 2 players', () => {
  const playerIds = generatePlayerIds(2);

  it('completes 10 games with different seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const result = runSimulation(seed * 100, seed * 7, playerIds);

      expect(result.finished).toBe(true);
      expect(result.actionCount).toBeGreaterThan(0);
      expect(result.actionCount).toBeLessThanOrEqual(MAX_ACTIONS);
      expect(result.winnerId).not.toBeNull();
      expect(countAllCards(result.finalState)).toBe(TOTAL_CARDS);
    }
  });

  it('produces deterministic results with same seeds', () => {
    const result1 = runSimulation(42, 99, playerIds);
    const result2 = runSimulation(42, 99, playerIds);

    expect(result1.actionCount).toBe(result2.actionCount);
    expect(result1.winnerId).toBe(result2.winnerId);
    expect(result1.actionLog.length).toBe(result2.actionLog.length);

    // Every action should be identical
    for (let i = 0; i < result1.actionLog.length; i++) {
      expect(result1.actionLog[i]!.type).toBe(result2.actionLog[i]!.type);
    }
  });

  it('replay from action log produces identical final state', () => {
    const result = runSimulation(123, 456, playerIds);
    const replayState = replayGame(123, playerIds, result.actionLog);

    expect(statesEqual(result.finalState, replayState)).toBe(true);
  });
});

describe('Full Game Simulation — 3 players', () => {
  const playerIds = generatePlayerIds(3);

  it('completes 10 games with different seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const result = runSimulation(seed * 200, seed * 13, playerIds);

      expect(result.finished).toBe(true);
      expect(result.actionCount).toBeGreaterThan(0);
      expect(result.actionCount).toBeLessThanOrEqual(MAX_ACTIONS);
      expect(result.winnerId).not.toBeNull();
      expect(countAllCards(result.finalState)).toBe(TOTAL_CARDS);
    }
  });

  it('produces deterministic results with same seeds', () => {
    const result1 = runSimulation(42, 99, playerIds);
    const result2 = runSimulation(42, 99, playerIds);

    expect(result1.actionCount).toBe(result2.actionCount);
    expect(result1.winnerId).toBe(result2.winnerId);
  });

  it('replay from action log produces identical final state', () => {
    const result = runSimulation(789, 321, playerIds);
    const replayState = replayGame(789, playerIds, result.actionLog);

    expect(statesEqual(result.finalState, replayState)).toBe(true);
  });
});

describe('Full Game Simulation — 4 players', () => {
  const playerIds = generatePlayerIds(4);

  it('completes 10 games with different seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const result = runSimulation(seed * 300, seed * 17, playerIds);

      expect(result.finished).toBe(true);
      expect(result.actionCount).toBeGreaterThan(0);
      expect(result.actionCount).toBeLessThanOrEqual(MAX_ACTIONS);
      expect(result.winnerId).not.toBeNull();
      expect(countAllCards(result.finalState)).toBe(TOTAL_CARDS);
    }
  });

  it('produces deterministic results with same seeds', () => {
    const result1 = runSimulation(42, 99, playerIds);
    const result2 = runSimulation(42, 99, playerIds);

    expect(result1.actionCount).toBe(result2.actionCount);
    expect(result1.winnerId).toBe(result2.winnerId);
  });

  it('replay from action log produces identical final state', () => {
    const result = runSimulation(555, 777, playerIds);
    const replayState = replayGame(555, playerIds, result.actionLog);

    expect(statesEqual(result.finalState, replayState)).toBe(true);
  });
});

describe('Full Game Simulation — 5 players', () => {
  const playerIds = generatePlayerIds(5);

  it('completes 10 games with different seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const result = runSimulation(seed * 400, seed * 23, playerIds);

      expect(result.finished).toBe(true);
      expect(result.actionCount).toBeGreaterThan(0);
      expect(result.actionCount).toBeLessThanOrEqual(MAX_ACTIONS);
      expect(result.winnerId).not.toBeNull();
      expect(countAllCards(result.finalState)).toBe(TOTAL_CARDS);
    }
  });

  it('produces deterministic results with same seeds', () => {
    const result1 = runSimulation(42, 99, playerIds);
    const result2 = runSimulation(42, 99, playerIds);

    expect(result1.actionCount).toBe(result2.actionCount);
    expect(result1.winnerId).toBe(result2.winnerId);
  });

  it('replay from action log produces identical final state', () => {
    const result = runSimulation(999, 111, playerIds);
    const replayState = replayGame(999, playerIds, result.actionLog);

    expect(statesEqual(result.finalState, replayState)).toBe(true);
  });
});

describe('Full Game Simulation — stress tests', () => {
  it('runs 20 additional 2-player games without failure', () => {
    const playerIds = generatePlayerIds(2);
    for (let seed = 11; seed <= 30; seed++) {
      const result = runSimulation(seed * 500, seed * 31, playerIds);
      expect(result.finished).toBe(true);
      expect(countAllCards(result.finalState)).toBe(TOTAL_CARDS);
    }
  });

  it('runs 20 additional 3-player games without failure', () => {
    const playerIds = generatePlayerIds(3);
    for (let seed = 11; seed <= 30; seed++) {
      const result = runSimulation(seed * 600, seed * 37, playerIds);
      expect(result.finished).toBe(true);
      expect(countAllCards(result.finalState)).toBe(TOTAL_CARDS);
    }
  });

  it('runs 20 additional 5-player games without failure', () => {
    const playerIds = generatePlayerIds(5);
    for (let seed = 11; seed <= 30; seed++) {
      const result = runSimulation(seed * 700, seed * 41, playerIds);
      expect(result.finished).toBe(true);
      expect(countAllCards(result.finalState)).toBe(TOTAL_CARDS);
    }
  });
});

describe('Full Game Simulation — invariants', () => {
  it('card conservation holds throughout an entire game', () => {
    const playerIds = generatePlayerIds(3);
    const state = createGame({
      gameId: 'invariant-test',
      playerIds,
      seed: 42,
      config: DEFAULT_CONFIG,
    });

    // Verify initial card count
    expect(countAllCards(state)).toBe(TOTAL_CARDS);

    const moveRng = createMoveRng(99);
    let currentState = state;

    for (let i = 0; i < MAX_ACTIONS; i++) {
      if (currentState.phase === 'finished' || currentState.phase === 'cancelled') {
        break;
      }

      const currentPlayerId = currentState.turnOrder[currentState.currentPlayerIndex];
      if (currentPlayerId === undefined) break;

      const legalMoves = enumerateLegalMoves(currentState, currentPlayerId);

      let action: GameAction;
      if (legalMoves.all.length > 0) {
        action = selectMove(legalMoves, moveRng);
      } else {
        action = { type: 'TIMEOUT_FORFEIT', playerId: currentPlayerId };
      }

      const result = processAction(currentState, action);
      if (!result.accepted) break;

      currentState = result.newState;

      // Check card conservation after EVERY action
      expect(countAllCards(currentState)).toBe(TOTAL_CARDS);
    }

    expect(currentState.phase).toBe('finished');
  });

  it('legal move enumerator and validator are consistent throughout a game', () => {
    const playerIds = generatePlayerIds(2);
    const state = createGame({
      gameId: 'consistency-test',
      playerIds,
      seed: 77,
      config: DEFAULT_CONFIG,
    });

    const moveRng = createMoveRng(88);
    let currentState = state;
    let checksPerformed = 0;

    for (let i = 0; i < MAX_ACTIONS; i++) {
      if (currentState.phase === 'finished' || currentState.phase === 'cancelled') {
        break;
      }

      const currentPlayerId = currentState.turnOrder[currentState.currentPlayerIndex];
      if (currentPlayerId === undefined) break;

      const legalMoves = enumerateLegalMoves(currentState, currentPlayerId);

      // Verify: every move the enumerator returns should be accepted by validator
      for (const move of legalMoves.all) {
        const result = processAction(currentState, move);
        expect(result.accepted).toBe(true);
        checksPerformed++;
      }

      // Pick a move and advance
      let action: GameAction;
      if (legalMoves.all.length > 0) {
        action = selectMove(legalMoves, moveRng);
      } else {
        action = { type: 'TIMEOUT_FORFEIT', playerId: currentPlayerId };
      }

      const result = processAction(currentState, action);
      if (!result.accepted) break;
      currentState = result.newState;
    }

    expect(currentState.phase).toBe('finished');
    // Should have performed many consistency checks
    expect(checksPerformed).toBeGreaterThan(10);
  });

  it('no game takes more than MAX_ACTIONS to complete', () => {
    // Run a variety of games and verify none hit the safety limit
    for (let playerCount = 2; playerCount <= 5; playerCount++) {
      const playerIds = generatePlayerIds(playerCount);
      for (let seed = 1; seed <= 5; seed++) {
        const result = runSimulation(seed * 1000 + playerCount, seed * 43, playerIds);
        expect(result.finished).toBe(true);
        expect(result.actionCount).toBeLessThan(MAX_ACTIONS);
      }
    }
  });

  it('exactly one winner in every finished game', () => {
    for (let playerCount = 2; playerCount <= 5; playerCount++) {
      const playerIds = generatePlayerIds(playerCount);
      for (let seed = 1; seed <= 5; seed++) {
        const result = runSimulation(seed * 1100 + playerCount, seed * 47, playerIds);

        expect(result.finished).toBe(true);

        // Count players with all zones empty
        let winners = 0;
        for (const player of result.finalState.players) {
          if (
            player.hand.length === 0 &&
            player.faceUpCards.length === 0 &&
            player.faceDownCards.length === 0
          ) {
            winners++;
          }
        }

        expect(winners).toBe(1);
      }
    }
  });
});
