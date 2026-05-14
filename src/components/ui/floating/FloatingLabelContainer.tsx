import { useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fonts } from '../../../config/fonts';
import { useAppTheme } from '../../../hooks/useAppTheme';

interface FloatingLabelContainerProps {
  label: string;
  isFocused: boolean;
  hasValue: boolean;
  error?: string;
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
  accessibilityLabel?: string;
  /** Background color to match parent — used for container fill + label "notch" bg. Default: c.background. */
  surfaceColor?: string;
}

const ANIM_DURATION = 150;

export function FloatingLabelContainer({
  label,
  isFocused,
  hasValue,
  error,
  onPress,
  children,
  style,
  minHeight = 50,
  accessibilityLabel,
  surfaceColor,
}: FloatingLabelContainerProps) {
  const c = useAppTheme();
  const bg = surfaceColor ?? c.background;
  const reducedMotion = useReducedMotion();

  const floatProgress = useSharedValue(isFocused || hasValue ? 1 : 0);
  const focusProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    const target = isFocused || hasValue ? 1 : 0;
    floatProgress.value = reducedMotion ? target : withTiming(target, { duration: ANIM_DURATION });
  }, [isFocused, hasValue, reducedMotion, floatProgress]);

  useEffect(() => {
    const target = isFocused ? 1 : 0;
    focusProgress.value = reducedMotion ? target : withTiming(target, { duration: ANIM_DURATION });
  }, [isFocused, reducedMotion, focusProgress]);

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const focusedColor = error ? c.danger : c.primary;
    const restColor = error ? c.danger : c.muted;
    return {
      top: interpolate(floatProgress.value, [0, 1], [14, -7]),
      fontSize: interpolate(floatProgress.value, [0, 1], [15, 11]),
      color: interpolateColor(focusProgress.value, [0, 1], [restColor, focusedColor]),
    };
  });

  const borderAnimatedStyle = useAnimatedStyle(() => {
    if (error) {
      return { borderColor: c.danger };
    }
    return {
      borderColor: interpolateColor(focusProgress.value, [0, 1], [c.divider, c.primary]),
    };
  });

  const innerView = (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bg, minHeight },
        borderAnimatedStyle,
        style,
      ]}
    >
      {children}
      <Animated.Text
        numberOfLines={1}
        pointerEvents="none"
        style={[
          styles.label,
          { fontFamily: fonts.regular, backgroundColor: bg },
          labelAnimatedStyle,
        ]}
      >
        {label}
      </Animated.Text>
    </Animated.View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          style={({ pressed }) => [pressed ? styles.pressed : null]}
        >
          {innerView}
        </Pressable>
      ) : (
        innerView
      )}
      {error ? (
        <Text style={[styles.errorText, { color: c.danger, fontFamily: fonts.regular }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    left: 10,
    right: 10,
    paddingHorizontal: 4,
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.7,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
