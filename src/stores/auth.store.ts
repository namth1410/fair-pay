import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { type Session, type User } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import { create } from 'zustand';

import { APP_SCHEME } from '../config/constants';
import { supabase } from '../config/supabase';
import {
  clearAuthCache,
  getResetCooldownRemaining,
  markResetSent,
} from '../services/auth.helper';
import {
  registerForPushNotifications,
  unregisterPushToken,
} from '../services/pushNotification.service';
import type { UserProfile } from '../services/user.service';
import * as authCache from '../sync/authCache';
import type { CachedIdentity } from '../sync/authCache';
import * as syncQueue from '../sync/syncQueue';

/**
 * Thrown khi user cố signOut nhưng sync_queue còn pending/conflict.
 * UI catch error này → show dialog yêu cầu drain/resolve trước khi logout.
 *
 * Lý do block: dispatcher dùng getAuthUserId() runtime cho CREATE_TRIP /
 * DELETE_PRESET / DELETE_NOTIFICATION → nếu A logout → B login → queue replay
 * dưới identity B → cross-user data corruption.
 */
export class PendingSyncError extends Error {
  constructor(
    public readonly pendingCount: number,
    public readonly conflictCount: number
  ) {
    super('PENDING_SYNC_QUEUE');
    this.name = 'PendingSyncError';
  }
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  /**
   * Cached identity từ login lần trước. Khi app khởi động offline + session
   * không refresh được, AuthGate dùng cachedIdentity để cho user vào /(main)
   * ở offline mode.
   */
  cachedIdentity: CachedIdentity | null;
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
  setProfile: (
    profile:
      | UserProfile
      | null
      | ((prev: UserProfile | null) => UserProfile | null),
  ) => void;
}

// Module-scope subscription handle — guards against double-listener khi
// `initialize()` bị gọi lại do Fast Refresh / HMR / state reset.
let authSubscription: { unsubscribe: () => void } | null = null;

/**
 * Save identity to local SQLite cache for offline bootstrap. Fire-and-forget.
 * Called sau khi sign-in thành công. KHÔNG block UX nếu DB ghi fail.
 */
async function persistIdentityToCache(
  session: Session | null
): Promise<void> {
  if (!session) return;
  try {
    // app_user_id = users.id (đã được trigger handle_new_user tự tạo từ auth_id).
    // Lookup từ users table — KHÔNG fail nếu user chưa fetch xong (table empty).
    const { data } = await supabase
      .from('users')
      .select('id, email, display_name, photo_url')
      .eq('auth_id', session.user.id)
      .maybeSingle();
    if (!data) return;
    await authCache.save({
      authUserId: session.user.id,
      appUserId: data.id,
      email: data.email,
      displayName: data.display_name ?? null,
      photoUrl: data.photo_url ?? null,
    });
  } catch (e) {
    if (__DEV__) console.warn('[auth] persistIdentityToCache failed:', e);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  cachedIdentity: null,
  isLoading: false,
  isInitialized: false,

  setProfile: (profile) =>
    set((state) => ({
      profile: typeof profile === 'function' ? profile(state.profile) : profile,
    })),

  initialize: async () => {
    // Load cached identity TRƯỚC khi gọi Supabase — nếu offline ngay từ đầu,
    // app vẫn vào được /(main) với identity từ lần login trước.
    let cached: CachedIdentity | null = null;
    try {
      cached = await authCache.load();
      if (cached) set({ cachedIdentity: cached });
    } catch (e) {
      if (__DEV__) console.warn('[auth] load cached identity failed:', e);
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      set({ session, user: session?.user ?? null, isInitialized: true });

      // Persist identity sau khi session resolved (online) — refresh cached
      // identity với photo_url/display_name mới.
      if (session) {
        void persistIdentityToCache(session);
      }

      // Listen for auth state changes (token refresh, sign out, etc.).
      // Idempotent: nếu đã subscribe thì bỏ qua để tránh duplicate listener
      // (mỗi event sẽ chạy `set` 2-N lần khi Fast Refresh remount RootLayout).
      if (!authSubscription) {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          set({ session, user: session?.user ?? null });
          if (session) void persistIdentityToCache(session);
        });
        authSubscription = data.subscription;
      }
    } catch (e) {
      // Network error → AuthGate sẽ dùng cachedIdentity
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
      // Fire-and-forget: không chặn login UX nếu permission dialog chậm hoặc fail.
      registerForPushNotifications();
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
      registerForPushNotifications();
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true });
    try {
      // Android: throws nếu device không có Google Play Services (HarmonyOS,
      // Amazon Fire, emulator không có GMS image). iOS: no-op.
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      // Native account picker — bypass hoàn toàn browser/custom scheme,
      // né được bug MIUI strip deep link redirect.
      const userInfo = await GoogleSignin.signIn();

      // Response shape khác nhau giữa version: v13+ → `{ data: { idToken } }`,
      // v12- → flat `{ idToken }`. Handle cả 2 defensively.
      const idToken =
        (userInfo as { data?: { idToken?: string | null }; idToken?: string | null })
          ?.data?.idToken ??
        (userInfo as { idToken?: string | null })?.idToken ??
        null;

      if (!idToken) {
        throw new Error('Đăng nhập Google thất bại — không nhận được ID token');
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

      if (sessionError) throw sessionError;

      set({
        session: sessionData.session,
        user: sessionData.user,
      });
      registerForPushNotifications();
    } catch (e: unknown) {
      const code = (e as { code?: string | number })?.code;
      if (code === statusCodes.SIGN_IN_CANCELLED) return;
      if (code === statusCodes.IN_PROGRESS) {
        throw new Error('Đang xử lý đăng nhập, vui lòng đợi...');
      }
      if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error(
          'Thiết bị không hỗ trợ Google Play Services. Vui lòng dùng email/mật khẩu.'
        );
      }
      if (code === 'DEVELOPER_ERROR' || code === 10) {
        // SHA-1 / package mismatch — chỉ xảy ra với misconfiguration build.
        if (__DEV__) console.error('[auth] Google DEVELOPER_ERROR:', e);
        throw new Error(
          'Cấu hình đăng nhập Google chưa đúng. Vui lòng báo team hỗ trợ.'
        );
      }
      throw e;
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
    // Gate: chặn logout nếu sync_queue còn pending/conflict. Pending replay
    // sau logout sẽ chạy dưới identity user kế tiếp (cross-user corruption).
    // Fail-fast TRƯỚC mọi side effect (FCM unregister, Supabase signOut...).
    const [pendingCount, conflictCount] = await Promise.all([
      syncQueue.countPending(),
      syncQueue.countConflicts(),
    ]);
    if (pendingCount > 0 || conflictCount > 0) {
      throw new PendingSyncError(pendingCount, conflictCount);
    }

    // Clear FCM token TRƯỚC khi clear session — cần auth còn active để pass RLS
    // update users.fcm_token = NULL. Sau khi signOut() Supabase, RLS sẽ block.
    await unregisterPushToken();

    // Clear local Google account cache trước. Nếu không, lần login Google
    // kế tiếp sẽ không show account picker (vì đã cache account cũ) —
    // UX confusing trên thiết bị chia sẻ. Idempotent: gọi khi chưa sign-in OK.
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      if (__DEV__) console.warn('[auth] GoogleSignin.signOut failed:', e);
    }

    await supabase.auth.signOut();
    clearAuthCache();
    void authCache.clear().catch((e) => {
      if (__DEV__) console.warn('[auth] authCache.clear failed:', e);
    });
    set({ session: null, user: null, profile: null, cachedIdentity: null });

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
