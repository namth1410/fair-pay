// Design tokens — Fair Pay "Hội thoại" (2026-10): xanh lá lấy từ linh vật rồng.
// Light: nền xám lạnh rất nhạt, surface trắng, accent xanh lá đậm (#267A42) — chữ trắng trên accent.
// Dark: nền gần đen ánh xanh, accent xanh sáng (#5FCB8B) — chữ tối trên accent (như bản monochrome cũ
// dùng primary trắng + inverseForeground tối) để token primary dùng được CẢ làm nền nút LẪN làm màu chữ/icon.
// Đồng bộ với biến HeroUI ở global.css — sửa 1 bên PHẢI sửa bên kia.

// Hex values — dùng qua hook useAppTheme() cho StyleSheet
export const colors = {
  light: {
    background: '#F5F6F8',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F3F5',
    foreground: '#12161A',
    muted: '#5B6470',
    primary: '#267A42',
    primaryStrong: '#1E6B37',
    primarySoft: '#E3F4E8',
    warmAccent: '#3D4550',
    tint: '#F1F3F5',
    success: '#1E7A3C',
    danger: '#C2362F',
    warning: '#F59E0B',
    divider: '#E7EAEE',
    inverseForeground: '#FFFFFF',
    successSoft: '#E3F4E8',
    dangerSoft: '#FDECEA',
    accentSoft: '#F1F3F5',
    // Bong bóng tin nhắn (luồng chuyến đi)
    bubbleMine: '#267A42',
    onBubbleMine: '#FFFFFF',
    onBubbleMineMuted: '#DDF3E3',
    bubbleOther: '#F1F3F5',
    brandSoft: '#EAF7EE',
    brandBorder: '#CDEFD8',
  },
  dark: {
    background: '#0F1214',
    surface: '#171B1E',
    surfaceAlt: '#1E2428',
    foreground: '#E8ECEF',
    muted: '#9AA4AE',
    primary: '#5FCB8B',
    primaryStrong: '#7BD9A1',
    primarySoft: '#16301F',
    warmAccent: '#B8C1CA',
    tint: '#1E2428',
    success: '#6FD39A',
    danger: '#FF8A80',
    warning: '#FBBF24',
    divider: '#262C31',
    inverseForeground: '#0F1214',
    successSoft: '#13261A',
    dangerSoft: '#3A1A18',
    accentSoft: '#1E2428',
    bubbleMine: '#22703F',
    onBubbleMine: '#FFFFFF',
    onBubbleMineMuted: '#D3EEDC',
    bubbleOther: '#1E2428',
    brandSoft: '#13261A',
    brandBorder: '#24543A',
  },
};
