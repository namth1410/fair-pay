import { create } from 'zustand';

interface UIState {
  createJoinOpen: boolean;
  setCreateJoinOpen: (open: boolean) => void;

  /**
   * Counter incremented mỗi lần header "+" trên màn Presets được tap. Presets
   * screen subscribe và reset open form về add-mode khi value thay đổi.
   * Dùng counter (không boolean) để gọi liên tiếp vẫn fire — boolean cần reset
   * về false rồi true lại mới trigger.
   */
  presetsAddRequestSeq: number;
  requestPresetsAdd: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  createJoinOpen: false,
  setCreateJoinOpen: (open) => set({ createJoinOpen: open }),

  presetsAddRequestSeq: 0,
  requestPresetsAdd: () =>
    set({ presetsAddRequestSeq: get().presetsAddRequestSeq + 1 }),
}));
