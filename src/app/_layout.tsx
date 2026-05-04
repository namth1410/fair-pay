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
import { ReducedMotionConfig,ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { CameraCaptureHost } from '../components/common/CameraCaptureHost';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { OfflineBanner } from '../components/common/OfflineBanner';
import { SplashScene } from '../components/common/SplashScene';
import { ThemeTransitionOverlay } from '../components/common/ThemeTransitionOverlay';
import { BlackHoleTransitionProvider } from '../contexts/BlackHoleTransition';
import { LightningTransitionProvider } from '../contexts/LightningTransition';
import { MorphTransitionProvider } from '../contexts/MorphTransition';
import { initDatabase } from '../db/database';
import { useAppTheme } from '../hooks/useAppTheme';
import { fetchCurrentUser } from '../services/user.service';
import { useAppStore } from '../stores/app.store';
import { useAuthStore } from '../stores/auth.store';
import { bootstrapPreferences, getDarkMode } from '../utils/userPreferences';

SplashScreen.preventAutoHideAsync();

// Module-level flag: splash chỉ chạy 1 lần / cold boot. Nếu RootLayout có remount
// (theme change, navigation cross-group khi login/logout, hot reload…), state
// component sẽ reset nhưng cờ này giữ nguyên → splash không phát lại.
let __splashShown = false;

function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    // Reset-password needs to stay mounted even with an active session so the
    // user can finish updating their password before we redirect them to main.
    const inResetPassword = (segments as string[]).includes('reset-password');

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup && !inResetPassword) {
      router.replace('/(main)');
    } else {
      SplashScreen.hideAsync();
    }
  }, [session, isInitialized, segments]);

  if (!isInitialized) return null;

  const inAuthGroup = segments[0] === '(auth)';
  const inResetPassword = (segments as string[]).includes('reset-password');
  if (!session && !inAuthGroup) return null;
  if (session && inAuthGroup && !inResetPassword) return null;

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
      try {
        await initDatabase();
        setDatabaseReady(true);
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
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <ErrorBoundary>
        <SafeAreaProvider>
          <HeroUINativeProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <OfflineBanner />
            <MorphTransitionProvider>
              <LightningTransitionProvider>
                <BlackHoleTransitionProvider>
                  <AuthGate>
                    <Slot />
                  </AuthGate>
                </BlackHoleTransitionProvider>
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
    </GestureHandlerRootView>
  );
}
