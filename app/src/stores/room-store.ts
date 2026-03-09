/**
 * Room store — manages lobby and room state.
 *
 * Handles room list, current room, and room-level socket event updates.
 * Room mutations go through the REST API; real-time updates arrive via socket events.
 */
'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { api, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useGameStore } from '@/stores/game-store';
import { roomListResponseSchema, roomResponseSchema } from '@/lib/validators';
import type {
  RoomDetail,
  RoomSummary,
  RoomStateUpdatePayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
} from '@/types/client';

// ── State Shape ────────────────────────────────────────────────────

interface RoomState {
  rooms: RoomSummary[];
  currentRoom: RoomDetail | null;
  isLoadingRooms: boolean;
  isCreatingRoom: boolean;
  isJoiningRoom: boolean;
  isStartingGame: boolean;
  error: string | null;
}

interface RoomActions {
  fetchRooms: () => Promise<void>;
  createRoom: (data: {
    name: string;
    maxPlayers: number;
    turnTimerSeconds: number;
    isPrivate: boolean;
    allowAI: boolean;
  }) => Promise<string | null>;
  joinRoom: (roomId: string, inviteCode?: string) => Promise<boolean>;
  leaveRoom: (roomId: string) => Promise<void>;
  toggleReady: (roomId: string, isReady: boolean) => Promise<void>;
  startGame: (roomId: string) => Promise<void>;
  addAIPlayer: (roomId: string, difficulty?: 'easy' | 'medium' | 'hard') => Promise<void>;
  fetchRoom: (roomId: string) => Promise<void>;
  clearError: () => void;
  clearCurrentRoom: () => void;

  // Socket event handlers
  handleRoomStateUpdate: (payload: RoomStateUpdatePayload) => void;
  handlePlayerJoined: (payload: PlayerJoinedPayload) => void;
  handlePlayerLeft: (payload: PlayerLeftPayload) => void;

  reset: () => void;
}

export type RoomStore = RoomState & RoomActions;

// ── Store ──────────────────────────────────────────────────────────

const initialState: RoomState = {
  rooms: [],
  currentRoom: null,
  isLoadingRooms: false,
  isCreatingRoom: false,
  isJoiningRoom: false,
  isStartingGame: false,
  error: null,
};

