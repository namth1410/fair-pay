import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from './AppText';

interface TabItem {
  key: string;
  label: string;
  badge?: number;
  hidden?: boolean;
}

interface SectionTabsProps {
  items: TabItem[];
  selected: string;
  onSelect: (key: string) => void;
}

interface Layout {
  x: number;
  width: number;
}

export function SectionTabs({ items, selected, onSelect }: SectionTabsProps) {
  const c = useAppTheme();
  const layouts = useRef<Record<string, Layout>>({});
  const [initialized, setInitialized] = useState(false);

  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);

  const visible = items.filter((i) => !i.hidden);

  const updateIndicator = (key: string, animate = true) => {
    const l = layouts.current[key];
    if (!l) return;
    if (animate) {
      indicatorX.value = withSpring(l.x, { damping: 18, stiffness: 220 });
      indicatorW.value = withSpring(l.width, { damping: 18, stiffness: 220 });
    } else {
      indicatorX.value = l.x;
      indicatorW.value = l.width;
    }
  };

  useEffect(() => {
    if (initialized) updateIndicator(selected);
  }, [selected, initialized]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs} accessibilityRole="tablist">
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { backgroundColor: c.accentSoft, borderColor: c.primaryStrong },
            indicatorStyle,
          ]}
        />
        {visible.map((item) => {
          const isActive = item.key === selected;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={item.label}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                layouts.current[item.key] = { x, width };
                if (!initialized && item.key === selected) {
                  updateIndicator(selected, false);
                  setInitialized(true);
                }
              }}
              style={styles.tab}
            >
              <View style={styles.tabContent}>
                <AppText
                  variant="caption"
                  weight="semibold"
                  style={{ color: isActive ? c.primaryStrong : c.muted }}
                >
                  {item.label}
                </AppText>
                {item.badge !== undefined && item.badge > 0 && (
                  <View style={[styles.badge, { backgroundColor: c.danger }]}>
                    <AppText
                      weight="bold"
                      style={{ color: c.inverseForeground, fontSize: 10, lineHeight: 14 }}
                    >
                      {item.badge}
                    </AppText>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    alignSelf: 'flex-start',
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
