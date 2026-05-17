import { loadFont } from "@remotion/google-fonts/BeVietnamPro";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
});

export const FONT = fontFamily;

export const COLOR = {
  bg: "#F5F5F7",
  white: "#FFFFFF",
  primary: "#0B0B0F",
  secondary: "#6B7280",
  muted: "#9CA3AF",
  border: "#E5E7EB",
  danger: "#E11D48",
  dangerBg: "#FFE4E9",
  success: "#10B981",
  successBg: "#D1FAE5",
  cardLavender: "#C7C9F5",
  cardPeach: "#FFD4B8",
  cardMint: "#B8E8D4",
  cardSky: "#BFE6FF",
  mintLight: "#D9F5E5",
  mintMid: "#A8E6CF",
  mintDeep: "#4FD1A5",
  lavenderDeep: "#6366F1",
  sheetHeaderYellow: "#FEF3C7",
  sheetRowGray: "#F9FAFB",
  sheetGridLine: "#D1D5DB",
} as const;

// 35.5s @ 30fps = 1065 frames. 8 scenes with 15-frame overlap each.
// Cast: Nam, Thu, Quyết, Tâm — Nhóm "Hảo hán K65 UET" — chuyến phượt Hà Giang.
export const SCENE = {
  hook: { start: 0, duration: 90 }, //          0 →   90  (3.0s) — 4 chat bubble đau đầu
  excel: { start: 75, duration: 150 }, //       75 →  225  (5.0s) — Google Sheet bị gạch bỏ
  camera: { start: 210, duration: 120 }, //    210 →  330  (4.0s) — chụp khoảnh khắc
  form: { start: 315, duration: 195 }, //      315 →  510  (6.5s) — form Coffee 240k
  success: { start: 495, duration: 90 }, //    495 →  585  (3.0s) — Xong + receipt 240k
  expenseList: { start: 570, duration: 150 }, // 570 → 720 (5.0s) — list 6 khoản chi + scroll
  settlement: { start: 705, duration: 195 }, // 705 →  900 (6.5s) — 2-phase chaos→clean
  cta: { start: 885, duration: 180 }, //       885 → 1065 (6.0s) — Play Store
} as const;

export const TOTAL_DURATION = 1065;

// Nhóm và thành viên
export const GROUP_NAME = "Hảo hán K65 UET";
export const MEMBERS = [
  { id: "nam", initial: "N", label: "Nam", bg: COLOR.primary, fg: COLOR.white },
  { id: "thu", initial: "T", label: "Thu", bg: COLOR.cardPeach, fg: COLOR.primary },
  { id: "quyet", initial: "Q", label: "Quyết", bg: COLOR.cardLavender, fg: COLOR.primary },
  { id: "tam", initial: "T", label: "Tâm", bg: COLOR.cardMint, fg: COLOR.primary },
] as const;
