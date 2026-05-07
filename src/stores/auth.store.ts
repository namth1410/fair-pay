import { type Session, type User } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';

import { APP_SCHEME } from '../config/constants';
import { supabase } from '../config/supabase';
import {
  clearAuthCache,
  getResetCooldownRemaining,
  markResetSent,
} from '../services/auth.helper';
import type { UserProfile } from '../services/user.service';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  setProfile: (profile: UserProfile | null) => void;
}

// Module-scope subscription handle — guards against double-listener khi
// `initialize()` bị gọi lại do Fast Refresh / HMR / state reset.
let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: false,
  isInitialized: false,

  setProfile: (profile) => set({ profile }),

  initialize: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      set({ session, user: session?.user ?? null, isInitialized: true });

      // Listen for auth state changes (token refresh, sign out, etc.).
      // Idempotent: nếu đã subscribe thì bỏ qua để tránh duplicate listener
      // (mỗi event sẽ chạy `set` 2-N lần khi Fast Refresh remount RootLayout).
      if (!authSubscription) {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          set({ session, user: session?.user ?? null });
        });
        authSubscription = data.subscription;
      }
    } catch (e) {
      if (__DEV__) console.warn('[auth] initialize failed:', e);
      set({ isInitialized: true });
    }
  },

  signInWithEmail: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      set({ session: data.session, user: data.user });
    } finally {
      set({ isLoading: false });
    }
  },

  signUpWithEmail: async (email, password, displayName) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
      set({ session: data.session, user: data.user });
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true });
    try {
      const redirectUri = makeRedirectUri({ scheme: APP_SCHEME });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error('Không nhận được URL đăng nhập Google');

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUri
      );

      if (result.type === 'success') {
        const url = result.url;
        const fragment = url.split('#')[1];
        if (!fragment) throw new Error('Đăng nhập Google thất bại — không nhận được token');
        const params = new URLSearchParams(fragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { data: sessionData, error: sessionError } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          if (sessionError) throw sessionError;
          set({ session: sessionData.session, user: sessionData.user });
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  sendPasswordResetEmail: async (email) => {
    set({ isLoading: true });
    try {
      const remaining = await getResetCooldownRemaining();
      if (remaining > 0) {
        throw new Error(`Vui lòng chờ ${remaining}s trước khi gửi lại`);
      }
      const redirectTo = makeRedirectUri({
        scheme: APP_SCHEME,
        path: 'reset-password',
      });
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
      await markResetSent();
    } finally {
      set({ isLoading: false });
    }
  },

  updatePassword: async (newPassword) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      // updateUser returns fresh user; session is already set from the deep link.
      set({ user: data.user });
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    clearAuthCache();
    set({ session: null, user: null, profile: null });

    // Reset cross-store state để tránh data leak khi user khác đăng nhập trên
    // cùng app instance. Lazy require để tránh circular import (các store khác
    // có thể import từ services dùng auth.store).
    try {
      const { useGroupStore } = require('./group.store');
      const { useTripStore } = require('./trip.store');
      const { useNotificationStore } = require('./notification.store');
      const { usePresetStore } = require('./preset.store');
      useGroupStore.getState().reset();
      useTripStore.getState().reset();
      useNotificationStore.getState().reset();
      usePresetStore.getState().reset();
    } catch (e) {
      if (__DEV__) console.warn('[auth] cross-store reset failed:', e);
    }
  },
}));
