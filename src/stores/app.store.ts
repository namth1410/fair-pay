import { create } from 'zustand';

interface AppState {
  isOnline: boolean;
  isSyncing: boolean;
  isDatabaseReady: boolean;
  // OfflineBanner ghi flag này → screens (Home, GlassCapsuleHeader,
  // SyncConflictsScreen) đọc để bỏ `insets.top` redundant khi banner đã
  // cover status bar area. Tránh dải whitespace dưới banner.
  bannerVisible: boolean;

  setOnline: (isOnline: boolean) => void;
  setSyncing: (isSyncing: boolean) => void;
  setDatabaseReady: (ready: boolean) => void;
  setBannerVisible: (visible: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: true,
  isSyncing: false,
  isDatabaseReady: false,
  bannerVisible: false,

  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setDatabaseReady: (ready) => set({ isDatabaseReady: ready }),
  setBannerVisible: (visible) => set({ bannerVisible: visible }),
}));
