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
import { getSocket } from '@/lib/socket';
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
  /** Monotonic version from server to prevent stale state overwrites. */
  lastStateVersion: number;
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
  lastStateVersion: 0,
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
          const roomId = parsed.data.room.roomId;
          set({
            currentRoom: parsed.data.room as unknown as RoomDetail,
            isCreatingRoom: false,
          });

          // Join the Socket.IO room so broadcasts reach the host
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('room:join', { roomId }, (response) => {
              if (!response.success) {
                logger.warn({ roomId, error: response.error }, 'Socket room:join failed after create');
              }
            });
          }

          logger.info({ roomId }, 'Room created');
          return roomId;
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

          // Join the Socket.IO room so broadcasts reach this client
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('room:join', { roomId }, (response) => {
              if (!response.success) {
                logger.warn({ roomId, error: response.error }, 'Socket room:join failed');
              } else {
                logger.info({ roomId }, 'Socket room joined');
              }
            });
          }

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
        // Leave the Socket.IO room first so we stop receiving broadcasts
        const socket = getSocket();
        if (socket?.connected) {
          socket.emit('room:leave', { roomId }, (response) => {
            if (!response.success) {
              logger.warn({ roomId, error: response.error }, 'Socket room:leave failed');
            }
          });
        }

        try {
          await api.leaveRoom(roomId);
          set({ currentRoom: null, lastStateVersion: 0 });
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
          await api.startGame(roomId);
          logger.info({ roomId }, 'Game start requested');
          // Navigation is driven by the game:started socket event which sets
          // both gameId and gameState atomically — no need to set them here.
          // The room status update will also arrive via room:state_update.
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

          // Ensure the socket is in the Socket.IO room
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('room:join', { roomId }, (response) => {
              if (!response.success) {
                logger.warn({ roomId, error: response.error }, 'Socket room:join failed on fetch');
              }
            });
          }
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
        const { currentRoom, lastStateVersion } = get();
        if (!currentRoom || currentRoom.roomId !== payload.roomId) return;

        // Drop stale updates: only apply if version is newer
        if (payload.version <= lastStateVersion) {
          logger.debug({ roomId: payload.roomId, version: payload.version, lastVersion: lastStateVersion }, 'Dropping stale room state update');
          return;
        }

        // Build players from the authoritative server payload (no inference needed)
        const updatedPlayers = payload.players.map((p) => ({
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          isReady: p.isReady,
          isHost: p.isHost,
          isAI: p.isAI,
          joinedAt: p.joinedAt,
          connectionStatus: p.isConnected ? 'connected' as const : 'disconnected' as const,
          ...(p.aiDifficulty ? { aiDifficulty: p.aiDifficulty } : {}),
        }));

        set({
          currentRoom: {
            ...currentRoom,
            hostId: payload.hostUserId,
            status: payload.status as RoomDetail['status'],
            players: updatedPlayers,
          },
          lastStateVersion: payload.version,
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
