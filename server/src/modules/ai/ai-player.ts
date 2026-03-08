/**
 * AI Player management.
 *
 * Creates and tracks AI player instances. Maps player IDs to their
 * strategy, difficulty, and current game.
 *
 * @see docs/specs/ai-opponent-module.md Section 2.1 (AI Player Identity)
 */

import { randomUUID } from 'node:crypto';

import type {
  AIPlayer,
  AIDifficulty,
  AIStrategyId,
  ResponseDelayConfig,
} from './ai.types.js';
import {
  DIFFICULTY_TO_STRATEGY,
  DIFFICULTY_DELAYS,
  AI_DISPLAY_NAMES,
  isAIPlayer,
} from './ai.types.js';

// ---------------------------------------------------------------------------
// AI Player Registry
// ---------------------------------------------------------------------------

/** playerId -> AIPlayer */
const aiPlayers = new Map<string, AIPlayer>();

/** Counter for assigning display names from the pool. */
let nameCounter = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new AI player with the given difficulty.
 *
 * @param difficulty - The AI difficulty level.
 * @param existingId - Optional existing player ID (from lobby). If not provided, generates one.
 * @returns The created AIPlayer.
 */
export function createAIPlayerInstance(
  difficulty: AIDifficulty,
  existingId?: string | undefined,
): AIPlayer {
  const playerId = existingId ?? `ai_${randomUUID()}`;
  const displayName = AI_DISPLAY_NAMES[nameCounter % AI_DISPLAY_NAMES.length]!;
  nameCounter++;

  const strategyId: AIStrategyId = DIFFICULTY_TO_STRATEGY[difficulty];
  const responseDelay: ResponseDelayConfig = DIFFICULTY_DELAYS[difficulty];

  const player: AIPlayer = {
    playerId,
    displayName,
    strategyId,
    difficulty,
    responseDelay,
    gameId: null,
  };

  aiPlayers.set(playerId, player);
  return player;
}

/**
 * Get an AI player by ID.
 */
export function getAIPlayerInstance(playerId: string): AIPlayer | undefined {
  return aiPlayers.get(playerId);
}

/**
 * Remove an AI player from the registry.
 */
export function removeAIPlayerInstance(playerId: string): void {
  aiPlayers.delete(playerId);
}

/**
 * Get all registered AI players.
 */
export function getAllAIPlayers(): ReadonlyArray<AIPlayer> {
  return [...aiPlayers.values()];
}

/**
 * Get all AI players for a specific game.
 */
export function getAIPlayersForGame(gameId: string): ReadonlyArray<AIPlayer> {
  return [...aiPlayers.values()].filter((p) => p.gameId === gameId);
}

/**
 * Assign an AI player to a game.
 */
export function assignAIPlayerToGame(playerId: string, gameId: string): void {
  const player = aiPlayers.get(playerId);
  if (player) {
    player.gameId = gameId;
  }
}

/**
 * Unassign an AI player from its game.
 */
export function unassignAIPlayerFromGame(playerId: string): void {
  const player = aiPlayers.get(playerId);
  if (player) {
    player.gameId = null;
  }
}

/**
 * Map lobby difficulty (lowercase) to AI module difficulty (uppercase).
 */
export function mapLobbyDifficulty(lobbyDifficulty: 'easy' | 'medium' | 'hard'): AIDifficulty {
  const map: Record<string, AIDifficulty> = {
    easy: 'EASY',
    medium: 'MEDIUM',
    hard: 'HARD',
  };
  return map[lobbyDifficulty] ?? 'MEDIUM';
}

/**
 * Reset the AI player registry (for testing only).
 */
export function resetAIPlayers(): void {
  aiPlayers.clear();
  nameCounter = 0;
}

export { isAIPlayer };
