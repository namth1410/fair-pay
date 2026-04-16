import { useUniwind } from 'uniwind';

import { colors } from '../config/theme';

/**
 * Single hook for theme access. Returns color tokens + isDark flag.
 * Components that only need colors can destructure just what they need.
 * Calls useUniwind() exactly once per component.
 */
export function useAppTheme() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  return { isDark, ...(isDark ? colors.dark : colors.light) };
}

/** @deprecated Use useAppTheme().isDark instead */
export function useIsDark(): boolean {
  const { theme } = useUniwind();
  return theme === 'dark';
}
