// Idempotent network state sync — gọi 1 lần từ RootLayout.boot() để đảm bảo
// `useAppStore.isOnline` phản ánh đúng trạng thái mạng NGAY sau boot, trước
// khi DB init + SyncBridge mount.
//
// Lý do tách khỏi OfflineBanner: banner mount sau khi `isDatabaseReady=true`
// → service đầu tiên (vd createGroup) có thể đọc cờ trước khi banner gắn
// listener. `addEventListener` cũng KHÔNG phát current state lúc subscribe,
// nên cần `NetInfo.fetch()` initial.
//
// Module này import NetInfo native — KHÔNG safe trong Jest. Pure logic
// (`isNetworkError`) tách riêng ở `./network.ts`.

import NetInfo from '@react-native-community/netinfo';

import { useAppStore } from '../stores/app.store';

const NET_DEBOUNCE_MS = 500;

let initialized = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export async function initNetworkSync(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const state = await NetInfo.fetch();
    useAppStore.getState().setOnline(state.isConnected ?? true);
  } catch (e) {
    // Permission issue trên Android hoặc edge case — giữ default true để
    // không break online flow. Listener vẫn subscribe.
    if (__DEV__) console.warn('[network] initial fetch failed', e);
  }

  NetInfo.addEventListener((state) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      useAppStore.getState().setOnline(state.isConnected ?? true);
    }, NET_DEBOUNCE_MS);
  });
}
