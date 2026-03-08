/**
 * Tests for the Leaderboard Service — orchestration of rating updates.
 *
 * @see server/src/modules/leaderboard/leaderboard-service.ts
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetRatings = vi.fn();
const mockApplyRatingUpdate = vi.fn();
const mockRecordMatchResult = vi.fn();
const mockGetTopPlayers = vi.fn();
const mockGetPlayerRank = vi.fn();
const mockGetNearbyRanks = vi.fn();
const mockGetMatchHistory = vi.fn();

vi.mock('./repository.js', () => ({
  getRatings: (...args: unknown[]) => mockGetRatings(...args),
  applyRatingUpdate: (...args: unknown[]) => mockApplyRatingUpdate(...args),
  recordMatchResult: (...args: unknown[]) => mockRecordMatchResult(...args),
  getTopPlayers: (...args: unknown[]) => mockGetTopPlayers(...args),
  getPlayerRank: (...args: unknown[]) => mockGetPlayerRank(...args),
  getNearbyRanks: (...args: unknown[]) => mockGetNearbyRanks(...args),
  getMatchHistory: (...args: unknown[]) => mockGetMatchHistory(...args),
}));

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  processGameResult,
  getLeaderboard,
  getPlayerLeaderboardEntry,
  getNearbyLeaderboard,
  getPlayerMatchHistory,
} from './leaderboard-service.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeaderboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // processGameResult
  // -----------------------------------------------------------------------

  describe('processGameResult', () => {
    it('should calculate and persist rating updates for all players', async () => {
      const gameId = randomUUID();
      const winnerId = randomUUID();
      const loserId = randomUUID();

      mockGetRatings.mockResolvedValue(new Map([
        [winnerId, { userId: winnerId, rating: 1200, gamesPlayed: 50, gamesWon: 25 }],
        [loserId, { userId: loserId, rating: 1200, gamesPlayed: 50, gamesWon: 25 }],
      ]));

      mockApplyRatingUpdate.mockResolvedValue(undefined);
      mockRecordMatchResult.mockResolvedValue(undefined);

      await processGameResult({
        gameId,
        winnerId,
        playerIds: [winnerId, loserId],
        playedAt: new Date().toISOString(),
        durationSeconds: 300,
      });

      // Should apply rating updates for both players
      expect(mockApplyRatingUpdate).toHaveBeenCalledTimes(2);

      // Winner should have isWin = true
      const winnerCall = mockApplyRatingUpdate.mock.calls.find(
        (call: unknown[]) => (call[0] as { userId: string }).userId === winnerId,
      );
      expect(winnerCall?.[1]).toBe(true); // isWin

      // Loser should have isWin = false
      const loserCall = mockApplyRatingUpdate.mock.calls.find(
        (call: unknown[]) => (call[0] as { userId: string }).userId === loserId,
      );
      expect(loserCall?.[1]).toBe(false); // isWin

      // Should record match results for both players
      expect(mockRecordMatchResult).toHaveBeenCalledTimes(2);
    });

    it('should skip rating update for AI players', async () => {
      const gameId = randomUUID();
      const humanId = randomUUID();
      const aiId = 'ai_easy_1';

      await processGameResult({
        gameId,
        winnerId: humanId,
        playerIds: [humanId, aiId],
        playedAt: new Date().toISOString(),
        durationSeconds: 300,
      });

      // Should not call getRatings because fewer than 2 human players
      expect(mockGetRatings).not.toHaveBeenCalled();
    });

    it('should skip rating update when AI wins', async () => {
      const gameId = randomUUID();
      const humanId = randomUUID();
      const aiId = 'ai_medium_1';

      await processGameResult({
        gameId,
        winnerId: aiId,
        playerIds: [humanId, aiId],
        playedAt: new Date().toISOString(),
        durationSeconds: 300,
      });

      expect(mockGetRatings).not.toHaveBeenCalled();
    });

    it('should handle 3+ player games', async () => {
      const gameId = randomUUID();
      const p1 = randomUUID();
      const p2 = randomUUID();
      const p3 = randomUUID();

      mockGetRatings.mockResolvedValue(new Map([
        [p1, { userId: p1, rating: 1200, gamesPlayed: 50 }],
        [p2, { userId: p2, rating: 1300, gamesPlayed: 50 }],
        [p3, { userId: p3, rating: 1100, gamesPlayed: 50 }],
      ]));

      mockApplyRatingUpdate.mockResolvedValue(undefined);
      mockRecordMatchResult.mockResolvedValue(undefined);

      await processGameResult({
        gameId,
        winnerId: p1,
        playerIds: [p1, p2, p3],
        playedAt: new Date().toISOString(),
        durationSeconds: 600,
      });

      expect(mockApplyRatingUpdate).toHaveBeenCalledTimes(3);
      expect(mockRecordMatchResult).toHaveBeenCalledTimes(3);
    });
  });

  // -----------------------------------------------------------------------
  // Leaderboard Queries
  // -----------------------------------------------------------------------

  describe('getLeaderboard', () => {
    it('should delegate to getTopPlayers', async () => {
      const mockEntries = [
        { rank: 1, userId: 'a', username: 'alice', rating: 1500, gamesPlayed: 100, gamesWon: 60, winRate: 0.6 },
      ];
      mockGetTopPlayers.mockResolvedValue(mockEntries);

      const result = await getLeaderboard(10, 0);

      expect(mockGetTopPlayers).toHaveBeenCalledWith(10, 0);
      expect(result).toEqual(mockEntries);
    });
  });

  describe('getPlayerLeaderboardEntry', () => {
    it('should delegate to getPlayerRank', async () => {
      const mockEntry = { rank: 5, userId: 'a', username: 'alice', rating: 1400, gamesPlayed: 50, gamesWon: 30, winRate: 0.6 };
      mockGetPlayerRank.mockResolvedValue(mockEntry);

      const result = await getPlayerLeaderboardEntry('a');

      expect(mockGetPlayerRank).toHaveBeenCalledWith('a');
      expect(result).toEqual(mockEntry);
    });

    it('should return null for non-ranked players', async () => {
      mockGetPlayerRank.mockResolvedValue(null);

      const result = await getPlayerLeaderboardEntry('unknown');
      expect(result).toBeNull();
    });
  });

  describe('getNearbyLeaderboard', () => {
    it('should delegate to getNearbyRanks', async () => {
      mockGetNearbyRanks.mockResolvedValue([]);

      await getNearbyLeaderboard('a', 3);

      expect(mockGetNearbyRanks).toHaveBeenCalledWith('a', 3);
    });
  });

  describe('getPlayerMatchHistory', () => {
    it('should delegate to getMatchHistory', async () => {
      const mockHistory = [
        { gameId: '1', result: 'win' as const, ratingChange: 10, ratingAfter: 1210, playedAt: '2024-01-01' },
      ];
      mockGetMatchHistory.mockResolvedValue(mockHistory);

      const result = await getPlayerMatchHistory('a', 10);

      expect(mockGetMatchHistory).toHaveBeenCalledWith('a', 10);
      expect(result).toEqual(mockHistory);
    });
  });
});
