import { useEffect } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
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
  /**
   * Top-align children thay vì center. Bắt buộc cho ô multiline cao: nếu center,
   * input ngắn nằm giữa box trong khi placeholder nổi ở `top: 14` → tap placeholder
   * trượt khỏi input. Khi true, input (flex: 1) lấp đầy box → cả vùng đều touch được.
   */
  fillContent?: boolean;
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
  fillContent,
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

  const labelWrapAnimatedStyle = useAnimatedStyle(() => ({
    top: interpolate(floatProgress.value, [0, 1], [14, -7]),
  }));

  const labelTextAnimatedStyle = useAnimatedStyle(() => {
    const focusedColor = error ? c.danger : c.primary;
    const restColor = error ? c.danger : c.muted;
    return {
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
        fillContent ? styles.fillContent : null,
        borderAnimatedStyle,
        style,
      ]}
    >
      {children}
      <Animated.View
        pointerEvents="none"
        style={[styles.labelWrap, { backgroundColor: bg }, labelWrapAnimatedStyle]}
      >
        <Animated.Text
          numberOfLines={1}
          style={[styles.labelText, { fontFamily: fonts.regular }, labelTextAnimatedStyle]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
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
  fillContent: {
    justifyContent: 'flex-start',
  },
  labelWrap: {
    position: 'absolute',
    left: 10,
    maxWidth: '90%',
    paddingHorizontal: 4,
  },
  labelText: {
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
