import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { DEFAULT_SETTINGS, type UserSettings } from '../services/user.service';
import { useAuthStore } from '../stores/auth.store';

// SecureStore key — alphanumeric + `.`, `-`, `_` only (no `:`).
const STORAGE_KEY = 'fair_pay_user_prefs';
const HOME_VIEW_MODE_KEY = 'fair_pay_home_view_mode';

export type HomeViewMode = 'list' | 'carousel' | 'arc';
const DEFAULT_HOME_VIEW_MODE: HomeViewMode = 'list';

interface PrefCache {
  haptics: boolean;
  animations: boolean;
  homeViewMode: HomeViewMode;
  darkMode: UserSettings['dark_mode'];
}

let cache: PrefCache = {
  haptics: DEFAULT_SETTINGS.haptics_enabled,
  animations: DEFAULT_SETTINGS.animations_enabled,
  homeViewMode: DEFAULT_HOME_VIEW_MODE,
  darkMode: DEFAULT_SETTINGS.dark_mode,
};
const listeners = new Set<() => void>();

const setCache = (next: PrefCache) => {
  if (
    next.haptics !== cache.haptics ||
    next.animations !== cache.animations ||
    next.homeViewMode !== cache.homeViewMode ||
    next.darkMode !== cache.darkMode
  ) {
    cache = next;
    listeners.forEach((l) => l());
  }
};

/**
 * Hydrate cache from SecureStore. Call once at app boot, BEFORE SplashScene mounts,
 * so non-component code (haptics helper, splash, transitions) reads the user's
 * persisted preference instead of falling back to defaults.
 */
export async function bootstrapPreferences(): Promise<void> {
  try {
    const [raw, rawHomeMode] = await Promise.all([
      SecureStore.getItemAsync(STORAGE_KEY),
      SecureStore.getItemAsync(HOME_VIEW_MODE_KEY),
    ]);
    const parsed = raw ? (JSON.parse(raw) as Partial<UserSettings>) : null;
    const homeViewMode: HomeViewMode =
      rawHomeMode === 'list' ||
      rawHomeMode === 'carousel' ||
      rawHomeMode === 'arc'
        ? rawHomeMode
        : DEFAULT_HOME_VIEW_MODE;
    const darkMode: UserSettings['dark_mode'] =
      parsed?.dark_mode === 'light' ||
      parsed?.dark_mode === 'dark' ||
      parsed?.dark_mode === 'system'
        ? parsed.dark_mode
        : DEFAULT_SETTINGS.dark_mode;
    setCache({
      haptics: parsed?.haptics_enabled ?? DEFAULT_SETTINGS.haptics_enabled,
      animations: parsed?.animations_enabled ?? DEFAULT_SETTINGS.animations_enabled,
      homeViewMode,
      darkMode,
    });
  } catch {
    // ignore — keep defaults
  }
}

/**
 * Mirror new settings to SecureStore + update cache. Call from settings.tsx
 * AFTER `updateSettings(...)` succeeds — avoids drift on DB failure.
 */
export async function persistPreferencesCache(settings: UserSettings): Promise<void> {
  setCache({
    haptics: settings.haptics_enabled,
    animations: settings.animations_enabled,
    homeViewMode: cache.homeViewMode,
    darkMode: settings.dark_mode,
  });
  try {
    await SecureStore.setItemAsync(
      STORAGE_KEY,
      JSON.stringify({
        haptics_enabled: settings.haptics_enabled,
        animations_enabled: settings.animations_enabled,
        dark_mode: settings.dark_mode,
      }),
    );
  } catch {
    // ignore — cache still updated for current session
  }
}

export async function setHomeViewMode(mode: HomeViewMode): Promise<void> {
  setCache({ ...cache, homeViewMode: mode });
  try {
    await SecureStore.setItemAsync(HOME_VIEW_MODE_KEY, mode);
  } catch {
    // ignore — cache still updated for current session
  }
}

useAuthStore.subscribe((state) => {
  const s = state.profile?.settings;
  if (!s) return;
  const next: PrefCache = {
    haptics: s.haptics_enabled,
    animations: s.animations_enabled,
    homeViewMode: cache.homeViewMode,
    darkMode: s.dark_mode,
  };
  setCache(next);
  // Mirror to SecureStore so the next cold boot reads the latest server-side
  // value (not just an in-memory copy from this session).
  SecureStore.setItemAsync(
    STORAGE_KEY,
    JSON.stringify({
      haptics_enabled: s.haptics_enabled,
      animations_enabled: s.animations_enabled,
      dark_mode: s.dark_mode,
    }),
  ).catch(() => {
    // ignore
  });
});

export const getHapticsEnabled = (): boolean => cache.haptics;
export const getAnimationsEnabled = (): boolean => cache.animations;
export const getHomeViewMode = (): HomeViewMode => cache.homeViewMode;
export const getDarkMode = (): UserSettings['dark_mode'] => cache.darkMode;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const useHapticsEnabled = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => cache.haptics,
    () => cache.haptics,
  );

export const useAnimationsEnabled = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => cache.animations,
    () => cache.animations,
  );

export const useHomeViewMode = (): HomeViewMode =>
  useSyncExternalStore(
    subscribe,
    () => cache.homeViewMode,
    () => cache.homeViewMode,
  );
