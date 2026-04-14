import { create } from 'zustand';

interface AppState {
  isOnline: boolean;
  isSyncing: boolean;
  isDatabaseReady: boolean;

  setOnline: (isOnline: boolean) => void;
  setSyncing: (isSyncing: boolean) => void;
  setDatabaseReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: true,
  isSyncing: false,
  isDatabaseReady: false,

  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setDatabaseReady: (ready) => set({ isDatabaseReady: ready }),
}));
