/**
 * Tests for lobby Zod validation schemas.
 */

import { describe, it, expect } from 'vitest';

import {
  createRoomSchema,
  joinRoomSchema,
  setReadySchema,
  addAIPlayerSchema,
  updateSettingsSchema,
  roomIdParamsSchema,
  removePlayerParamsSchema,
} from './schemas.js';

describe('Lobby Schemas', () => {
  describe('createRoomSchema', () => {
    it('should accept valid room creation', () => {
      const result = createRoomSchema.safeParse({
        name: 'My Room',
      });
      expect(result.success).toBe(true);
    });

    it('should accept room with full settings', () => {
      const result = createRoomSchema.safeParse({
        name: 'My Room',
        settings: {
          maxPlayers: 5,
          turnTimerSeconds: 90,
          allowAI: false,
          disconnectGraceSeconds: 45,
        },
        isPrivate: true,
      });
      expect(result.success).toBe(true);
    });

    it('should trim room name', () => {
      const result = createRoomSchema.safeParse({ name: '  My Room  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('My Room');
      }
    });

    it('should reject empty room name', () => {
      const result = createRoomSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('should reject room name over 50 chars', () => {
      const result = createRoomSchema.safeParse({ name: 'A'.repeat(51) });
      expect(result.success).toBe(false);
    });

    it('should reject room name with special characters', () => {
      const result = createRoomSchema.safeParse({ name: 'Room @#$' });
      expect(result.success).toBe(false);
    });

    it('should accept room name with hyphens and apostrophes', () => {
      const result = createRoomSchema.safeParse({ name: "Bob's Room - Game" });
      expect(result.success).toBe(true);
    });

    it('should reject maxPlayers below 2', () => {
      const result = createRoomSchema.safeParse({
        name: 'Room',
        settings: { maxPlayers: 1 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject maxPlayers above 5', () => {
      const result = createRoomSchema.safeParse({
        name: 'Room',
        settings: { maxPlayers: 6 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject turnTimerSeconds below 30', () => {
      const result = createRoomSchema.safeParse({
        name: 'Room',
        settings: { turnTimerSeconds: 10 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject turnTimerSeconds above 120', () => {
      const result = createRoomSchema.safeParse({
        name: 'Room',
        settings: { turnTimerSeconds: 200 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject disconnectGraceSeconds below 15', () => {
      const result = createRoomSchema.safeParse({
        name: 'Room',
        settings: { disconnectGraceSeconds: 5 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject disconnectGraceSeconds above 60', () => {
      const result = createRoomSchema.safeParse({
        name: 'Room',
        settings: { disconnectGraceSeconds: 100 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('joinRoomSchema', () => {
    it('should accept roomId only', () => {
      const result = joinRoomSchema.safeParse({
        roomId: '00000000-0000-0000-0000-000000000000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept inviteCode only', () => {
      const result = joinRoomSchema.safeParse({
        inviteCode: 'ABCD1234',
      });
      expect(result.success).toBe(true);
    });

    it('should reject both roomId and inviteCode', () => {
      const result = joinRoomSchema.safeParse({
        roomId: '00000000-0000-0000-0000-000000000000',
        inviteCode: 'ABCD1234',
      });
      expect(result.success).toBe(false);
    });

    it('should reject neither roomId nor inviteCode', () => {
      const result = joinRoomSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID for roomId', () => {
      const result = joinRoomSchema.safeParse({ roomId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('setReadySchema', () => {
    it('should accept true', () => {
      const result = setReadySchema.safeParse({ isReady: true });
      expect(result.success).toBe(true);
    });

    it('should accept false', () => {
      const result = setReadySchema.safeParse({ isReady: false });
      expect(result.success).toBe(true);
    });

    it('should reject non-boolean', () => {
      const result = setReadySchema.safeParse({ isReady: 'yes' });
      expect(result.success).toBe(false);
    });

    it('should reject missing isReady', () => {
      const result = setReadySchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('addAIPlayerSchema', () => {
    it('should accept easy', () => {
      expect(addAIPlayerSchema.safeParse({ difficulty: 'easy' }).success).toBe(true);
    });

    it('should accept medium', () => {
      expect(addAIPlayerSchema.safeParse({ difficulty: 'medium' }).success).toBe(true);
    });

    it('should accept hard', () => {
      expect(addAIPlayerSchema.safeParse({ difficulty: 'hard' }).success).toBe(true);
    });

    it('should reject invalid difficulty', () => {
      expect(addAIPlayerSchema.safeParse({ difficulty: 'expert' }).success).toBe(false);
    });
  });

  describe('updateSettingsSchema', () => {
    it('should accept partial settings', () => {
      const result = updateSettingsSchema.safeParse({ turnTimerSeconds: 90 });
      expect(result.success).toBe(true);
    });

    it('should reject empty object', () => {
      const result = updateSettingsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate setting ranges', () => {
      expect(updateSettingsSchema.safeParse({ maxPlayers: 1 }).success).toBe(false);
      expect(updateSettingsSchema.safeParse({ maxPlayers: 6 }).success).toBe(false);
      expect(updateSettingsSchema.safeParse({ maxPlayers: 3 }).success).toBe(true);
    });
  });

  describe('roomIdParamsSchema', () => {
    it('should accept valid UUID', () => {
      const result = roomIdParamsSchema.safeParse({
        roomId: '00000000-0000-0000-0000-000000000000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = roomIdParamsSchema.safeParse({ roomId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('removePlayerParamsSchema', () => {
    it('should accept valid params', () => {
      const result = removePlayerParamsSchema.safeParse({
        roomId: '00000000-0000-0000-0000-000000000000',
        userId: 'user-123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing userId', () => {
      const result = removePlayerParamsSchema.safeParse({
        roomId: '00000000-0000-0000-0000-000000000000',
      });
      expect(result.success).toBe(false);
    });
  });
});
