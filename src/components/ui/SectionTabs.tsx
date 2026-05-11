import { useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useAnimationsEnabled } from '../../utils/userPreferences';
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
  /** Căn giữa khi tabs vừa trong container; vẫn scroll trái nếu tràn. Mặc định false (left-align). */
  centered?: boolean;
}

interface Layout {
  x: number;
  width: number;
}

export function SectionTabs({ items, selected, onSelect, centered = false }: SectionTabsProps) {
  const c = useAppTheme();
  const animationsEnabled = useAnimationsEnabled();
  const layouts = useRef<Record<string, Layout>>({});
  const scrollRef = useRef<ScrollView>(null);
  const viewportW = useRef(0);
  const [initialized, setInitialized] = useState(false);

  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);

  const visible = items.filter((i) => !i.hidden);

  const updateIndicator = (key: string, animate = true) => {
    const l = layouts.current[key];
    if (!l) return;
    if (animate && animationsEnabled) {
      indicatorX.value = withSpring(l.x, { damping: 22, stiffness: 420, mass: 0.6 });
      indicatorW.value = withSpring(l.width, { damping: 22, stiffness: 420, mass: 0.6 });
    } else {
      indicatorX.value = l.x;
      indicatorW.value = l.width;
    }
  };

  // Cuộn ngang sao cho tab đang chọn nằm gọn trong viewport — tránh
  // trường hợp tap "Số dư" mà label bị cắt do strip overflow.
  const scrollToTab = (key: string, animate = true) => {
    const l = layouts.current[key];
    const vw = viewportW.current;
    if (!l || vw === 0) return;
    const center = l.x + l.width / 2 - vw / 2;
    const maxScroll = Math.max(0, l.x + l.width - vw + 16);
    const target = Math.max(0, Math.min(maxScroll, center));
    scrollRef.current?.scrollTo({ x: target, y: 0, animated: animate && animationsEnabled });
  };

  useEffect(() => {
    if (initialized) {
      updateIndicator(selected);
      scrollToTab(selected);
    }
  }, [selected, initialized]);

  const onScrollLayout = (e: LayoutChangeEvent) => {
    viewportW.current = e.nativeEvent.layout.width;
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  return (
    <View style={styles.wrap} onLayout={onScrollLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          centered && styles.scrollContentCentered,
        ]}
      >
        <View
          style={[styles.tabs, centered && styles.tabsCentered]}
          accessibilityRole="tablist"
        >
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 10,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    alignSelf: 'flex-start',
    position: 'relative',
  },
  tabsCentered: {
    alignSelf: 'center',
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
