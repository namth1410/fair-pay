// Design tokens — Fair Pay Sakura palette (hồng nhạt dịu dàng)
// Ref: docs/technical-specification.md Section 7.2
//
// Light: primary pink-300, surface pink-50 tint, foreground deep plum
// Dark: primary saturate giảm (0.72 * chroma) để không chói trên nền plum đậm

export const lightTheme = {
  background: '0 0% 100%',              // #FFFFFF
  surface: '340 100% 97%',              // #FDF2F8 — pink-50 tint
  'surface-2': '340 78% 94%',           // pink-100
  foreground: '328 40% 20%',            // #4A1F38 — deep plum
  'foreground-secondary': '328 18% 45%',// #7A5F6E
  primary: '328 80% 82%',               // #F9A8D4 — pink-300
  success: '160 84% 39%',               // #10B981
  danger: '350 86% 52%',                // #E11D48 — rose-600
  warning: '32 95% 44%',                // #D97706 (giữ để đọc dễ)
  divider: '340 50% 90%',               // pink-tinted divider
};

export const darkTheme = {
  background: '328 28% 10%',            // #1F1018 — deep plum bg
  surface: '328 24% 15%',               // plum surface
  'surface-2': '328 20% 22%',           // plum surface-2
  foreground: '340 60% 94%',            // #FBE4EF — pink-tinted foreground
  'foreground-secondary': '328 20% 70%',// #B29CA6
  primary: '328 65% 75%',               // saturate giảm — dịu trên dark
  success: '160 65% 55%',
  danger: '350 75% 65%',
  warning: '48 90% 60%',
  divider: '328 18% 25%',
};

// Hex values — dùng qua hook useAppTheme() cho StyleSheet
export const colors = {
  light: {
    background: '#FFFFFF',
    surface: '#FDF2F8',         // pink-50 tint
    surfaceAlt: '#FCE7F3',      // pink-100 — banner/hero bg
    foreground: '#4A1F38',      // deep plum
    muted: '#7A5F6E',           // plum muted
    primary: '#F9A8D4',         // pink-300
    primaryStrong: '#EC4899',   // pink-500 — dùng cho text on tint / badges
    primarySoft: '#FBCFE8',     // pink-200 — soft bg
    warmAccent: '#FDA4AF',      // rose-300 — complementary
    tint: '#FDF2F8',            // pink-50
    success: '#10B981',         // emerald-500
    danger: '#E11D48',          // rose-600
    warning: '#F59E0B',         // amber-500
    divider: '#FBCFE8',         // pink-200 divider
    inverseForeground: '#FFFFFF', // text/icon trên nền màu đậm
    // Soft variants (badge/banner backgrounds)
    successSoft: '#D1FAE5',     // emerald-100
    dangerSoft: '#FFE4E6',      // rose-100
    accentSoft: '#FCE7F3',      // pink-100
  },
  dark: {
    background: '#1F1018',      // deep plum
    surface: '#2D1A25',         // plum surface
    surfaceAlt: '#3D2433',      // plum surface elevated
    foreground: '#FBE4EF',      // pink-tinted text
    muted: '#B29CA6',           // plum muted
    primary: '#F0B5D2',         // dịu trên dark
    primaryStrong: '#F9A8D4',
    primarySoft: '#6B2E50',     // muted plum-pink
    warmAccent: '#E8879A',
    tint: '#2D1A25',
    success: '#34D399',
    danger: '#FB7185',
    warning: '#FBBF24',
    divider: '#3D2433',
    inverseForeground: '#FFFFFF', // text/icon trên nền màu đậm
    // Soft variants (badge backgrounds)
    successSoft: '#064E3B',
    dangerSoft: '#4C0519',
    accentSoft: '#4D1E38',      // deep plum-pink
  },
};
