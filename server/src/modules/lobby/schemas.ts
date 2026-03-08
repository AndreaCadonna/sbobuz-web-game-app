/**
 * Zod validation schemas for lobby endpoints.
 *
 * @see docs/specs/lobby-module.md Section 5 (Validation Rules)
 */

import { z } from 'zod';

/**
 * Room name: 1-50 chars, alphanumeric + spaces + hyphens + apostrophes.
 */
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9 '\-]{1,50}$/;

/**
 * Room settings schema (partial — all fields optional for create/update).
 */
export const roomSettingsSchema = z.object({
  maxPlayers: z
    .number()
    .int()
    .min(2, 'Max players must be at least 2')
    .max(5, 'Max players must be at most 5')
    .optional(),
  turnTimerSeconds: z
    .number()
    .int()
    .min(30, 'Turn timer must be at least 30 seconds')
    .max(120, 'Turn timer must be at most 120 seconds')
    .optional(),
  allowAI: z.boolean().optional(),
  disconnectGraceSeconds: z
    .number()
    .int()
    .min(15, 'Disconnect grace must be at least 15 seconds')
    .max(60, 'Disconnect grace must be at most 60 seconds')
    .optional(),
});

/**
 * POST /api/v1/lobby/rooms — create room.
 */
export const createRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Room name is required')
    .max(50, 'Room name must not exceed 50 characters')
    .regex(ROOM_NAME_PATTERN, 'Room name must contain only letters, numbers, spaces, hyphens, and apostrophes'),
  settings: roomSettingsSchema.optional(),
  isPrivate: z.boolean().optional(),
});

/**
 * POST /api/v1/lobby/rooms/join — join room.
 */
export const joinRoomSchema = z.object({
  roomId: z.string().uuid().optional(),
  inviteCode: z.string().min(1).max(20).optional(),
}).refine(
  (data) => {
    const hasRoomId = data.roomId !== undefined;
    const hasInviteCode = data.inviteCode !== undefined;
    return (hasRoomId || hasInviteCode) && !(hasRoomId && hasInviteCode);
  },
  {
    message: 'Provide roomId or inviteCode, not both',
  },
);

/**
 * POST /api/v1/lobby/rooms/:roomId/ready — toggle ready.
 */
export const setReadySchema = z.object({
  isReady: z.boolean(),
});

/**
 * POST /api/v1/lobby/rooms/:roomId/ai — add AI player.
 */
export const addAIPlayerSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

/**
 * PATCH /api/v1/lobby/rooms/:roomId/settings — update settings.
 */
export const updateSettingsSchema = roomSettingsSchema.refine(
  (data) => {
    // At least one field must be provided
    return (
      data.maxPlayers !== undefined ||
      data.turnTimerSeconds !== undefined ||
      data.allowAI !== undefined ||
      data.disconnectGraceSeconds !== undefined
    );
  },
  {
    message: 'At least one setting must be provided',
  },
);

/**
 * Path params for room-specific endpoints.
 */
export const roomIdParamsSchema = z.object({
  roomId: z.string().uuid('Invalid room ID'),
});

/**
 * Path params for player kick endpoint.
 */
export const removePlayerParamsSchema = z.object({
  roomId: z.string().uuid('Invalid room ID'),
  userId: z.string().min(1, 'Invalid user ID'),
});

/**
 * Inferred types from schemas.
 */
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type SetReadyInput = z.infer<typeof setReadySchema>;
export type AddAIPlayerInput = z.infer<typeof addAIPlayerSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
