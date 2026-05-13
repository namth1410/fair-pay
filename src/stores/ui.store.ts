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

  /** Cùng pattern presetsAddRequestSeq — bridge nút Share ở header trip → mở ExportScopeSheet. */
  tripExportRequestSeq: number;
  requestTripExport: () => void;

  /**
   * True khi user đang chạm vào GroupCarousel (touch xuống đến khi nhả).
   * (tabs)/_layout đọc giá trị này để tắt `swipeEnabled` của ReanimatedTabs
   * trong khoảng đó → tránh xung đột giữa pan của carousel và pan chuyển tab.
   * Carousel set qua Pan.onTouchesDown / onFinalize (worklet → runOnJS).
   */
  carouselTouching: boolean;
  setCarouselTouching: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  createJoinOpen: false,
  setCreateJoinOpen: (open) => set({ createJoinOpen: open }),

  presetsAddRequestSeq: 0,
  requestPresetsAdd: () =>
    set({ presetsAddRequestSeq: get().presetsAddRequestSeq + 1 }),

  tripExportRequestSeq: 0,
  requestTripExport: () =>
    set({ tripExportRequestSeq: get().tripExportRequestSeq + 1 }),

  carouselTouching: false,
  setCarouselTouching: (v) => set({ carouselTouching: v }),
}));
