/**
 * HTTP API client with automatic token refresh interceptor.
 *
 * All REST API calls go through this module. It handles:
 * - Bearer token injection
 * - Automatic 401 → token refresh → retry
 * - Response parsing and error extraction
 */
import type { ApiErrorResponse } from '@sbobuz/shared';

import { logger } from './logger';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

/**
 * Error thrown when an API call fails.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Token management functions — set by the auth store at initialization
let getAccessToken: (() => string | null) | null = null;
let getRefreshToken: (() => string | null) | null = null;
let refreshAccessToken: (() => Promise<string | null>) | null = null;
let onAuthFailure: (() => void) | null = null;

/**
 * Register auth functions for token management.
 * Called once by the auth store during initialization.
 */
export function registerAuthInterceptor(interceptor: {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
  onAuthFailure: () => void;
}): void {
  getAccessToken = interceptor.getAccessToken;
  getRefreshToken = interceptor.getRefreshToken;
  refreshAccessToken = interceptor.refreshAccessToken;
  onAuthFailure = interceptor.onAuthFailure;
}

// Track inflight refresh to avoid concurrent refresh requests
let refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  if (!refreshAccessToken) return null;

  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = refreshAccessToken().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  requiresAuth?: boolean;
}

async function makeRequest<T>(options: RequestOptions): Promise<T> {
  const { method, path, body, requiresAuth = true } = options;
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (requiresAuth && getAccessToken) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  let response = await fetch(url, fetchOptions);

  // If 401 and we have refresh capability, try refreshing
  if (response.status === 401 && requiresAuth && refreshAccessToken && getRefreshToken) {
    const refreshTokenValue = getRefreshToken();
    if (refreshTokenValue) {
      logger.debug('Access token expired, attempting refresh');
      const newToken = await attemptTokenRefresh();

      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { ...fetchOptions, headers });
      } else {
        logger.warn('Token refresh failed, triggering auth failure');
        onAuthFailure?.();
        throw new ApiError('AUTH_TOKEN_EXPIRED', 'Session expired', 401);
      }
    } else {
      onAuthFailure?.();
      throw new ApiError('AUTH_REQUIRED', 'Authentication required', 401);
    }
  }

  const data: unknown = await response.json();

  if (!response.ok) {
    const errorData = data as ApiErrorResponse;
    if (errorData && typeof errorData === 'object' && 'error' in errorData) {
      const err = errorData.error;
      throw new ApiError(err.code, err.message, response.status, err.details);
    }
    throw new ApiError('UNKNOWN_ERROR', 'An unexpected error occurred', response.status);
  }

  return data as T;
}

// ── Public API Methods ─────────────────────────────────────────────

export const api = {
  // Auth
  login(email: string, password: string): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: '/auth/login',
      body: { email, password },
      requiresAuth: false,
    });
  },

  register(
    email: string,
    username: string,
    password: string,
    displayName: string,
  ): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: '/auth/register',
      body: { email, username, password, displayName },
      requiresAuth: false,
    });
  },

  refreshToken(refreshToken: string): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: '/auth/refresh',
      body: { refreshToken },
      requiresAuth: false,
    });
  },

  logout(): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: '/auth/logout',
    });
  },

  // Rooms
  listRooms(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<unknown> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return makeRequest({
      method: 'GET',
      path: `/lobby/rooms${qs ? `?${qs}` : ''}`,
    });
  },

  getRoom(roomId: string): Promise<unknown> {
    return makeRequest({
      method: 'GET',
      path: `/lobby/rooms/${roomId}`,
    });
  },

  createRoom(data: {
    name: string;
    maxPlayers: number;
    turnTimerSeconds: number;
    isPrivate: boolean;
    allowAI: boolean;
  }): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: '/lobby/rooms',
      body: data,
    });
  },

  joinRoom(roomId: string, inviteCode?: string): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: '/lobby/rooms/join',
      body: { roomId, inviteCode },
    });
  },

  leaveRoom(roomId: string): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: `/lobby/rooms/${roomId}/leave`,
    });
  },

  toggleReady(roomId: string): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: `/lobby/rooms/${roomId}/ready`,
    });
  },

  startGame(roomId: string): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: `/lobby/rooms/${roomId}/start`,
    });
  },

  addAI(roomId: string, difficulty: 'easy' | 'medium' | 'hard' = 'easy'): Promise<unknown> {
    return makeRequest({
      method: 'POST',
      path: `/lobby/rooms/${roomId}/ai`,
      body: { difficulty },
    });
  },

  kickPlayer(roomId: string, userId: string): Promise<unknown> {
    return makeRequest({
      method: 'DELETE',
      path: `/lobby/rooms/${roomId}/players/${userId}`,
    });
  },

  updateSettings(
    roomId: string,
    settings: Partial<{
      maxPlayers: number;
      turnTimerSeconds: number;
      allowAI: boolean;
    }>,
  ): Promise<unknown> {
    return makeRequest({
      method: 'PATCH',
      path: `/lobby/rooms/${roomId}/settings`,
      body: settings,
    });
  },

  // Leaderboard
  getLeaderboard(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<unknown> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return makeRequest({
      method: 'GET',
      path: `/leaderboard${qs ? `?${qs}` : ''}`,
    });
  },

  getMyRating(): Promise<unknown> {
    return makeRequest({
      method: 'GET',
      path: '/leaderboard/me',
    });
  },

  getNearbyRankings(): Promise<unknown> {
    return makeRequest({
      method: 'GET',
      path: '/leaderboard/nearby',
    });
  },

  getMatchHistory(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<unknown> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return makeRequest({
      method: 'GET',
      path: `/leaderboard/history${qs ? `?${qs}` : ''}`,
    });
  },

  // Profile
  getProfile(): Promise<unknown> {
    return makeRequest({
      method: 'GET',
      path: '/users/me',
    });
  },
};
