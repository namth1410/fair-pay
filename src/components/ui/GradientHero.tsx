import { useId } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface GradientHeroProps {
  fromColor: string;
  toColor: string;
  gradientDirection?: 'horizontal' | 'diagonal';
  children: React.ReactNode;
  style?: ViewStyle;
}

export function GradientHero({
  fromColor,
  toColor,
  gradientDirection = 'diagonal',
  children,
  style,
}: GradientHeroProps) {
  const gradId = `grad-${useId()}`;
  const isHorizontal = gradientDirection === 'horizontal';

  return (
    <View style={[styles.wrap, style]}>
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <Defs>
          <LinearGradient
            id={gradId}
            x1="0"
            y1="0"
            x2="1"
            y2={isHorizontal ? '0' : '1'}
          >
            <Stop offset="0%" stopColor={fromColor} />
            <Stop offset="100%" stopColor={toColor} />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${gradId})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
  },
});
