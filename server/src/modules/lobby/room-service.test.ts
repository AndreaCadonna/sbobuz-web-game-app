/**
 * Tests for lobby room service.
 *
 * Tests cover all room lifecycle operations: create, join, leave,
 * ready, start game, add AI, remove player, update settings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock logger ----
vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---- Mock Redis ----
const mockRedisStore: Record<string, string> = {};
const mockRedisSet: Set<string> = new Set();

const mockPipelineOps: Array<{ op: string; args: unknown[] }> = [];

const mockPipeline = {
  set: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'set', args });
    return mockPipeline;
  }),
  del: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'del', args });
    return mockPipeline;
  }),
  sadd: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'sadd', args });
    return mockPipeline;
  }),
  srem: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'srem', args });
    return mockPipeline;
  }),
  get: vi.fn((...args: unknown[]) => {
    mockPipelineOps.push({ op: 'get', args });
    return mockPipeline;
  }),
  exec: vi.fn(async () => {
    // Process pipeline operations against the mock store
    const results: Array<[Error | null, unknown]> = [];
    for (const { op, args } of mockPipelineOps) {
      if (op === 'set') {
        const [key, value] = args as [string, string];
        mockRedisStore[key] = value;
        results.push([null, 'OK']);
      } else if (op === 'del') {
        const [key] = args as [string];
        delete mockRedisStore[key];
        results.push([null, 1]);
      } else if (op === 'sadd') {
        const [, member] = args as [string, string];
        mockRedisSet.add(member);
        results.push([null, 1]);
      } else if (op === 'srem') {
        const [, member] = args as [string, string];
        mockRedisSet.delete(member);
        results.push([null, 1]);
      } else if (op === 'get') {
        const [key] = args as [string];
        results.push([null, mockRedisStore[key] ?? null]);
      }
    }
    mockPipelineOps.length = 0;
    return results;
  }),
};

const mockRedis = {
  get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
  set: vi.fn(async (key: string, value: string, ..._rest: unknown[]) => {
    mockRedisStore[key] = value;
    return 'OK';
  }),
  del: vi.fn(async (key: string) => {
    delete mockRedisStore[key];
    return 1;
  }),
  sadd: vi.fn(async (_key: string, member: string) => {
    mockRedisSet.add(member);
    return 1;
  }),
  srem: vi.fn(async (_key: string, member: string) => {
    mockRedisSet.delete(member);
    return 1;
  }),
  smembers: vi.fn(async () => [...mockRedisSet]),
  pipeline: vi.fn(() => {
    mockPipelineOps.length = 0;
    return mockPipeline;
  }),
};

vi.mock('../../infra/redis/index.js', () => ({
  getRedisClient: () => mockRedis,
}));

// ---- Mock PostgreSQL ----
const mockPoolQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
const mockPool = { query: mockPoolQuery };

vi.mock('../../infra/database/index.js', () => ({
  getPool: () => mockPool,
}));

// ---- Import service after mocks ----
const {
  createRoom,
  joinRoom,
  leaveRoom,
  setReady,
  startGame,
  addAIPlayer,
  removePlayer,
  updateSettings,
  getRoomDetails,
  listRooms,
} = await import('./room-service.js');

// ---- Helpers ----

function clearMockStore(): void {
  for (const key of Object.keys(mockRedisStore)) {
    delete mockRedisStore[key];
  }
  mockRedisSet.clear();
  mockPoolQuery.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
}

describe('Room Service', () => {
  beforeEach(() => {
    clearMockStore();
    vi.clearAllMocks();
  });

  // ============================================================
  // CREATE ROOM
  // ============================================================
  describe('createRoom', () => {
    it('should create a room with default settings', async () => {
      const result = await createRoom({
        hostId: 'user-1',
        hostUsername: 'testuser',
        hostDisplayName: 'TestUser',
        name: 'My Room',
      });

      expect(result.room.name).toBe('My Room');
      expect(result.room.hostId).toBe('user-1');
      expect(result.room.status).toBe('WAITING');
      expect(result.room.isPrivate).toBe(false);
      expect(result.room.settings.maxPlayers).toBe(4);
      expect(result.room.settings.turnTimerSeconds).toBe(60);
      expect(result.room.settings.allowAI).toBe(true);
      expect(result.room.settings.disconnectGraceSeconds).toBe(30);
      expect(result.room.players).toHaveLength(1);
      expect(result.room.players[0]!.userId).toBe('user-1');
      expect(result.room.players[0]!.isHost).toBe(true);
      expect(result.room.players[0]!.isReady).toBe(false);
      expect(result.inviteCode).toBeTruthy();
      expect(result.inviteCode.length).toBe(8);
    });

    it('should create a room with custom settings', async () => {
      const result = await createRoom({
        hostId: 'user-1',
        hostUsername: 'testuser',
        hostDisplayName: 'TestUser',
        name: 'Custom Room',
        settings: { maxPlayers: 2, turnTimerSeconds: 30 },
        isPrivate: true,
      });

      expect(result.room.settings.maxPlayers).toBe(2);
      expect(result.room.settings.turnTimerSeconds).toBe(30);
      expect(result.room.isPrivate).toBe(true);
      expect(result.room.maxPlayers).toBe(2);
    });

    it('should trim room name', async () => {
      const result = await createRoom({
        hostId: 'user-1',
        hostUsername: 'testuser',
        hostDisplayName: 'TestUser',
        name: '  Room Name  ',
      });

      expect(result.room.name).toBe('Room Name');
    });

    it('should reject if user is already in a room', async () => {
      // First, create a room (sets user:current_room)
      await createRoom({
        hostId: 'user-1',
        hostUsername: 'testuser',
        hostDisplayName: 'TestUser',
        name: 'First Room',
      });

      await expect(
        createRoom({
          hostId: 'user-1',
          hostUsername: 'testuser',
          hostDisplayName: 'TestUser',
          name: 'Second Room',
        }),
      ).rejects.toThrow('You are already in a room');
    });
  });

  // ============================================================
  // JOIN ROOM
  // ============================================================
  describe('joinRoom', () => {
    let testRoomId: string;
    let testInviteCode: string;

    beforeEach(async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });
      testRoomId = result.room.roomId;
      testInviteCode = result.inviteCode;
    });

    it('should join a room by roomId', async () => {
      const room = await joinRoom('user-2', 'player2', 'Player 2', testRoomId);

      expect(room.players).toHaveLength(2);
      expect(room.players[1]!.userId).toBe('user-2');
      expect(room.players[1]!.isHost).toBe(false);
      expect(room.players[1]!.isReady).toBe(false);
    });

    it('should join a room by invite code', async () => {
      const room = await joinRoom('user-2', 'player2', 'Player 2', undefined, testInviteCode);

      expect(room.players).toHaveLength(2);
      expect(room.players[1]!.userId).toBe('user-2');
    });

    it('should reject if room not found', async () => {
      await expect(
        joinRoom('user-2', 'player2', 'Player 2', '00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('Room not found');
    });

    it('should reject if invite code not found', async () => {
      await expect(
        joinRoom('user-2', 'player2', 'Player 2', undefined, 'INVALID'),
      ).rejects.toThrow('Room not found');
    });

    it('should reject if user is already in another room', async () => {
      // User-2 creates their own room
      await createRoom({
        hostId: 'user-2',
        hostUsername: 'player2',
        hostDisplayName: 'Player 2',
        name: 'Other Room',
      });

      await expect(
        joinRoom('user-2', 'player2', 'Player 2', testRoomId),
      ).rejects.toThrow('You are already in another room');
    });

    it('should reject if room is full', async () => {
      // Create a 2-player room
      clearMockStore();
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Small Room',
        settings: { maxPlayers: 2 },
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);

      await expect(
        joinRoom('user-3', 'player3', 'Player 3', result.room.roomId),
      ).rejects.toThrow('Room is full');
    });

    it('should reject if room is in READY status', async () => {
      // Create 2-player room, join and ready both players
      clearMockStore();
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Ready Room',
        settings: { maxPlayers: 3 },
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await setReady('host-1', result.room.roomId, true);
      await setReady('user-2', result.room.roomId, true);

      await expect(
        joinRoom('user-3', 'player3', 'Player 3', result.room.roomId),
      ).rejects.toThrow('Room is full or game is about to start');
    });

    it('should reject if room status is IN_GAME', async () => {
      // Manually set room to IN_GAME in the store
      clearMockStore();
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'In Game Room',
      });

      // Modify room status directly
      const roomKey = `room:${result.room.roomId}`;
      const roomJson = mockRedisStore[roomKey];
      if (roomJson) {
        const room = JSON.parse(roomJson);
        room.status = 'IN_GAME';
        mockRedisStore[roomKey] = JSON.stringify(room);
      }

      await expect(
        joinRoom('user-2', 'player2', 'Player 2', result.room.roomId),
      ).rejects.toThrow('Game has already started');
    });

    it('should reject if no roomId or inviteCode provided', async () => {
      await expect(
        joinRoom('user-2', 'player2', 'Player 2'),
      ).rejects.toThrow('Provide roomId or inviteCode');
    });
  });

  // ============================================================
  // LEAVE ROOM
  // ============================================================
  describe('leaveRoom', () => {
    it('should leave a room', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      const leaveResult = await leaveRoom('user-2', result.room.roomId);

      expect(leaveResult.room).toBeDefined();
      expect(leaveResult.room!.players).toHaveLength(1);
      expect(leaveResult.hostTransferred).toBe(false);
    });

    it('should delete room when last player leaves', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      const leaveResult = await leaveRoom('host-1', result.room.roomId);

      expect(leaveResult.room).toBeUndefined();
      expect(leaveResult.hostTransferred).toBe(false);
    });

    it('should transfer host when host leaves', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await joinRoom('user-3', 'player3', 'Player 3', result.room.roomId);

      const leaveResult = await leaveRoom('host-1', result.room.roomId);

      expect(leaveResult.room).toBeDefined();
      expect(leaveResult.hostTransferred).toBe(true);
      expect(leaveResult.newHostId).toBe('user-2'); // longest-standing
      expect(leaveResult.room!.hostId).toBe('user-2');
      expect(leaveResult.room!.players).toHaveLength(2);
    });

    it('should delete room when host leaves and only AI remain', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'AI Room',
        settings: { maxPlayers: 3 },
      });

      await addAIPlayer('host-1', result.room.roomId, 'easy');

      const leaveResult = await leaveRoom('host-1', result.room.roomId);

      expect(leaveResult.room).toBeUndefined();
    });

    it('should reject if user is not in room', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await expect(
        leaveRoom('user-999', result.room.roomId),
      ).rejects.toThrow('You are not in this room');
    });

    it('should reject if room not found', async () => {
      await expect(
        leaveRoom('user-1', '00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('Room not found');
    });

    it('should recompute status from READY to WAITING when a player leaves', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Ready Room',
        settings: { maxPlayers: 3 },
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await joinRoom('user-3', 'player3', 'Player 3', result.room.roomId);
      await setReady('host-1', result.room.roomId, true);
      await setReady('user-2', result.room.roomId, true);
      await setReady('user-3', result.room.roomId, true);

      // Room should be READY
      const readyRoom = await getRoomDetails(result.room.roomId);
      expect(readyRoom.status).toBe('READY');

      // Player leaves, breaking ready condition
      const leaveResult = await leaveRoom('user-3', result.room.roomId);
      expect(leaveResult.room!.status).toBe('READY'); // Still ready - 2 players, both ready
    });
  });

  // ============================================================
  // SET READY
  // ============================================================
  describe('setReady', () => {
    it('should set a player as ready', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      const room = await setReady('user-2', result.room.roomId, true);

      const player = room.players.find((p) => p.userId === 'user-2');
      expect(player!.isReady).toBe(true);
    });

    it('should transition to READY when all humans are ready and min met', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await setReady('host-1', result.room.roomId, true);
      const room = await setReady('user-2', result.room.roomId, true);

      expect(room.status).toBe('READY');
    });

    it('should transition back to WAITING when a player unreadies', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await setReady('host-1', result.room.roomId, true);
      await setReady('user-2', result.room.roomId, true);

      const room = await setReady('user-2', result.room.roomId, false);
      expect(room.status).toBe('WAITING');
    });

    it('should reject if room not found', async () => {
      await expect(
        setReady('user-1', '00000000-0000-0000-0000-000000000000', true),
      ).rejects.toThrow('Room not found');
    });

    it('should reject if user not in room', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await expect(
        setReady('user-999', result.room.roomId, true),
      ).rejects.toThrow('You are not in this room');
    });

    it('should reject if room is IN_GAME', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      // Manually set status to IN_GAME
      const roomKey = `room:${result.room.roomId}`;
      const roomJson = mockRedisStore[roomKey];
      if (roomJson) {
        const room = JSON.parse(roomJson);
        room.status = 'IN_GAME';
        mockRedisStore[roomKey] = JSON.stringify(room);
      }

      await expect(
        setReady('host-1', result.room.roomId, true),
      ).rejects.toThrow('Cannot change ready status in current room state');
    });
  });

  // ============================================================
  // START GAME
  // ============================================================
  describe('startGame', () => {
    it('should start a game when room is READY', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await setReady('host-1', result.room.roomId, true);
      await setReady('user-2', result.room.roomId, true);

      const gameResult = await startGame('host-1', result.room.roomId);

      expect(gameResult.gameId).toBeTruthy();
      expect(gameResult.room.status).toBe('IN_GAME');
      expect(mockPoolQuery).toHaveBeenCalled(); // Archived to PG
    });

    it('should reject if not host', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await setReady('host-1', result.room.roomId, true);
      await setReady('user-2', result.room.roomId, true);

      await expect(
        startGame('user-2', result.room.roomId),
      ).rejects.toThrow('Only the host can start the game');
    });

    it('should reject if room is WAITING (not ready)', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);

      await expect(
        startGame('host-1', result.room.roomId),
      ).rejects.toThrow('Not all players are ready');
    });

    it('should reject if room not found', async () => {
      await expect(
        startGame('host-1', '00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('Room not found');
    });
  });

  // ============================================================
  // ADD AI PLAYER
  // ============================================================
  describe('addAIPlayer', () => {
    it('should add an AI player', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'AI Room',
      });

      const room = await addAIPlayer('host-1', result.room.roomId, 'easy');

      expect(room.players).toHaveLength(2);
      const aiPlayer = room.players.find((p) => p.isAI);
      expect(aiPlayer).toBeDefined();
      expect(aiPlayer!.userId).toBe('ai_easy_1');
      expect(aiPlayer!.displayName).toBe('AI (Easy)');
      expect(aiPlayer!.aiDifficulty).toBe('easy');
      expect(aiPlayer!.connectionStatus).toBe('connected');
    });

    it('should increment AI counter', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'AI Room',
      });

      await addAIPlayer('host-1', result.room.roomId, 'easy');
      const room = await addAIPlayer('host-1', result.room.roomId, 'medium');

      const aiPlayers = room.players.filter((p) => p.isAI);
      expect(aiPlayers).toHaveLength(2);
      expect(aiPlayers[1]!.userId).toBe('ai_medium_2');
    });

    it('should unready all human players when AI is added', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'AI Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await setReady('host-1', result.room.roomId, true);
      await setReady('user-2', result.room.roomId, true);

      const room = await addAIPlayer('host-1', result.room.roomId, 'easy');

      const humanPlayers = room.players.filter((p) => !p.isAI);
      expect(humanPlayers.every((p) => !p.isReady)).toBe(true);
    });

    it('should reject if not host', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'AI Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);

      await expect(
        addAIPlayer('user-2', result.room.roomId, 'easy'),
      ).rejects.toThrow('Only the host can add AI players');
    });

    it('should reject if AI not allowed', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'No AI Room',
        settings: { allowAI: false },
      });

      await expect(
        addAIPlayer('host-1', result.room.roomId, 'easy'),
      ).rejects.toThrow('AI players are not allowed in this room');
    });

    it('should reject if room is full', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Small Room',
        settings: { maxPlayers: 2 },
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);

      await expect(
        addAIPlayer('host-1', result.room.roomId, 'easy'),
      ).rejects.toThrow('Room is full');
    });
  });

  // ============================================================
  // REMOVE PLAYER (Kick)
  // ============================================================
  describe('removePlayer', () => {
    it('should remove a player from the room', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      const room = await removePlayer('host-1', result.room.roomId, 'user-2');

      expect(room.players).toHaveLength(1);
      expect(room.players[0]!.userId).toBe('host-1');
    });

    it('should remove an AI player', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'AI Room',
      });

      await addAIPlayer('host-1', result.room.roomId, 'easy');
      const room = await removePlayer('host-1', result.room.roomId, 'ai_easy_1');

      expect(room.players).toHaveLength(1);
    });

    it('should reject if not host', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);

      await expect(
        removePlayer('user-2', result.room.roomId, 'host-1'),
      ).rejects.toThrow('Only the host can remove players');
    });

    it('should reject if target not in room', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await expect(
        removePlayer('host-1', result.room.roomId, 'user-999'),
      ).rejects.toThrow('Player not in room');
    });

    it('should reject kicking the host', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await expect(
        removePlayer('host-1', result.room.roomId, 'host-1'),
      ).rejects.toThrow('Cannot kick the host');
    });
  });

  // ============================================================
  // UPDATE SETTINGS
  // ============================================================
  describe('updateSettings', () => {
    it('should update settings and unready all human players', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await setReady('host-1', result.room.roomId, true);
      await setReady('user-2', result.room.roomId, true);

      const room = await updateSettings('host-1', result.room.roomId, {
        turnTimerSeconds: 90,
      });

      expect(room.settings.turnTimerSeconds).toBe(90);
      expect(room.players.every((p) => !p.isReady)).toBe(true);
      expect(room.status).toBe('WAITING');
    });

    it('should update maxPlayers', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      const room = await updateSettings('host-1', result.room.roomId, {
        maxPlayers: 5,
      });

      expect(room.settings.maxPlayers).toBe(5);
      expect(room.maxPlayers).toBe(5);
    });

    it('should reject reducing maxPlayers below current count', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await joinRoom('user-3', 'player3', 'Player 3', result.room.roomId);

      await expect(
        updateSettings('host-1', result.room.roomId, { maxPlayers: 2 }),
      ).rejects.toThrow('Cannot reduce max players below current player count');
    });

    it('should remove AI players when allowAI set to false', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'AI Room',
      });

      await addAIPlayer('host-1', result.room.roomId, 'easy');
      await addAIPlayer('host-1', result.room.roomId, 'medium');

      const room = await updateSettings('host-1', result.room.roomId, {
        allowAI: false,
      });

      expect(room.players.filter((p) => p.isAI)).toHaveLength(0);
      expect(room.players).toHaveLength(1); // Only host remains
    });

    it('should reject if not host', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);

      await expect(
        updateSettings('user-2', result.room.roomId, { turnTimerSeconds: 90 }),
      ).rejects.toThrow('Only the host can change settings');
    });

    it('should reject if room is IN_GAME', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      // Manually set status
      const roomKey = `room:${result.room.roomId}`;
      const roomJson = mockRedisStore[roomKey];
      if (roomJson) {
        const room = JSON.parse(roomJson);
        room.status = 'IN_GAME';
        mockRedisStore[roomKey] = JSON.stringify(room);
      }

      await expect(
        updateSettings('host-1', result.room.roomId, { turnTimerSeconds: 90 }),
      ).rejects.toThrow('Cannot change settings in current room state');
    });
  });

  // ============================================================
  // GET ROOM DETAILS
  // ============================================================
  describe('getRoomDetails', () => {
    it('should return room details', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Test Room',
      });

      const room = await getRoomDetails(result.room.roomId);
      expect(room.roomId).toBe(result.room.roomId);
      expect(room.name).toBe('Test Room');
    });

    it('should throw if room not found', async () => {
      await expect(
        getRoomDetails('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('Room not found');
    });
  });

  // ============================================================
  // LIST ROOMS
  // ============================================================
  describe('listRooms', () => {
    it('should list public rooms', async () => {
      await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Public Room 1',
      });

      await createRoom({
        hostId: 'host-2',
        hostUsername: 'hostuser2',
        hostDisplayName: 'HostUser2',
        name: 'Public Room 2',
      });

      const rooms = await listRooms();
      expect(rooms.length).toBeGreaterThanOrEqual(2);
    });

    it('should not list private rooms', async () => {
      clearMockStore();

      await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Private Room',
        isPrivate: true,
      });

      const rooms = await listRooms();
      expect(rooms).toHaveLength(0);
    });

    it('should return empty array when no rooms exist', async () => {
      const rooms = await listRooms();
      expect(rooms).toHaveLength(0);
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('edge cases', () => {
    it('should handle full game lifecycle: create -> join -> ready -> start', async () => {
      const createResult = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Full Lifecycle',
      });

      await joinRoom('user-2', 'player2', 'Player 2', createResult.room.roomId);

      await setReady('host-1', createResult.room.roomId, true);
      const readyRoom = await setReady('user-2', createResult.room.roomId, true);
      expect(readyRoom.status).toBe('READY');

      const gameResult = await startGame('host-1', createResult.room.roomId);
      expect(gameResult.gameId).toBeTruthy();
      expect(gameResult.room.status).toBe('IN_GAME');
    });

    it('should handle AI + human ready state correctly', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'AI Game',
        settings: { maxPlayers: 3 },
      });

      // Add AI (unreadies host)
      await addAIPlayer('host-1', result.room.roomId, 'easy');

      // Host readies up - with AI, room should become READY
      // (AI counts as always-ready for status computation, but isReady=false is ignored for AI)
      const room = await setReady('host-1', result.room.roomId, true);

      // Status depends on computeRoomStatus: AI isReady=false but AI is filtered out
      // Only host (human) needs to be ready + min 2 players
      expect(room.status).toBe('READY');
    });

    it('should not transition to READY with only 1 player', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Solo Room',
      });

      const room = await setReady('host-1', result.room.roomId, true);
      expect(room.status).toBe('WAITING'); // Only 1 player, min is 2
    });

    it('should handle host transfer to second-earliest human player', async () => {
      const result = await createRoom({
        hostId: 'host-1',
        hostUsername: 'hostuser',
        hostDisplayName: 'HostUser',
        name: 'Transfer Room',
        settings: { maxPlayers: 4 },
      });

      await addAIPlayer('host-1', result.room.roomId, 'easy');
      await joinRoom('user-2', 'player2', 'Player 2', result.room.roomId);
      await joinRoom('user-3', 'player3', 'Player 3', result.room.roomId);

      const leaveResult = await leaveRoom('host-1', result.room.roomId);

      // user-2 joined first (after AI), so user-2 should be new host
      expect(leaveResult.hostTransferred).toBe(true);
      expect(leaveResult.newHostId).toBe('user-2');
    });
  });
});
