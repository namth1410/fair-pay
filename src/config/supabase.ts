import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { GOOGLE_WEB_CLIENT_ID, SUPABASE_ANON_KEY, SUPABASE_URL } from './constants';

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    return await SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  scopes: ['openid', 'profile', 'email'],
  offlineAccess: false,
});

// Token auto-refresh gắn với AppState (pattern chuẩn supabase-js cho React
// Native). Trên RN không có window-visibility nên phải tự lái:
//   - active: refresh CHỦ ĐỘNG ngay + chạy ticker → token luôn tươi khi user quay
//     lại sau long-background. Tránh request đầu tiên (pull/realtime) kẹt vì JWT
//     đã hết hạn — gốc của bug "data cũ → một lúc sau mới cập nhật" khi resume.
//   - background/inactive: dừng ticker để đỡ pin (timer JS bị OS treo dù sao).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
// App khởi động ở trạng thái active → start ngay (idempotent; AppState 'change'
// không phát cho lần foreground đầu tiên).
supabase.auth.startAutoRefresh();
