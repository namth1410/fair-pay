// Font family constants — dùng trong StyleSheet
// Mapping: fontWeight → fontFamily. Onest (có đủ dấu tiếng Việt) — thay Be Vietnam Pro từ
// đợt giao diện "Hội thoại" 2026-10. Load ở src/app/_layout.tsx (useFonts) — thêm weight mới
// PHẢI thêm cả 2 chỗ.
export const fonts = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  extrabold: 'Onest_800ExtraBold',
} as const;
