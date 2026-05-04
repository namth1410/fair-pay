/**
 * Tests for userPreferences singleton cache + SecureStore roundtrip.
 * Mocks: expo-secure-store, auth.store, user.service (type-only otherwise).
 */

const mockStore: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore[key] = value;
  }),
}));

jest.mock('../stores/auth.store', () => ({
  useAuthStore: { subscribe: jest.fn() },
}));

jest.mock('../services/user.service', () => ({
  DEFAULT_SETTINGS: {
    dark_mode: 'system',
    notify_activity: true,
    notify_payment: true,
    notify_member: true,
    notify_smart: true,
    haptics_enabled: true,
    animations_enabled: true,
  },
}));

import {
  bootstrapPreferences,
  getAnimationsEnabled,
  getHapticsEnabled,
  persistPreferencesCache,
} from '../utils/userPreferences';

const STORAGE_KEY = 'fair_pay_user_prefs';
const baseSettings = {
  dark_mode: 'system' as const,
  notify_activity: true,
  notify_payment: true,
  notify_member: true,
  notify_smart: true,
  haptics_enabled: true,
  animations_enabled: true,
};

beforeEach(async () => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  await persistPreferencesCache(baseSettings);
});

describe('userPreferences', () => {
  it('defaults to enabled when SecureStore is empty', async () => {
    delete mockStore[STORAGE_KEY];
    await persistPreferencesCache({ ...baseSettings });
    delete mockStore[STORAGE_KEY];
    await bootstrapPreferences();
    expect(getHapticsEnabled()).toBe(true);
    expect(getAnimationsEnabled()).toBe(true);
  });

  it('persistPreferencesCache writes both flags to SecureStore', async () => {
    await persistPreferencesCache({
      ...baseSettings,
      haptics_enabled: false,
      animations_enabled: false,
    });
    const raw = mockStore[STORAGE_KEY];
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.haptics_enabled).toBe(false);
    expect(parsed.animations_enabled).toBe(false);
  });

  it('persistPreferencesCache updates cache synchronously (getters reflect change)', async () => {
    await persistPreferencesCache({
      ...baseSettings,
      haptics_enabled: false,
      animations_enabled: true,
    });
    expect(getHapticsEnabled()).toBe(false);
    expect(getAnimationsEnabled()).toBe(true);
  });

  it('bootstrapPreferences hydrates cache from SecureStore', async () => {
    // beforeEach already set cache=true,true via persist(baseSettings)
    mockStore[STORAGE_KEY] = JSON.stringify({
      haptics_enabled: false,
      animations_enabled: false,
    });
    await bootstrapPreferences();
    expect(getHapticsEnabled()).toBe(false);
    expect(getAnimationsEnabled()).toBe(false);
  });

  it('bootstrapPreferences keeps defaults on corrupt JSON', async () => {
    mockStore[STORAGE_KEY] = '{not valid json';
    await bootstrapPreferences();
    expect(getHapticsEnabled()).toBe(true);
    expect(getAnimationsEnabled()).toBe(true);
  });

  it('bootstrapPreferences fills missing fields with defaults', async () => {
    mockStore[STORAGE_KEY] = JSON.stringify({ haptics_enabled: false });
    await bootstrapPreferences();
    expect(getHapticsEnabled()).toBe(false);
    expect(getAnimationsEnabled()).toBe(true);
  });
});
