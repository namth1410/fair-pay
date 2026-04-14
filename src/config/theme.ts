// Design tokens — HSL format cho HeroUI Native
// Ref: docs/technical-specification.md Section 7.2

export const lightTheme = {
  background: '0 0% 100%',             // #FFFFFF
  surface: '210 40% 98%',              // #F8FAFC
  'surface-2': '210 40% 96%',          // #F1F5F9
  foreground: '207 24% 14%',           // #1A252F
  'foreground-secondary': '215 16% 47%', // #64748B
  primary: '204 70% 39%',              // #1D6FA8
  success: '142 76% 36%',              // #16A34A
  danger: '0 84% 51%',                 // #DC2626
  warning: '32 95% 44%',               // #D97706
  divider: '214 32% 91%',              // #E2E8F0
};

export const darkTheme = {
  background: '222 47% 11%',           // #0F172A
  surface: '217 33% 17%',              // #1E293B
  'surface-2': '215 25% 27%',          // #334155
  foreground: '210 40% 96%',           // #F1F5F9
  'foreground-secondary': '215 20% 65%', // #94A3B8
  primary: '199 89% 60%',              // #38BDF8
  success: '142 69% 58%',              // #4ADE80
  danger: '0 91% 71%',                 // #F87171
  warning: '48 96% 60%',               // #FCD34D
  divider: '215 25% 27%',              // #334155
};

// Hex values for non-HeroUI usage (StatusBar, system components)
export const colors = {
  light: {
    background: '#FFFFFF',
    foreground: '#1A252F',
    primary: '#1D6FA8',
    success: '#16A34A',
    danger: '#DC2626',
  },
  dark: {
    background: '#0F172A',
    foreground: '#F1F5F9',
    primary: '#38BDF8',
    success: '#4ADE80',
    danger: '#F87171',
  },
};
