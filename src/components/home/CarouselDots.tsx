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
}

const DOT_SIZE = 6;
const ACTIVE_WIDTH = 22;
const GAP = 6;

const Dot = memo(function Dot({
  index,
  currentIndex,
  baseColor,
  activeColor,
}: {
  index: number;
  currentIndex: number;
  baseColor: string;
  activeColor: string;
}) {
  const t = useSharedValue(index === currentIndex ? 1 : 0);

  useEffect(() => {
    t.value = withSpring(index === currentIndex ? 1 : 0, {
      damping: 16,
      stiffness: 220,
    });
  }, [index, currentIndex, t]);

  const dotStyle = useAnimatedStyle(() => ({
    width: DOT_SIZE + t.value * (ACTIVE_WIDTH - DOT_SIZE),
    opacity: 0.45 + t.value * 0.55,
  }));

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
}: CarouselDotsProps) {
  if (count <= 1) return null;
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {Array.from({ length: count }).map((_, i) => (
        <Dot
          key={i}
          index={i}
          currentIndex={currentIndex}
          baseColor={baseColor}
          activeColor={activeColor}
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
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    overflow: 'hidden',
  },
});
