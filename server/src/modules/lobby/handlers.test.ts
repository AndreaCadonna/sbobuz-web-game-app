/**
 * Tests for lobby module handlers.
 *
 * Mocks the room service and validates handler behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ---- Mock logger ----
vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---- Mock room service ----
const mockRoomService = {
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  setReady: vi.fn(),
  startGame: vi.fn(),
  addAIPlayer: vi.fn(),
  removePlayer: vi.fn(),
  updateSettings: vi.fn(),
  getRoomDetails: vi.fn(),
  listRooms: vi.fn(),
};

vi.mock('./room-service.js', () => mockRoomService);

// ---- Import handlers ----
const {
  createRoom,
  listRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  setReady,
  startGame,
  addAIPlayer,
  removePlayer,
  updateSettings,
} = await import('./handlers.js');

// ---- Helpers ----

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    userId: 'user-1',
    username: 'testuser',
    userEmail: 'test@example.com',
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { _json: unknown; _status: number } {
  const res = {
    _json: undefined as unknown,
    _status: 200,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res as unknown as Response & { _json: unknown; _status: number };
}

const sampleRoom = {
  roomId: 'room-1',
  hostId: 'user-1',
  name: 'Test Room',
  settings: { maxPlayers: 4, turnTimerSeconds: 60, allowAI: true, disconnectGraceSeconds: 30 },
  players: [{ userId: 'user-1', username: 'testuser', displayName: 'testuser', isReady: false, isHost: true, isAI: false, joinedAt: '2026-01-01T00:00:00.000Z', connectionStatus: 'connected' }],
  status: 'WAITING' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  maxPlayers: 4,
  minPlayers: 2,
  isPrivate: false,
  inviteCode: 'ABCD1234',
  ttlSeconds: 1800,
  lastActivityAt: '2026-01-01T00:00:00.000Z',
};

describe('Lobby Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRoom', () => {
    it('should create a room and return 201', async () => {
      mockRoomService.createRoom.mockResolvedValue({
        room: sampleRoom,
        inviteCode: 'ABCD1234',
      });

      const req = mockReq({ body: { name: 'Test Room' } });
      const res = mockRes();

      await createRoom(req, res);

      expect(res._status).toBe(201);
      expect(res._json).toEqual({
        success: true,
        data: { room: sampleRoom, inviteCode: 'ABCD1234' },
      });
    });

    it('should throw if not authenticated', async () => {
      const req = mockReq({ userId: undefined, username: undefined });
      const res = mockRes();

      await expect(createRoom(req, res)).rejects.toThrow('Authentication required');
    });
  });

  describe('listRooms', () => {
    it('should list rooms and return 200', async () => {
      const rooms = [{ roomId: 'r1', name: 'Room 1', hostDisplayName: 'Host', playerCount: 1, maxPlayers: 4 }];
      mockRoomService.listRooms.mockResolvedValue(rooms);

      const req = mockReq();
      const res = mockRes();

      await listRooms(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ success: true, data: { rooms } });
    });
  });

  describe('getRoom', () => {
    it('should return room details', async () => {
      mockRoomService.getRoomDetails.mockResolvedValue(sampleRoom);

      const req = mockReq({ params: { roomId: 'room-1' } });
      const res = mockRes();

      await getRoom(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ success: true, data: { room: sampleRoom } });
    });
  });

  describe('joinRoom', () => {
    it('should join a room by roomId', async () => {
      mockRoomService.joinRoom.mockResolvedValue(sampleRoom);

      const req = mockReq({ body: { roomId: 'room-1' } });
      const res = mockRes();

      await joinRoom(req, res);

      expect(res._status).toBe(200);
      expect(mockRoomService.joinRoom).toHaveBeenCalledWith(
        'user-1', 'testuser', 'testuser', 'room-1', undefined,
      );
    });
  });

  describe('leaveRoom', () => {
    it('should leave a room', async () => {
      mockRoomService.leaveRoom.mockResolvedValue({
        room: sampleRoom,
        hostTransferred: false,
      });

      const req = mockReq({ params: { roomId: 'room-1' } });
      const res = mockRes();

      await leaveRoom(req, res);

      expect(res._status).toBe(200);
    });

    it('should return null room if room was deleted', async () => {
      mockRoomService.leaveRoom.mockResolvedValue({
        room: undefined,
        hostTransferred: false,
      });

      const req = mockReq({ params: { roomId: 'room-1' } });
      const res = mockRes();

      await leaveRoom(req, res);

      expect(res._status).toBe(200);
      const data = (res._json as { data: { room: unknown } }).data;
      expect(data.room).toBeNull();
    });
  });

  describe('setReady', () => {
    it('should toggle ready state', async () => {
      mockRoomService.setReady.mockResolvedValue(sampleRoom);

      const req = mockReq({ params: { roomId: 'room-1' }, body: { isReady: true } });
      const res = mockRes();

      await setReady(req, res);

      expect(res._status).toBe(200);
      expect(mockRoomService.setReady).toHaveBeenCalledWith('user-1', 'room-1', true);
    });
  });

  describe('startGame', () => {
    it('should start a game', async () => {
      mockRoomService.startGame.mockResolvedValue({
        gameId: 'game-1',
        room: { ...sampleRoom, status: 'IN_GAME' },
      });

      const req = mockReq({ params: { roomId: 'room-1' } });
      const res = mockRes();

      await startGame(req, res);

      expect(res._status).toBe(200);
      const data = (res._json as { data: { gameId: string } }).data;
      expect(data.gameId).toBe('game-1');
    });
  });

  describe('addAIPlayer', () => {
    it('should add an AI player and return 201', async () => {
      mockRoomService.addAIPlayer.mockResolvedValue(sampleRoom);

      const req = mockReq({ params: { roomId: 'room-1' }, body: { difficulty: 'easy' } });
      const res = mockRes();

      await addAIPlayer(req, res);

      expect(res._status).toBe(201);
      expect(mockRoomService.addAIPlayer).toHaveBeenCalledWith('user-1', 'room-1', 'easy');
    });
  });

  describe('removePlayer', () => {
    it('should remove a player', async () => {
      mockRoomService.removePlayer.mockResolvedValue(sampleRoom);

      const req = mockReq({ params: { roomId: 'room-1', userId: 'user-2' } });
      const res = mockRes();

      await removePlayer(req, res);

      expect(res._status).toBe(200);
      expect(mockRoomService.removePlayer).toHaveBeenCalledWith('user-1', 'room-1', 'user-2');
    });
  });

  describe('updateSettings', () => {
    it('should update settings', async () => {
      mockRoomService.updateSettings.mockResolvedValue(sampleRoom);

      const req = mockReq({ params: { roomId: 'room-1' }, body: { turnTimerSeconds: 90 } });
      const res = mockRes();

      await updateSettings(req, res);

      expect(res._status).toBe(200);
      expect(mockRoomService.updateSettings).toHaveBeenCalledWith('user-1', 'room-1', { turnTimerSeconds: 90 });
    });
  });
});
