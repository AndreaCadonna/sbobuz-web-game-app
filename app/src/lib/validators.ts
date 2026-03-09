/**
 * Zod validation schemas for form inputs and API responses.
 *
 * All form data and API responses MUST be validated through these schemas
 * before use. This protects against malformed server data and ensures
 * type safety at runtime.
 */
import { z } from 'zod';

// ── Auth Form Schemas ──────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    username: z
      .string()
      .min(1, 'Username is required')
      .min(3, 'Username must be at least 3 characters')
      .max(20, 'Username must be at most 20 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Username can only contain letters, numbers, hyphens, and underscores',
      ),
    displayName: z
      .string()
      .min(1, 'Display name is required')
      .max(50, 'Display name must be at most 50 characters'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

// ── Room Form Schemas ──────────────────────────────────────────────

export const createRoomSchema = z.object({
  name: z
    .string()
    .min(1, 'Room name is required')
    .max(50, 'Room name must be at most 50 characters'),
  maxPlayers: z
    .number()
    .int()
    .min(2, 'Minimum 2 players')
    .max(5, 'Maximum 5 players'),
  turnTimerSeconds: z
    .number()
    .int()
    .min(15, 'Minimum 15 seconds')
    .max(120, 'Maximum 120 seconds'),
  isPrivate: z.boolean(),
  allowAI: z.boolean(),
});

export type CreateRoomFormData = z.infer<typeof createRoomSchema>;

// ── API Response Schemas ───────────────────────────────────────────

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
    timestamp: z.string(),
  }),
});

export const authResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: z.object({
      id: z.string(),
      email: z.string(),
      username: z.string(),
      displayName: z.string(),
      avatarUrl: z.string().nullable().optional(),
      createdAt: z.string().optional(),
    }),
    accessToken: z.string(),
  }),
});

export const refreshResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string(),
  }),
});

const roomStateSchema = z.object({
  roomId: z.string(),
  name: z.string(),
  hostId: z.string(),
  players: z.array(
    z.object({
      userId: z.string(),
      username: z.string(),
      displayName: z.string(),
      isReady: z.boolean(),
      isHost: z.boolean(),
      isAI: z.boolean(),
      aiDifficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      joinedAt: z.string(),
      connectionStatus: z.enum(['connected', 'disconnected']),
    }),
  ),
  maxPlayers: z.number(),
  minPlayers: z.number(),
  status: z.string(),
  settings: z.object({
    maxPlayers: z.number(),
    turnTimerSeconds: z.number(),
    allowAI: z.boolean(),
    disconnectGraceSeconds: z.number(),
  }),
  inviteCode: z.string(),
  isPrivate: z.boolean(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
});

export const roomResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    room: roomStateSchema,
  }),
});

// ── Leaderboard Response Schemas ──────────────────────────────────

export const leaderboardEntrySchema = z.object({
  rank: z.number(),
  userId: z.string(),
  username: z.string(),
  rating: z.number(),
  gamesPlayed: z.number(),
  gamesWon: z.number(),
  winRate: z.number(),
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    entries: z.array(leaderboardEntrySchema),
    limit: z.number(),
    offset: z.number(),
  }),
});

export const myRatingResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    entry: leaderboardEntrySchema.nullable(),
    message: z.string().optional(),
  }),
});

export const matchHistoryEntrySchema = z.object({
  gameId: z.string(),
  playedAt: z.string(),
  result: z.enum(['win', 'loss']),
  ratingChange: z.number(),
  ratingAfter: z.number(),
});

export type MatchHistoryEntry = z.infer<typeof matchHistoryEntrySchema>;

export const matchHistoryResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    history: z.array(matchHistoryEntrySchema),
  }),
});

export const roomListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    rooms: z.array(
      z.object({
        roomId: z.string(),
        name: z.string(),
        hostDisplayName: z.string(),
        playerCount: z.number(),
        maxPlayers: z.number(),
        status: z.string(),
        settings: z.object({
          maxPlayers: z.number(),
          turnTimerSeconds: z.number(),
          allowAI: z.boolean(),
          disconnectGraceSeconds: z.number(),
        }).optional(),
        turnTimerSeconds: z.number().optional(),
        isPrivate: z.boolean().optional(),
        createdAt: z.string(),
      }),
    ),
  }),
  meta: z
    .object({
      requestId: z.string(),
      timestamp: z.string(),
      pagination: z
        .object({
          page: z.number(),
          pageSize: z.number(),
          totalItems: z.number(),
          totalPages: z.number(),
          hasNextPage: z.boolean(),
          hasPreviousPage: z.boolean(),
        })
        .optional(),
    })
    .optional(),
});
