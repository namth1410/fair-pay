import {
  AlignCenterHorizontal,
  LayoutGrid,
  List,
  type LucideIcon,
} from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { hapticLight } from '../../utils/haptics';
import { type HomeViewMode,useAnimationsEnabled } from '../../utils/userPreferences';

interface HomeViewToggleProps {
  value: HomeViewMode;
  onChange: (mode: HomeViewMode) => void;
  modes?: HomeViewMode[];
}

const ICONS: Record<HomeViewMode, LucideIcon> = {
  list: List,
  carousel: LayoutGrid,
  arc: AlignCenterHorizontal,
};

const LABELS: Record<HomeViewMode, string> = {
  list: 'Danh sách',
  carousel: 'Carousel',
  arc: 'Arc dọc',
};

const ITEM_SIZE = 30;
const GAP = 2;

export const HomeViewToggle = memo(function HomeViewToggle({
  value,
  onChange,
  modes = ['arc', 'carousel', 'list'],
}: HomeViewToggleProps) {
  const c = useAppTheme();
  const animationsEnabled = useAnimationsEnabled();
  const activeIndex = Math.max(0, modes.indexOf(value));
  const indicator = useSharedValue(activeIndex);

  useEffect(() => {
    if (animationsEnabled) {
      indicator.value = withSpring(activeIndex, { damping: 18, stiffness: 220 });
    } else {
      indicator.value = withTiming(activeIndex, { duration: 0 });
    }
  }, [activeIndex, animationsEnabled, indicator]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicator.value * (ITEM_SIZE + GAP) }],
  }));

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: c.surfaceAlt, borderColor: c.divider },
      ]}
      accessibilityRole="radiogroup"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          { backgroundColor: c.primarySoft, borderColor: c.primary },
          indicatorStyle,
        ]}
      />
      {modes.map((mode) => {
        const Icon = ICONS[mode];
        const active = mode === value;
        return (
          <Pressable
            key={mode}
            onPress={() => {
              if (mode !== value) {
                hapticLight();
                onChange(mode);
              }
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={LABELS[mode]}
            style={styles.item}
            hitSlop={6}
          >
            <Icon
              size={15}
              strokeWidth={2.2}
              color={active ? c.primaryStrong : c.muted}
            />
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    borderRadius: 999,
    borderWidth: 1,
    gap: GAP,
    position: 'relative',
  },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  indicator: {
    position: 'absolute',
    left: 2,
    top: 2,
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 999,
    borderWidth: 1,
  },
});
