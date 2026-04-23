import {
  BlurMask,
  Canvas,
  Path,
  Skia,
  usePathValue,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { AppText } from '../AppText';

export type BalanceRingTone = 'positive' | 'negative' | 'neutral';

interface SkiaBalanceRingProps {
  size?: number;
  thickness?: number;
  /** 0..1 */
  progress: number;
  tone?: BalanceRingTone;
  label?: string;
  duration?: number;
}

export const SkiaBalanceRing = memo(function SkiaBalanceRing({
  size = 120,
  thickness = 10,
  progress,
  tone = 'neutral',
  label,
  duration = 900,
}: SkiaBalanceRingProps) {
  const c = useAppTheme();

  const ringColorByTone: Record<BalanceRingTone, string> = {
    positive: c.success,
    negative: c.danger,
    neutral: c.primaryStrong,
  };
  const ringColor = ringColorByTone[tone];
  const trackColor = c.divider;

  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const animProgress = useSharedValue(0);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, progress));
    animProgress.value = withTiming(clamped, { duration });
  }, [progress, duration, animProgress]);

  const trackPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc(
      { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 },
      0,
      360,
    );
    return p;
  }, [cx, cy, radius]);

  const progressPath = usePathValue((p) => {
    'worklet';
    p.reset();
    const sweep = 360 * animProgress.value;
    if (sweep <= 0) return;
    p.addArc(
      { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 },
      -90,
      sweep,
    );
  });

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path
          path={trackPath}
          style="stroke"
          strokeWidth={thickness}
          strokeCap="round"
          color={trackColor}
        />
        <Path
          path={progressPath}
          style="stroke"
          strokeWidth={thickness}
          strokeCap="round"
          color={ringColor}
        >
          <BlurMask blur={8} style="solid" />
        </Path>
      </Canvas>
      {label ? (
        <View style={styles.labelWrap} pointerEvents="none">
          <AppText variant="subtitle" weight="semibold" center>
            {label}
          </AppText>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
