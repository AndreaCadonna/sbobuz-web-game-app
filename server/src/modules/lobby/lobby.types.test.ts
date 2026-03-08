/**
 * Tests for lobby types and helper functions.
 */

import { describe, it, expect } from 'vitest';

import type { Room } from './lobby.types.js';
import {
  computeRoomStatus,
  toRoomState,
  DEFAULT_ROOM_SETTINGS,
  ROOM_TTL_SECONDS,
  MIN_PLAYERS,
} from './lobby.types.js';

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    roomId: 'room-1',
    hostId: 'host-1',
    name: 'Test Room',
    settings: DEFAULT_ROOM_SETTINGS,
    players: [],
    status: 'WAITING',
    createdAt: '2026-01-01T00:00:00.000Z',
    maxPlayers: 4,
    minPlayers: MIN_PLAYERS,
    isPrivate: false,
    inviteCode: 'ABCD1234',
    ttlSeconds: ROOM_TTL_SECONDS,
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePlayer(overrides: Partial<Room['players'][0]> = {}): Room['players'][0] {
  return {
    userId: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    isReady: false,
    isHost: false,
    isAI: false,
    joinedAt: '2026-01-01T00:00:00.000Z',
    connectionStatus: 'connected',
    ...overrides,
  };
}

describe('lobby.types', () => {
  describe('constants', () => {
    it('should have correct default settings', () => {
      expect(DEFAULT_ROOM_SETTINGS.maxPlayers).toBe(4);
      expect(DEFAULT_ROOM_SETTINGS.turnTimerSeconds).toBe(60);
      expect(DEFAULT_ROOM_SETTINGS.allowAI).toBe(true);
      expect(DEFAULT_ROOM_SETTINGS.disconnectGraceSeconds).toBe(30);
    });

    it('should have correct TTL', () => {
      expect(ROOM_TTL_SECONDS).toBe(1800);
    });

    it('should have correct min players', () => {
      expect(MIN_PLAYERS).toBe(2);
    });
  });

  describe('computeRoomStatus', () => {
    it('should return WAITING when no players are ready', () => {
      const room = makeRoom({
        players: [
          makePlayer({ userId: 'user-1', isHost: true }),
          makePlayer({ userId: 'user-2' }),
        ],
      });
      expect(computeRoomStatus(room)).toBe('WAITING');
    });

    it('should return WAITING when only some humans are ready', () => {
      const room = makeRoom({
        players: [
          makePlayer({ userId: 'user-1', isHost: true, isReady: true }),
          makePlayer({ userId: 'user-2', isReady: false }),
        ],
      });
      expect(computeRoomStatus(room)).toBe('WAITING');
    });

    it('should return READY when all humans are ready and min met', () => {
      const room = makeRoom({
        players: [
          makePlayer({ userId: 'user-1', isHost: true, isReady: true }),
          makePlayer({ userId: 'user-2', isReady: true }),
        ],
      });
      expect(computeRoomStatus(room)).toBe('READY');
    });

    it('should return WAITING when only 1 player even if ready', () => {
      const room = makeRoom({
        players: [
          makePlayer({ userId: 'user-1', isHost: true, isReady: true }),
        ],
      });
      expect(computeRoomStatus(room)).toBe('WAITING');
    });

    it('should ignore AI ready state', () => {
      const room = makeRoom({
        players: [
          makePlayer({ userId: 'user-1', isHost: true, isReady: true }),
          makePlayer({ userId: 'ai_easy_1', isAI: true, isReady: false }),
        ],
      });
      expect(computeRoomStatus(room)).toBe('READY');
    });

    it('should preserve IN_GAME status', () => {
      const room = makeRoom({ status: 'IN_GAME', players: [] });
      expect(computeRoomStatus(room)).toBe('IN_GAME');
    });

    it('should preserve COMPLETED status', () => {
      const room = makeRoom({ status: 'COMPLETED', players: [] });
      expect(computeRoomStatus(room)).toBe('COMPLETED');
    });

    it('should preserve EXPIRED status', () => {
      const room = makeRoom({ status: 'EXPIRED', players: [] });
      expect(computeRoomStatus(room)).toBe('EXPIRED');
    });

    it('should return WAITING with no human players', () => {
      const room = makeRoom({
        players: [
          makePlayer({ userId: 'ai_easy_1', isAI: true, isReady: true }),
          makePlayer({ userId: 'ai_easy_2', isAI: true, isReady: true }),
        ],
      });
      expect(computeRoomStatus(room)).toBe('WAITING');
    });
  });

  describe('toRoomState', () => {
    it('should convert Room to RoomState', () => {
      const room = makeRoom({
        players: [makePlayer({ userId: 'user-1', isHost: true })],
      });

      const state = toRoomState(room);

      expect(state.roomId).toBe('room-1');
      expect(state.hostId).toBe('host-1');
      expect(state.name).toBe('Test Room');
      expect(state.players).toHaveLength(1);
      expect(state.status).toBe('WAITING');
      expect(state.isPrivate).toBe(false);
      expect(state.inviteCode).toBe('ABCD1234');
    });

    it('should not include gameId in RoomState', () => {
      const room = makeRoom({ gameId: 'game-1' });
      const state = toRoomState(room);

      // RoomState (shared type) does not have gameId
      expect('gameId' in state).toBe(false);
    });
  });
});
