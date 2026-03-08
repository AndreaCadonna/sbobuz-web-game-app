/**
 * Tests for AI Player management.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  createAIPlayerInstance,
  getAIPlayerInstance,
  removeAIPlayerInstance,
  getAllAIPlayers,
  getAIPlayersForGame,
  assignAIPlayerToGame,
  unassignAIPlayerFromGame,
  mapLobbyDifficulty,
  resetAIPlayers,
  isAIPlayer,
} from './ai-player.js';

beforeEach(() => {
  resetAIPlayers();
});

describe('createAIPlayerInstance', () => {
  it('creates an AI player with generated ID', () => {
    const player = createAIPlayerInstance('EASY');
    expect(player.playerId).toMatch(/^ai_/);
    expect(player.difficulty).toBe('EASY');
    expect(player.strategyId).toBe('random');
    expect(player.gameId).toBeNull();
  });

  it('creates an AI player with existing ID', () => {
    const player = createAIPlayerInstance('MEDIUM', 'ai_easy_1');
    expect(player.playerId).toBe('ai_easy_1');
    expect(player.difficulty).toBe('MEDIUM');
    expect(player.strategyId).toBe('heuristic');
  });

  it('assigns display names from the pool', () => {
    const p1 = createAIPlayerInstance('EASY');
    const p2 = createAIPlayerInstance('EASY');
    expect(p1.displayName).toBe('Bot Alice');
    expect(p2.displayName).toBe('Bot Bob');
  });

  it('cycles display names when pool is exhausted', () => {
    for (let i = 0; i < 5; i++) {
      createAIPlayerInstance('EASY');
    }
    const p6 = createAIPlayerInstance('EASY');
    expect(p6.displayName).toBe('Bot Alice'); // wraps around
  });

  it('sets response delay based on difficulty', () => {
    const easy = createAIPlayerInstance('EASY');
    expect(easy.responseDelay.minMs).toBe(1000);
    expect(easy.responseDelay.maxMs).toBe(2000);

    const medium = createAIPlayerInstance('MEDIUM');
    expect(medium.responseDelay.minMs).toBe(1500);
    expect(medium.responseDelay.maxMs).toBe(3000);
  });

  it('registers the player in the registry', () => {
    const player = createAIPlayerInstance('EASY', 'ai_test');
    expect(getAIPlayerInstance('ai_test')).toBe(player);
  });
});

describe('getAIPlayerInstance', () => {
  it('returns undefined for unregistered players', () => {
    expect(getAIPlayerInstance('nonexistent')).toBeUndefined();
  });

  it('returns the registered player', () => {
    const player = createAIPlayerInstance('EASY', 'ai_1');
    expect(getAIPlayerInstance('ai_1')).toBe(player);
  });
});

describe('removeAIPlayerInstance', () => {
  it('removes a registered player', () => {
    createAIPlayerInstance('EASY', 'ai_1');
    removeAIPlayerInstance('ai_1');
    expect(getAIPlayerInstance('ai_1')).toBeUndefined();
  });

  it('does nothing for nonexistent players', () => {
    removeAIPlayerInstance('nonexistent');
    // No error thrown
  });
});

describe('getAllAIPlayers', () => {
  it('returns empty array when no players registered', () => {
    expect(getAllAIPlayers()).toEqual([]);
  });

  it('returns all registered players', () => {
    createAIPlayerInstance('EASY', 'ai_1');
    createAIPlayerInstance('MEDIUM', 'ai_2');
    const all = getAllAIPlayers();
    expect(all).toHaveLength(2);
  });
});

describe('game assignment', () => {
  it('assigns and unassigns AI player to game', () => {
    const player = createAIPlayerInstance('EASY', 'ai_1');
    expect(player.gameId).toBeNull();

    assignAIPlayerToGame('ai_1', 'game_1');
    expect(player.gameId).toBe('game_1');

    unassignAIPlayerFromGame('ai_1');
    expect(player.gameId).toBeNull();
  });

  it('getAIPlayersForGame returns players for specific game', () => {
    createAIPlayerInstance('EASY', 'ai_1');
    createAIPlayerInstance('MEDIUM', 'ai_2');
    createAIPlayerInstance('EASY', 'ai_3');

    assignAIPlayerToGame('ai_1', 'game_1');
    assignAIPlayerToGame('ai_2', 'game_1');
    assignAIPlayerToGame('ai_3', 'game_2');

    const game1Players = getAIPlayersForGame('game_1');
    expect(game1Players).toHaveLength(2);
    expect(game1Players.map((p) => p.playerId).sort()).toEqual(['ai_1', 'ai_2']);
  });
});

describe('mapLobbyDifficulty', () => {
  it('maps easy to EASY', () => {
    expect(mapLobbyDifficulty('easy')).toBe('EASY');
  });

  it('maps medium to MEDIUM', () => {
    expect(mapLobbyDifficulty('medium')).toBe('MEDIUM');
  });

  it('maps hard to HARD', () => {
    expect(mapLobbyDifficulty('hard')).toBe('HARD');
  });
});

describe('isAIPlayer (re-export)', () => {
  it('re-exports isAIPlayer from types', () => {
    expect(isAIPlayer('ai_test')).toBe(true);
    expect(isAIPlayer('human')).toBe(false);
  });
});
