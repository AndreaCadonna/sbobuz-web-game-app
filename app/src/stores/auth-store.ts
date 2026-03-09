/**
 * Auth store — manages authentication state and token lifecycle.
 *
 * Persists user/token data to localStorage via Zustand persist middleware.
 * Registers API interceptor for automatic token refresh on 401 responses.
 */
'use client';

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { api, ApiError, registerAuthInterceptor } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { authResponseSchema, refreshResponseSchema } from '@/lib/validators';
import type { AuthenticatedUser } from '@/types/client';

// ── State Shape ────────────────────────────────────────────────────

interface AuthState {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isRefreshing: boolean;
  loginError: string | null;
  registerError: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  clearErrors: () => void;
  setUser: (user: AuthenticatedUser, accessToken: string, refreshToken: string) => void;
}

export type AuthStore = AuthState & AuthActions;

// ── Derived Selectors ──────────────────────────────────────────────

export function selectIsAuthenticated(state: AuthState): boolean {
  return state.user !== null && state.accessToken !== null;
}

// ── Store ──────────────────────────────────────────────────────────

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isRefreshing: false,
  loginError: null,
  registerError: null,
};

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setUser(user, accessToken, refreshToken): void {
          set({ user, accessToken, refreshToken, loginError: null, registerError: null });
        },

        async login(email, password): Promise<void> {
          set({ loginError: null });
          try {
            const raw = await api.login(email, password);
            const parsed = authResponseSchema.parse(raw);
            const { user, accessToken } = parsed.data;
            set({
              user: {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl ?? null,
                createdAt: user.createdAt ?? null,
              },
              accessToken,
              loginError: null,
            });
            logger.info({ userId: user.id }, 'Login successful');
          } catch (err) {
            const message =
              err instanceof ApiError ? err.message : 'An unexpected error occurred';
            set({ loginError: message });
            logger.warn({ err }, 'Login failed');
          }
        },

        async register(email, username, password, displayName): Promise<void> {
          set({ registerError: null });
          try {
            const raw = await api.register(email, username, password, displayName);
            const parsed = authResponseSchema.parse(raw);
            const { user, accessToken } = parsed.data;
            set({
              user: {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl ?? null,
                createdAt: user.createdAt ?? null,
              },
              accessToken,
              registerError: null,
            });
            logger.info({ userId: user.id }, 'Registration successful');
          } catch (err) {
            const message =
              err instanceof ApiError ? err.message : 'An unexpected error occurred';
            set({ registerError: message });
            logger.warn({ err }, 'Registration failed');
          }
        },

        async logout(): Promise<void> {
          try {
            await api.logout();
          } catch (err) {
            logger.warn({ err }, 'Logout API call failed, clearing local state anyway');
          }
          set(initialState);
          logger.info('Logged out');
        },

        async refreshAccessToken(): Promise<string | null> {
          set({ isRefreshing: true });
          try {
            // The refresh token is sent automatically via httpOnly cookie
            // (credentials: 'include' in fetch). No body token needed.
            const raw = await api.refreshToken();
            const parsed = refreshResponseSchema.parse(raw);
            const { accessToken } = parsed.data;
            set({
              accessToken,
              isRefreshing: false,
            });
            logger.debug('Token refreshed successfully');
            return accessToken;
          } catch (err) {
            logger.warn({ err }, 'Token refresh failed');
            set({ ...initialState });
            return null;
          }
        },

        clearErrors(): void {
          set({ loginError: null, registerError: null });
        },
      }),
      {
        name: 'sbobuz-auth',
        partialize: (state) => ({
          user: state.user,
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
        }),
      },
    ),
    { name: 'AuthStore' },
  ),
);

// ── Register API Interceptor ───────────────────────────────────────

registerAuthInterceptor({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  refreshAccessToken: () => useAuthStore.getState().refreshAccessToken(),
  onAuthFailure: () => {
    useAuthStore.setState(initialState);
  },
});
