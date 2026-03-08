/**
 * Tests for leaderboard REST API routes.
 *
 * Uses raw HTTP requests against an Express app since supertest is not
 * available. Tests focus on route wiring and response shapes.
 *
 * @see server/src/modules/leaderboard/routes.ts
 */

import { createServer, type Server } from 'node:http';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockGetLeaderboard = vi.fn();
const mockGetPlayerLeaderboardEntry = vi.fn();
const mockGetNearbyLeaderboard = vi.fn();
const mockGetPlayerMatchHistory = vi.fn();

vi.mock('./leaderboard-service.js', () => ({
  getLeaderboard: (...args: unknown[]) => mockGetLeaderboard(...args),
  getPlayerLeaderboardEntry: (...args: unknown[]) => mockGetPlayerLeaderboardEntry(...args),
  getNearbyLeaderboard: (...args: unknown[]) => mockGetNearbyLeaderboard(...args),
  getPlayerMatchHistory: (...args: unknown[]) => mockGetPlayerMatchHistory(...args),
}));

vi.mock('../../shared/config/index.js', () => ({
  getConfig: () => ({
    JWT_SECRET: 'test-secret-that-is-long-enough-for-jwt',
  }),
}));

vi.mock('../../shared/middleware/auth-middleware.js', () => ({
  createAuthMiddleware: () => (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = 'test-user-id';
    req.username = 'testuser';
    next();
  },
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

import { createLeaderboardRouter } from './routes.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/leaderboard', createLeaderboardRouter());
  return app;
}

async function httpGet(
  server: Server,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server not listening');
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeaderboardRoutes', () => {
  let app: express.Express;
  let server: Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createTestApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('GET /api/v1/leaderboard', () => {
    it('should return top players', async () => {
      const entries = [
        { rank: 1, userId: 'a', username: 'alice', rating: 1500, gamesPlayed: 100, gamesWon: 60, winRate: 0.6 },
      ];
      mockGetLeaderboard.mockResolvedValue(entries);

      const { status, body } = await httpGet(server, '/api/v1/leaderboard');

      expect(status).toBe(200);
      expect(body['success']).toBe(true);
      expect((body['data'] as Record<string, unknown>)['entries']).toEqual(entries);
    });

    it('should respect limit and offset query params', async () => {
      mockGetLeaderboard.mockResolvedValue([]);

      await httpGet(server, '/api/v1/leaderboard?limit=10&offset=20');

      expect(mockGetLeaderboard).toHaveBeenCalledWith(10, 20);
    });

    it('should cap limit at 100', async () => {
      mockGetLeaderboard.mockResolvedValue([]);

      await httpGet(server, '/api/v1/leaderboard?limit=500');

      expect(mockGetLeaderboard).toHaveBeenCalledWith(100, 0);
    });
  });

  describe('GET /api/v1/leaderboard/me', () => {
    it('should return current user rank', async () => {
      const entry = { rank: 5, userId: 'test-user-id', username: 'testuser', rating: 1400, gamesPlayed: 50, gamesWon: 30, winRate: 0.6 };
      mockGetPlayerLeaderboardEntry.mockResolvedValue(entry);

      const { status, body } = await httpGet(server, '/api/v1/leaderboard/me');

      expect(status).toBe(200);
      expect((body['data'] as Record<string, unknown>)['entry']).toEqual(entry);
    });

    it('should return null entry for unranked players', async () => {
      mockGetPlayerLeaderboardEntry.mockResolvedValue(null);

      const { status, body } = await httpGet(server, '/api/v1/leaderboard/me');

      expect(status).toBe(200);
      expect((body['data'] as Record<string, unknown>)['entry']).toBeNull();
    });
  });

  describe('GET /api/v1/leaderboard/nearby', () => {
    it('should return nearby players', async () => {
      mockGetNearbyLeaderboard.mockResolvedValue([]);

      const { status } = await httpGet(server, '/api/v1/leaderboard/nearby');

      expect(status).toBe(200);
      expect(mockGetNearbyLeaderboard).toHaveBeenCalledWith('test-user-id', 5);
    });
  });

  describe('GET /api/v1/leaderboard/history', () => {
    it('should return match history', async () => {
      const history = [
        { gameId: '1', result: 'win', ratingChange: 10, ratingAfter: 1210, playedAt: '2024-01-01' },
      ];
      mockGetPlayerMatchHistory.mockResolvedValue(history);

      const { status, body } = await httpGet(server, '/api/v1/leaderboard/history');

      expect(status).toBe(200);
      expect((body['data'] as Record<string, unknown>)['history']).toEqual(history);
    });
  });
});
