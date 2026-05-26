import '../polyfills/crypto';
import '../../global.css';

import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  useFonts,
} from '@expo-google-fonts/be-vietnam-pro';
import { Slot, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ReducedMotionConfig,ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { CameraCaptureHost } from '../components/common/CameraCaptureHost';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { OfflineBanner } from '../components/common/OfflineBanner';
import { SplashScene } from '../components/common/SplashScene';
import { ConflictResolverModal } from '../components/sync/ConflictResolverModal';
import { ThemeTransitionOverlay } from '../components/common/ThemeTransitionOverlay';
import { ToastBridge } from '../components/ui/toast';
import { LightningTransitionProvider } from '../contexts/LightningTransition';
import { MorphTransitionProvider } from '../contexts/MorphTransition';
import { initDatabase } from '../db/database';
import { useAppTheme } from '../hooks/useAppTheme';
import { useInvitationsRealtime } from '../hooks/useInvitationsRealtime';
import { useNotificationRealtime } from '../hooks/useNotificationRealtime';
import {
  type PushNotificationData,
  setupNotificationListeners,
} from '../services/pushNotification.service';
import { fetchCurrentUser } from '../services/user.service';
import { useAppStore } from '../stores/app.store';
import { sweepStagedOrphans } from '../sync/imageStaging';
import { SyncBridge } from '../sync/SyncBridge';
import { useAuthStore } from '../stores/auth.store';
import { initNetworkSync } from '../utils/networkSync';
import { dispatchNotificationRefetch,getDeepLinkForNotification } from '../utils/notificationRouter';
import { bootstrapPreferences, getDarkMode } from '../utils/userPreferences';

SplashScreen.preventAutoHideAsync();

/**
 * Self-gating bridge: subscribes to Supabase realtime for the current user's
 * notifications. Hook no-ops when there's no session, and tears down its
 * channel on logout/unmount. Mounted as sibling to <Slot/> so it sits inside
 * <HeroUINativeProvider> (toast context) but doesn't depend on the route tree.
 */
function NotificationRealtimeBridge() {
  useNotificationRealtime();
  useInvitationsRealtime();
  return null;
}

/**
 * FCM tap → deep link + refetch stores. Setup 1 lần ở root, KHÔNG re-mount
 * theo session để bắt cold-start case (app bị kill → user tap notification →
 * launch → cần process tap ngay khi root mount). Refetch sẽ no-op nếu chưa
 * có session (stores chưa load).
 */
function PushTapBridge() {
  const router = useRouter();
  useEffect(() => {
    const cleanup = setupNotificationListeners((data: PushNotificationData) => {
      const route =
        data.route ||
        getDeepLinkForNotification(
          data.type || '',
          data.group_id ?? null,
          data.trip_id ?? null
        );
      if (data.type) {
        dispatchNotificationRefetch(
          data.type,
          data.group_id ?? null,
          data.trip_id ?? null
        );
      }
      if (route) {
        router.push(route as never);
      }
    });
    return cleanup;
  }, [router]);
  return null;
}

// Module-level flag: splash chỉ chạy 1 lần / cold boot. Nếu RootLayout có remount
// (theme change, navigation cross-group khi login/logout, hot reload…), state
// component sẽ reset nhưng cờ này giữ nguyên → splash không phát lại.
let __splashShown = false;

function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const cachedIdentity = useAuthStore((s) => s.cachedIdentity);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const segments = useSegments();
  const router = useRouter();

  // Đã đăng nhập (online) HOẶC có cached identity (offline restore).
  const isAuthed = !!session || !!cachedIdentity;

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    // Reset-password needs to stay mounted even with an active session so the
    // user can finish updating their password before we redirect them to main.
    const inResetPassword = (segments as string[]).includes('reset-password');

    if (!isAuthed && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthed && inAuthGroup && !inResetPassword) {
      router.replace('/(main)');
    } else {
      SplashScreen.hideAsync();
    }
  }, [isAuthed, isInitialized, segments]);

  if (!isInitialized) return null;

  const inAuthGroup = segments[0] === '(auth)';
  const inResetPassword = (segments as string[]).includes('reset-password');
  if (!isAuthed && !inAuthGroup) return null;
  if (isAuthed && inAuthGroup && !inResetPassword) return null;

  return <>{children}</>;
}

/**
 * Syncs the runtime theme (Uniwind) with the user's saved dark-mode preference.
 * Runs whenever auth session changes — so on sign-in we apply the user's pref,
 * and on sign-out we reset to follow system.
 */
function useThemeHydration() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const setProfile = useAuthStore((s) => s.setProfile);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetchCurrentUser()
      .then((profile) => {
        if (cancelled || !profile) return;
        setProfile(profile);
        // Only re-apply if it differs from the locally-cached value (which was
        // already applied at boot). Avoids a redundant theme flip when Supabase
        // confirms the same value the user picked previously.
        if (profile.settings.dark_mode !== getDarkMode()) {
          Uniwind.setTheme(profile.settings.dark_mode);
        }
      })
      .catch((err) => {
        console.warn('[Theme] Failed to load preference:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, setProfile]);
}

export default function RootLayout() {
  const { isDark, ...c } = useAppTheme();
  const initialize = useAuthStore((s) => s.initialize);
  const setDatabaseReady = useAppStore((s) => s.setDatabaseReady);
  const [splashDone, setSplashDone] = useState(__splashShown);

  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });

  useEffect(() => {
    async function boot() {
      // Hydrate haptics/animations/dark-mode preferences from SecureStore BEFORE
      // Splash mounts, so non-component code (haptics helper, splash, transitions)
      // reads the user's persisted choice instead of defaults — and so the theme
      // is applied synchronously instead of flashing system → user-pref after
      // the Supabase round-trip on first paint.
      await bootstrapPreferences();
      Uniwind.setTheme(getDarkMode());
      // Sync isOnline với current network state TRƯỚC khi DB init + SyncBridge
      // mount, để service đầu tiên (vd createGroup) đọc cờ chính xác khi cold
      // start offline. `addEventListener` ko phát current state nên cần fetch.
      await initNetworkSync();
      try {
        await initDatabase();
        setDatabaseReady(true);
        // Dọn pending image uploads mồ côi (addExpense fail sau stage, app
        // crash giữa stage và write, hoặc rows kẹt retry_count >= MAX).
        sweepStagedOrphans().catch((e) => {
          if (__DEV__) console.warn('[Boot] sweepStagedOrphans failed', e);
        });
      } catch (err) {
        console.error('[Boot] DB init failed:', err);
      }
      await initialize();
    }
    boot();
  }, []);

  useThemeHydration();

  const isDatabaseReady = useAppStore((s) => s.isDatabaseReady);

  if (!fontsLoaded || !isDatabaseReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardProvider>
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <ErrorBoundary>
        <SafeAreaProvider>
          <HeroUINativeProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <ToastBridge />
            <OfflineBanner />
            <MorphTransitionProvider>
              <LightningTransitionProvider>
                <AuthGate>
                  <Slot />
                </AuthGate>
                <NotificationRealtimeBridge />
                <PushTapBridge />
                <SyncBridge />
                <ConflictResolverModal />
              </LightningTransitionProvider>
            </MorphTransitionProvider>
            <ThemeTransitionOverlay />
            <CameraCaptureHost />
            {!splashDone && (
              <SplashScene
                onComplete={() => {
                  __splashShown = true;
                  setSplashDone(true);
                }}
              />
            )}
          </HeroUINativeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
