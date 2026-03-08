/**
 * Tests for ELO Rating Service — pure calculation functions.
 *
 * @see server/src/modules/leaderboard/rating-service.ts
 */

import { describe, it, expect } from 'vitest';

import {
  getKFactor,
  expectedScore,
  calculateNewRating,
  calculateMultiplayerRatings,
  INITIAL_RATING,
  MIN_RATING,
} from './rating-service.js';

describe('RatingService', () => {
  // -----------------------------------------------------------------------
  // getKFactor
  // -----------------------------------------------------------------------

  describe('getKFactor', () => {
    it('should return 40 for new players (0-29 games)', () => {
      expect(getKFactor(0)).toBe(40);
      expect(getKFactor(10)).toBe(40);
      expect(getKFactor(29)).toBe(40);
    });

    it('should return 20 for intermediate players (30-99 games)', () => {
      expect(getKFactor(30)).toBe(20);
      expect(getKFactor(50)).toBe(20);
      expect(getKFactor(99)).toBe(20);
    });

    it('should return 10 for established players (100+ games)', () => {
      expect(getKFactor(100)).toBe(10);
      expect(getKFactor(500)).toBe(10);
      expect(getKFactor(1000)).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // expectedScore
  // -----------------------------------------------------------------------

  describe('expectedScore', () => {
    it('should return 0.5 for equal ratings', () => {
      const expected = expectedScore(1200, 1200);
      expect(expected).toBeCloseTo(0.5, 5);
    });

    it('should return > 0.5 when player A is higher rated', () => {
      const expected = expectedScore(1400, 1200);
      expect(expected).toBeGreaterThan(0.5);
    });

    it('should return < 0.5 when player A is lower rated', () => {
      const expected = expectedScore(1000, 1200);
      expect(expected).toBeLessThan(0.5);
    });

    it('should be symmetric: E(A,B) + E(B,A) = 1', () => {
      const eAB = expectedScore(1400, 1200);
      const eBA = expectedScore(1200, 1400);
      expect(eAB + eBA).toBeCloseTo(1.0, 10);
    });

    it('should approach 1 for very large rating differences', () => {
      const expected = expectedScore(2000, 1000);
      expect(expected).toBeGreaterThan(0.99);
    });

    it('should approach 0 for very large negative rating differences', () => {
      const expected = expectedScore(1000, 2000);
      expect(expected).toBeLessThan(0.01);
    });

    it('should return ~0.76 for 200-point advantage', () => {
      const expected = expectedScore(1400, 1200);
      expect(expected).toBeCloseTo(0.76, 1);
    });
  });

  // -----------------------------------------------------------------------
  // calculateNewRating
  // -----------------------------------------------------------------------

  describe('calculateNewRating', () => {
    it('should increase rating on win', () => {
      const newRating = calculateNewRating(1200, 0.5, 1, 20);
      expect(newRating).toBeGreaterThan(1200);
    });

    it('should decrease rating on loss', () => {
      const newRating = calculateNewRating(1200, 0.5, 0, 20);
      expect(newRating).toBeLessThan(1200);
    });

    it('should not change much when result matches expectation', () => {
      // Win against much lower rated player (expected = 0.99)
      const newRating = calculateNewRating(1600, 0.99, 1, 20);
      expect(newRating - 1600).toBeLessThanOrEqual(1);
    });

    it('should change a lot when result is unexpected', () => {
      // Win against much higher rated player (expected = 0.01)
      const newRating = calculateNewRating(1000, 0.01, 1, 20);
      expect(newRating - 1000).toBeGreaterThan(15);
    });

    it('should never go below MIN_RATING', () => {
      const newRating = calculateNewRating(MIN_RATING, 0.99, 0, 40);
      expect(newRating).toBe(MIN_RATING);
    });

    it('should use K-factor correctly', () => {
      const ratingK40 = calculateNewRating(1200, 0.5, 1, 40);
      const ratingK10 = calculateNewRating(1200, 0.5, 1, 10);
      expect(ratingK40 - 1200).toBeGreaterThan(ratingK10 - 1200);
    });
  });

  // -----------------------------------------------------------------------
  // calculateMultiplayerRatings
  // -----------------------------------------------------------------------

  describe('calculateMultiplayerRatings', () => {
    it('should calculate ratings for a 2-player game', () => {
      const playerRatings = new Map([
        ['alice', { rating: 1200, gamesPlayed: 50 }],
        ['bob', { rating: 1200, gamesPlayed: 50 }],
      ]);

      const updates = calculateMultiplayerRatings('alice', playerRatings);

      expect(updates).toHaveLength(2);

      const aliceUpdate = updates.find(u => u.userId === 'alice')!;
      const bobUpdate = updates.find(u => u.userId === 'bob')!;

      // Winner gains, loser loses
      expect(aliceUpdate.ratingChange).toBeGreaterThan(0);
      expect(bobUpdate.ratingChange).toBeLessThan(0);

      // Changes should be symmetric for equal ratings
      expect(Math.abs(aliceUpdate.ratingChange)).toBe(Math.abs(bobUpdate.ratingChange));
    });

    it('should give larger gain for upset wins', () => {
      const playerRatings = new Map([
        ['underdog', { rating: 1000, gamesPlayed: 50 }],
        ['favorite', { rating: 1400, gamesPlayed: 50 }],
      ]);

      const updates = calculateMultiplayerRatings('underdog', playerRatings);

      const underdogUpdate = updates.find(u => u.userId === 'underdog')!;
      expect(underdogUpdate.ratingChange).toBeGreaterThan(10);
    });

    it('should give smaller gain for expected wins', () => {
      const playerRatings = new Map([
        ['favorite', { rating: 1400, gamesPlayed: 50 }],
        ['underdog', { rating: 1000, gamesPlayed: 50 }],
      ]);

      const updates = calculateMultiplayerRatings('favorite', playerRatings);

      const favoriteUpdate = updates.find(u => u.userId === 'favorite')!;
      expect(favoriteUpdate.ratingChange).toBeLessThan(10);
    });

    it('should handle 3+ player games', () => {
      const playerRatings = new Map([
        ['p1', { rating: 1200, gamesPlayed: 50 }],
        ['p2', { rating: 1200, gamesPlayed: 50 }],
        ['p3', { rating: 1200, gamesPlayed: 50 }],
      ]);

      const updates = calculateMultiplayerRatings('p1', playerRatings);

      expect(updates).toHaveLength(3);
      const winner = updates.find(u => u.userId === 'p1')!;
      expect(winner.ratingChange).toBeGreaterThan(0);
    });

    it('should return empty array for missing winner', () => {
      const playerRatings = new Map([
        ['alice', { rating: 1200, gamesPlayed: 50 }],
      ]);

      const updates = calculateMultiplayerRatings('bob', playerRatings);
      expect(updates).toHaveLength(0);
    });

    it('should use higher K-factor for new players', () => {
      const newPlayerRatings = new Map([
        ['newbie', { rating: 1200, gamesPlayed: 5 }],
        ['veteran', { rating: 1200, gamesPlayed: 5 }],
      ]);

      const veteranRatings = new Map([
        ['newbie', { rating: 1200, gamesPlayed: 200 }],
        ['veteran', { rating: 1200, gamesPlayed: 200 }],
      ]);

      const newUpdates = calculateMultiplayerRatings('newbie', newPlayerRatings);
      const vetUpdates = calculateMultiplayerRatings('newbie', veteranRatings);

      const newWinnerChange = newUpdates.find(u => u.userId === 'newbie')!.ratingChange;
      const vetWinnerChange = vetUpdates.find(u => u.userId === 'newbie')!.ratingChange;

      expect(newWinnerChange).toBeGreaterThan(vetWinnerChange);
    });

    it('should preserve ratingBefore in updates', () => {
      const playerRatings = new Map([
        ['alice', { rating: 1300, gamesPlayed: 50 }],
        ['bob', { rating: 1100, gamesPlayed: 50 }],
      ]);

      const updates = calculateMultiplayerRatings('alice', playerRatings);

      const aliceUpdate = updates.find(u => u.userId === 'alice')!;
      expect(aliceUpdate.ratingBefore).toBe(1300);
      expect(aliceUpdate.ratingAfter).toBe(1300 + aliceUpdate.ratingChange);
    });
  });

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------

  describe('constants', () => {
    it('should have sensible defaults', () => {
      expect(INITIAL_RATING).toBe(1200);
      expect(MIN_RATING).toBe(100);
    });
  });
});
