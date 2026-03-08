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
  toggleReady: (roomId: string) => Promise<void>;
  startGame: (roomId: string) => Promise<void>;
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
          set({
            rooms: parsed.data as RoomSummary[],
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
            currentRoom: parsed.data as unknown as RoomDetail,
            isCreatingRoom: false,
          });
          logger.info({ roomId: parsed.data.roomId }, 'Room created');
          return parsed.data.roomId;
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

      async toggleReady(roomId): Promise<void> {
        try {
          await api.toggleReady(roomId);
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to toggle ready';
          set({ error: message });
          logger.warn({ err, roomId }, 'Failed to toggle ready');
        }
      },

      async startGame(roomId): Promise<void> {
        try {
          await api.startGame(roomId);
          logger.info({ roomId }, 'Game start requested');
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to start game';
          set({ error: message });
          logger.warn({ err, roomId }, 'Failed to start game');
        }
      },

      async fetchRoom(roomId): Promise<void> {
        try {
          const raw = await api.getRoom(roomId);
          const parsed = roomResponseSchema.parse(raw);
          set({ currentRoom: parsed.data as unknown as RoomDetail });
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

        // Update players from the socket payload
        set({
          currentRoom: {
            ...currentRoom,
            hostId: payload.hostUserId,
            status: payload.status as RoomDetail['status'],
            players: currentRoom.players.map((p) => {
              const update = payload.players.find((u) => u.userId === p.userId);
              if (!update) return p;
              return {
                ...p,
                isReady: update.isReady,
                connectionStatus: update.isConnected ? 'connected' as const : 'disconnected' as const,
              };
            }),
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
