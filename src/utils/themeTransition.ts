import { Appearance } from 'react-native';
import { Uniwind } from 'uniwind';

import { colors } from '../config/theme';

export type ThemePref = 'system' | 'light' | 'dark';

// Singleton trigger. `ThemeTransitionOverlay` registers a callback here on
// mount; other call sites go through `transitionToTheme` so they get the
// crossfade animation. Falls back to an un-animated Uniwind.setTheme if no
// overlay has registered (e.g. during boot hydration).
const state: { trigger: (to: ThemePref) => void } = {
  trigger: (to) => Uniwind.setTheme(to),
};

export function registerThemeTransitionTrigger(fn: (to: ThemePref) => void) {
  state.trigger = fn;
  return () => {
    state.trigger = (to) => Uniwind.setTheme(to);
  };
}

export function transitionToTheme(to: ThemePref) {
  state.trigger(to);
}

/**
 * Resolves the background color for a theme preference. 'system' resolves via
 * the current OS color scheme since Uniwind won't have flipped yet at call time.
 */
export function resolveBackgroundColor(pref: ThemePref): string {
  if (pref === 'dark') return colors.dark.background;
  if (pref === 'light') return colors.light.background;
  return Appearance.getColorScheme() === 'dark'
    ? colors.dark.background
    : colors.light.background;
}
