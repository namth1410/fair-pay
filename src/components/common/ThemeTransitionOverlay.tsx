import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Uniwind } from 'uniwind';

import { colors } from '../../config/theme';
import {
  registerThemeTransitionTrigger,
  resolveBackgroundColor,
  type ThemePref,
} from '../../utils/themeTransition';

const FADE_IN_MS = 100;
const FADE_OUT_MS = 250;

/**
 * Renders a full-screen overlay that crossfades when the user toggles the
 * theme. The overlay is filled with the target theme's background color:
 * fade-in covers the old theme, we swap Uniwind underneath, then fade-out
 * reveals the new theme — masking the hard flip of every hard-coded color
 * in StyleSheet-based components.
 *
 * Must be mounted once near the root so it sits on top of app content.
 * Note: on iOS, heroui BottomSheet renders in a FullWindowOverlay which sits
 * ABOVE this overlay — the sheet itself will still flash during the swap.
 */
export function ThemeTransitionOverlay() {
  const opacity = useSharedValue(0);
  const [color, setColor] = useState(colors.light.background);

  useEffect(() => {
    const unregister = registerThemeTransitionTrigger((to) => {
      setColor(resolveBackgroundColor(to));
      opacity.value = withTiming(1, { duration: FADE_IN_MS }, (finished) => {
        if (!finished) return;
        runOnJS(applyAndReveal)(to);
      });
    });
    return unregister;
  }, []);

  function applyAndReveal(to: ThemePref) {
    Uniwind.setTheme(to);
    opacity.value = withTiming(0, { duration: FADE_OUT_MS });
  }

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}
