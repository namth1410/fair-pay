import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface CarouselDotsProps {
  count: number;
  currentIndex: number;
  activeColor: string;
  baseColor: string;
  orientation?: 'horizontal' | 'vertical';
}

const DOT_SIZE = 6;
const ACTIVE_LENGTH = 22;
const GAP = 6;

const Dot = memo(function Dot({
  index,
  currentIndex,
  baseColor,
  activeColor,
  orientation,
}: {
  index: number;
  currentIndex: number;
  baseColor: string;
  activeColor: string;
  orientation: 'horizontal' | 'vertical';
}) {
  const t = useSharedValue(index === currentIndex ? 1 : 0);

  useEffect(() => {
    t.value = withSpring(index === currentIndex ? 1 : 0, {
      damping: 16,
      stiffness: 220,
    });
  }, [index, currentIndex, t]);

  const dotStyle = useAnimatedStyle(() => {
    const length = DOT_SIZE + t.value * (ACTIVE_LENGTH - DOT_SIZE);
    return {
      width: orientation === 'horizontal' ? length : DOT_SIZE,
      height: orientation === 'horizontal' ? DOT_SIZE : length,
      opacity: 0.45 + t.value * 0.55,
    };
  });

  const fillStyle = useAnimatedStyle(() => ({ opacity: t.value }));

  return (
    <Animated.View style={[styles.dot, { backgroundColor: baseColor }, dotStyle]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: activeColor, borderRadius: DOT_SIZE / 2 },
          fillStyle,
        ]}
      />
    </Animated.View>
  );
});

export const CarouselDots = memo(function CarouselDots({
  count,
  currentIndex,
  activeColor,
  baseColor,
  orientation = 'horizontal',
}: CarouselDotsProps) {
  if (count <= 1) return null;
  return (
    <View
      style={orientation === 'horizontal' ? styles.row : styles.col}
      accessibilityRole="tablist"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Dot
          key={i}
          index={i}
          currentIndex={currentIndex}
          baseColor={baseColor}
          activeColor={activeColor}
          orientation={orientation}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: GAP,
  },
  col: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: GAP,
  },
  dot: {
    borderRadius: DOT_SIZE / 2,
    overflow: 'hidden',
  },
});
