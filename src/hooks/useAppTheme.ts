import { useUniwind } from 'uniwind';

import { colors } from '../config/theme';

/**
 * Returns true when the effective UI theme is dark. Reads from Uniwind's
 * runtime theme so it stays in sync with both system preference and
 * manual overrides (e.g. user toggling dark mode in settings).
 */
export function useIsDark(): boolean {
  const { theme } = useUniwind();
  return theme === 'dark';
}

export function useAppTheme() {
  return useIsDark() ? colors.dark : colors.light;
}
