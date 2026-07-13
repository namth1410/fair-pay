import '../polyfills/crypto';
import '../../global.css';

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { BeVietnamPro_400Regular } from '@expo-google-fonts/be-vietnam-pro/400Regular';
import { BeVietnamPro_500Medium } from '@expo-google-fonts/be-vietnam-pro/500Medium';
import { BeVietnamPro_600SemiBold } from '@expo-google-fonts/be-vietnam-pro/600SemiBold';
import { BeVietnamPro_700Bold } from '@expo-google-fonts/be-vietnam-pro/700Bold';
import { useFonts } from '@expo-google-fonts/be-vietnam-pro/useFonts';
import { Slot, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ReducedMotionConfig,ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { CameraCaptureHost } from '../components/common/CameraCaptureHost';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { OfflineBanner } from '../components/common/OfflineBanner';
import { ConflictResolverModal } from '../components/sync/ConflictResolverModal';
import { ThemeTransitionOverlay } from '../components/common/ThemeTransitionOverlay';
import { ToastBridge } from '../components/ui/toast';
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

  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });

  useEffect(() => {
    async function boot() {
      // 3 I/O độc lập chạy SONG SONG (trước đây tuần tự, mỗi cái chặn cái sau):
      //   - bootstrapPreferences(): đọc haptics/animations/dark-mode từ SecureStore.
      //   - initNetworkSync(): NetInfo.fetch() dò trạng thái mạng hiện tại.
      //   - initDatabase(): mở SQLite + migrations.
      // Theme áp NGAY khi prefs xong (vẫn trước first paint vì render bị gate bởi
      // isDatabaseReady) → không flash system→user-pref. NetInfo KHÔNG còn chặn DB
      // init. initNetworkSync vẫn resolve TRƯỚC setDatabaseReady (Promise.all) nên
      // SyncBridge + service đầu tiên đọc cờ isOnline chính xác.
      const prefsReady = bootstrapPreferences().then(() => {
        Uniwind.setTheme(getDarkMode());
      });
      const dbReady = (async () => {
        try {
          await initDatabase();
          return true;
        } catch (err) {
          console.error('[Boot] DB init failed:', err);
          return false;
        }
      })();
      const [, , dbOk] = await Promise.all([prefsReady, initNetworkSync(), dbReady]);

      if (dbOk) {
        setDatabaseReady(true);
        // Dọn pending image uploads mồ côi (addExpense fail sau stage, app
        // crash giữa stage và write, hoặc rows kẹt retry_count >= MAX).
        sweepStagedOrphans().catch((e) => {
          if (__DEV__) console.warn('[Boot] sweepStagedOrphans failed', e);
        });
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
            <BottomSheetModalProvider>
              <StatusBar style={isDark ? 'light' : 'dark'} />
              <ToastBridge />
              <OfflineBanner />
              <AuthGate>
                <Slot />
              </AuthGate>
              <NotificationRealtimeBridge />
              <PushTapBridge />
              <SyncBridge />
              <ConflictResolverModal />
              <ThemeTransitionOverlay />
              <CameraCaptureHost />
            </BottomSheetModalProvider>
          </HeroUINativeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