export const useRoomStore = create<RoomStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      async fetchRooms(): Promise<void> {
        set({ isLoadingRooms: true, error: null });
        try {
          const raw = await api.listRooms();
          const parsed = roomListResponseSchema.parse(raw);
          const rooms = parsed.data.rooms.map((r) => ({
            roomId: r.roomId,
            name: r.name,
            hostDisplayName: r.hostDisplayName,
            playerCount: r.playerCount,
            maxPlayers: r.maxPlayers,
            status: r.status as RoomSummary['status'],
            turnTimerSeconds: r.turnTimerSeconds ?? r.settings?.turnTimerSeconds ?? 60,
            isPrivate: r.isPrivate ?? false,
            createdAt: r.createdAt,
          }));
          set({
            rooms,
            isLoadingRooms: false,
          });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to load rooms';
          set({ error: message, isLoadingRooms: false });
          logger.warn({ err }, 'Failed to fetch rooms');
        }
      },

      async createRoom(data): Promise<string | null> {
        set({ isCreatingRoom: true, error: null });
        try {
          const raw = await api.createRoom(data);
          const parsed = roomResponseSchema.parse(raw);
          set({
            currentRoom: parsed.data.room as unknown as RoomDetail,
            isCreatingRoom: false,
          });
          logger.info({ roomId: parsed.data.room.roomId }, 'Room created');
          return parsed.data.room.roomId;
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to create room';
          set({ error: message, isCreatingRoom: false });
          logger.warn({ err }, 'Failed to create room');
          return null;
        }
      },

      async joinRoom(roomId, inviteCode): Promise<boolean> {
        set({ isJoiningRoom: true, error: null });
        try {
          await api.joinRoom(roomId, inviteCode);
          // Fetch full room details after joining
          await get().fetchRoom(roomId);
          set({ isJoiningRoom: false });
          logger.info({ roomId }, 'Joined room');
          return true;
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to join room';
          set({ error: message, isJoiningRoom: false });
          logger.warn({ err, roomId }, 'Failed to join room');
          return false;
        }
      },

      async leaveRoom(roomId): Promise<void> {
        try {
          await api.leaveRoom(roomId);
          set({ currentRoom: null });
          logger.info({ roomId }, 'Left room');
        } catch (err) {
          logger.warn({ err, roomId }, 'Failed to leave room');
        }
      },

      async toggleReady(roomId, isReady): Promise<void> {
        try {
          const raw = await api.toggleReady(roomId, isReady);
          const parsed = roomResponseSchema.parse(raw);
          set({ currentRoom: parsed.data.room as unknown as RoomDetail });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to toggle ready';
          set({ error: message });
          logger.warn({ err, roomId }, 'Failed to toggle ready');
        }
      },

      async startGame(roomId): Promise<void> {
        if (get().isStartingGame) return;
        set({ isStartingGame: true, error: null });
        try {
          const response = await api.startGame(roomId) as {
            data?: { gameId?: string; room?: Record<string, unknown> };
          };
          logger.info({ roomId }, 'Game start requested');

          // Update room status from REST response so navigation can trigger
          // even if socket events are delayed
          const gameId = response?.data?.gameId;
          const roomData = response?.data?.room;
          if (roomData && typeof roomData.status === 'string') {
            const currentRoom = get().currentRoom;
            if (currentRoom && currentRoom.roomId === roomId) {
              set({
                currentRoom: {
                  ...currentRoom,
                  status: roomData.status as RoomDetail['status'],
                },
              });
            }
          }
          if (gameId) {
            // Set gameId directly so navigation triggers immediately;
            // full game state will arrive via the game:started socket event
            useGameStore.setState({ gameId });
          }
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to start game';
          set({ error: message });
          logger.warn({ err, roomId }, 'Failed to start game');
        } finally {
          set({ isStartingGame: false });
        }
      },

      async addAIPlayer(roomId, difficulty = 'easy'): Promise<void> {
        try {
          const raw = await api.addAI(roomId, difficulty);
          const parsed = roomResponseSchema.parse(raw);
          set({ currentRoom: parsed.data.room as unknown as RoomDetail });
          logger.info({ roomId, difficulty }, 'AI player added');
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to add AI player';
          set({ error: message });
          logger.warn({ err, roomId }, 'Failed to add AI player');
        }
      },

      async fetchRoom(roomId): Promise<void> {
        try {
          const raw = await api.getRoom(roomId);
          const parsed = roomResponseSchema.parse(raw);
          set({ currentRoom: parsed.data.room as unknown as RoomDetail });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to load room';
          set({ error: message });
          logger.warn({ err, roomId }, 'Failed to fetch room');
        }
      },

      clearError(): void {
        set({ error: null });
      },

      clearCurrentRoom(): void {
        set({ currentRoom: null });
      },

      handleRoomStateUpdate(payload): void {
        const { currentRoom } = get();
        if (!currentRoom || currentRoom.roomId !== payload.roomId) return;

        // Rebuild players list from the authoritative server payload
        const updatedPlayers = payload.players.map((update) => {
          const existing = currentRoom.players.find((p) => p.userId === update.userId);
          return {
            userId: update.userId,
            username: update.username,
            displayName: update.displayName ?? update.username,
            isReady: update.isReady,
            isHost: update.isHost ?? (update.userId === payload.hostUserId),
            isAI: update.isAI ?? update.userId.startsWith('ai_'),
            aiDifficulty: update.aiDifficulty,
            joinedAt: existing?.joinedAt ?? new Date().toISOString(),
            connectionStatus: update.isConnected ? 'connected' as const : 'disconnected' as const,
          };
        });

        set({
          currentRoom: {
            ...currentRoom,
            hostId: payload.hostUserId,
            status: payload.status as RoomDetail['status'],
            players: updatedPlayers,
          },
        });
      },

      handlePlayerJoined(payload): void {
        const { currentRoom } = get();
        if (!currentRoom) return;

        // Check if player already exists
        const exists = currentRoom.players.some(
          (p) => p.userId === payload.userId,
        );
        if (exists) return;

        set({
          currentRoom: {
            ...currentRoom,
            players: [
              ...currentRoom.players,
              {
                userId: payload.userId,
                username: payload.username,
                displayName: payload.username,
                isReady: false,
                isHost: false,
                isAI: false,
                joinedAt: new Date().toISOString(),
                connectionStatus: 'connected' as const,
              },
            ],
          },
        });
      },

      handlePlayerLeft(payload): void {
        const { currentRoom } = get();
        if (!currentRoom) return;

        set({
          currentRoom: {
            ...currentRoom,
            players: currentRoom.players.filter(
              (p) => p.userId !== payload.userId,
            ),
          },
        });
      },

      reset(): void {
        set(initialState);
      },
    }),
    { name: 'RoomStore' },
  ),
);
