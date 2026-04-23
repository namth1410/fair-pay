import { BlurMask, Canvas, Circle, Group, useClock } from '@shopify/react-native-skia';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface SkiaBreathingHaloProps {
  size?: number;
  colors: [string, string, string];
  /** Tap để pulse boost. */
  interactive?: boolean;
  children?: React.ReactNode;
}

export const SkiaBreathingHalo = memo(function SkiaBreathingHalo({
  size = 140,
  colors,
  interactive = false,
  children,
}: SkiaBreathingHaloProps) {
  const clock = useClock();
  const pulse = useSharedValue(0);

  const r0 = useDerivedValue(
    () => size * 0.29 + Math.sin(clock.value / 800) * 4 + pulse.value,
  );
  const r1 = useDerivedValue(
    () => size * 0.24 + Math.sin(clock.value / 900 + 2) * 4 + pulse.value,
  );
  const r2 = useDerivedValue(
    () => size * 0.31 + Math.sin(clock.value / 1000 + 4) * 4 + pulse.value,
  );

  const handlePress = () => {
    pulse.value = withSequence(
      withTiming(14, { duration: 140 }),
      withTiming(0, { duration: 320 }),
    );
  };

  const content = (
    <View style={[styles.stage, { width: size, height: size }]}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Group>
          <Circle cx={size * 0.3} cy={size * 0.41} r={r0} color={colors[0]} opacity={0.75}>
            <BlurMask blur={12} style="solid" />
          </Circle>
          <Circle cx={size * 0.7} cy={size * 0.36} r={r1} color={colors[1]} opacity={0.6}>
            <BlurMask blur={12} style="solid" />
          </Circle>
          <Circle cx={size * 0.5} cy={size * 0.68} r={r2} color={colors[2]} opacity={0.7}>
            <BlurMask blur={14} style="solid" />
          </Circle>
        </Group>
      </Canvas>
      {children ? <View style={styles.foreground}>{children}</View> : null}
    </View>
  );

  if (interactive) {
    return (
      <Pressable onPress={handlePress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }
  return content;
});

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  foreground: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
