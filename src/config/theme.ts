// Design tokens — Fair Pay Monochrome palette (đen/trắng modern)
// Light: accent đen (eclipse), surface trắng, neutral grays
// Dark: accent trắng (snow), surface zinc-800, neutral grays
// Status colors (success/warning/danger) giữ semantic để UX dễ phân biệt.

// Hex values — dùng qua hook useAppTheme() cho StyleSheet
export const colors = {
  light: {
    background: '#F7F7F7',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F1F2',
    foreground: '#1A1A1F',
    muted: '#71717A',
    primary: '#1A1A1F',
    primaryStrong: '#000000',
    primarySoft: '#E4E4E7',
    warmAccent: '#3F3F46',
    tint: '#F4F4F5',
    success: '#10B981',
    danger: '#E11D48',
    warning: '#F59E0B',
    divider: '#E4E4E7',
    inverseForeground: '#FFFFFF',
    successSoft: '#D1FAE5',
    dangerSoft: '#FFE4E6',
    accentSoft: '#F4F4F5',
  },
  dark: {
    background: '#1A1A1F',
    surface: '#232328',
    surfaceAlt: '#2A2A2F',
    foreground: '#FAFAFA',
    muted: '#A1A1AA',
    primary: '#FAFAFA',
    primaryStrong: '#FFFFFF',
    primarySoft: '#3F3F46',
    warmAccent: '#A1A1AA',
    tint: '#27272A',
    success: '#34D399',
    danger: '#FB7185',
    warning: '#FBBF24',
    divider: '#27272A',
    inverseForeground: '#1A1A1F',
    successSoft: '#064E3B',
    dangerSoft: '#4C0519',
    accentSoft: '#27272A',
  },
};
