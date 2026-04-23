import {
  Canvas,
  LinearGradient,
  RoundedRect,
  useClock,
} from '@shopify/react-native-skia';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

interface SkiaShimmerCardProps {
  width: number;
  height: number;
  borderRadius?: number;
  baseColor: string;
  highlightColor: string;
  /** Độ rộng dải sáng (px). Default 140. */
  highlightWidth?: number;
  /** Chu kỳ chạy (ms). Default 1600. */
  period?: number;
}

export const SkiaShimmerCard = memo(function SkiaShimmerCard({
  width,
  height,
  borderRadius = 14,
  baseColor,
  highlightColor,
  highlightWidth = 140,
  period = 1600,
}: SkiaShimmerCardProps) {
  const clock = useClock();

  const start = useDerivedValue(() => {
    const span = width + highlightWidth * 2;
    const t = (clock.value % period) / period;
    const x = -highlightWidth + t * span;
    return { x, y: 0 };
  });

  const end = useDerivedValue(() => {
    const span = width + highlightWidth * 2;
    const t = (clock.value % period) / period;
    const x = -highlightWidth + t * span + highlightWidth;
    return { x, y: 0 };
  });

  return (
    <View style={[styles.wrap, { width, height, borderRadius }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <RoundedRect x={0} y={0} width={width} height={height} r={borderRadius} color={baseColor} />
        <RoundedRect x={0} y={0} width={width} height={height} r={borderRadius}>
          <LinearGradient
            start={start}
            end={end}
            colors={['transparent', highlightColor, 'transparent']}
          />
        </RoundedRect>
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
