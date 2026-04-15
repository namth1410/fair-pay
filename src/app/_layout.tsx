import '../../global.css';

import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  useFonts,
} from '@expo-google-fonts/be-vietnam-pro';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { LoadingScreen } from '../components/common/LoadingScreen';
import { OfflineBanner } from '../components/common/OfflineBanner';
import { initDatabase } from '../db/database';
import { useAppStore } from '../stores/app.store';
import { useAuthStore } from '../stores/auth.store';

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
    }
  }, [session, isInitialized, segments]);

  if (!isInitialized) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <HeroUINativeProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <OfflineBanner />
            <AuthGate>
              <Slot />
            </AuthGate>
          </HeroUINativeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
