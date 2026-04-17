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
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReducedMotionConfig,ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { OfflineBanner } from '../components/common/OfflineBanner';
import { ThemeTransitionOverlay } from '../components/common/ThemeTransitionOverlay';
import { initDatabase } from '../db/database';
import { useAppTheme } from '../hooks/useAppTheme';
import { fetchCurrentUser } from '../services/user.service';
import { useAppStore } from '../stores/app.store';
import { useAuthStore } from '../stores/auth.store';

SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(main)');
    } else {
      SplashScreen.hideAsync();
    }
  }, [session, isInitialized, segments]);

  if (!isInitialized) return null;

  const inAuthGroup = segments[0] === '(auth)';
  if (!session && !inAuthGroup) return null;
  if (session && inAuthGroup) return null;

  return <>{children}</>;
}

/**
 * Syncs the runtime theme (Uniwind) with the user's saved dark-mode preference.
 * Runs whenever auth session changes — so on sign-in we apply the user's pref,
 * and on sign-out we reset to follow system.
 */
function useThemeHydration() {
  const userId = useAuthStore((s) => s.session?.user.id);

  useEffect(() => {
    if (!userId) {
      Uniwind.setTheme('system');
      return;
    }
    let cancelled = false;
    fetchCurrentUser()
      .then((profile) => {
        if (cancelled || !profile) return;
        Uniwind.setTheme(profile.settings.dark_mode);
      })
      .catch((err) => {
        console.warn('[Theme] Failed to load preference:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
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
            <AuthGate>
              <Slot />
            </AuthGate>
            <ThemeTransitionOverlay />
          </HeroUINativeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
