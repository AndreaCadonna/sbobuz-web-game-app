/**
 * useAuth — Custom hook for auth-related derived state and actions.
 *
 * Provides convenient access to auth state and actions for components.
 * Wraps the auth store with derived computations.
 */
'use client';

import { useCallback } from 'react';

import { useAuthStore, selectIsAuthenticated } from '@/stores/auth-store';
import type { AuthenticatedUser } from '@/types/client';

interface UseAuthReturn {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isRefreshing: boolean;
  loginError: string | null;
  registerError: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  guestLogin: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  clearErrors: () => void;
}

export function useAuth(): UseAuthReturn {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isGuest = useAuthStore((s) => s.user?.isGuest ?? false);
  const isRefreshing = useAuthStore((s) => s.isRefreshing);
  const loginError = useAuthStore((s) => s.loginError);
  const registerError = useAuthStore((s) => s.registerError);
  const storeLogin = useAuthStore((s) => s.login);
  const storeRegister = useAuthStore((s) => s.register);
  const storeGuestLogin = useAuthStore((s) => s.guestLogin);
  const storeLogout = useAuthStore((s) => s.logout);
  const storeClearErrors = useAuthStore((s) => s.clearErrors);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      await storeLogin(email, password);
    },
    [storeLogin],
  );

  const register = useCallback(
    async (
      email: string,
      username: string,
      password: string,
      displayName: string,
    ): Promise<void> => {
      await storeRegister(email, username, password, displayName);
    },
    [storeRegister],
  );

  const guestLogin = useCallback(
    async (displayName: string): Promise<void> => {
      await storeGuestLogin(displayName);
    },
    [storeGuestLogin],
  );

  const logout = useCallback(async (): Promise<void> => {
    await storeLogout();
  }, [storeLogout]);

  const clearErrors = useCallback((): void => {
    storeClearErrors();
  }, [storeClearErrors]);

  return {
    user,
    isAuthenticated,
    isGuest,
    isRefreshing,
    loginError,
    registerError,
    login,
    register,
    guestLogin,
    logout,
    clearErrors,
  };
}
