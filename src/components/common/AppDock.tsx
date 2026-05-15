import { BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { Bell, Bookmark, Home, Plus, Settings } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useNotificationStore } from '../../stores/notification.store';
import { hapticLight } from '../../utils/haptics';
import { useAnimationsEnabled } from '../../utils/userPreferences';
import { AppText } from '../ui/AppText';

const ITEM_SIZE = 44;
const FAB_SIZE = 56;
const PILL_HEIGHT = 64;
const PILL_PADDING_H = 12;
const ITEM_GAP = 8;
const INDICATOR_SIZE = 38;

// Layout: [Home] [Presets] [FAB] [Notif] [Settings]
// 4 nav items + 1 FAB ở giữa; 4 gaps giữa 5 elements.
const PILL_WIDTH =
  PILL_PADDING_H * 2 + ITEM_SIZE * 4 + FAB_SIZE + ITEM_GAP * 4;

const NAV_INDEX_HOME = 0;
const NAV_INDEX_PRESETS = 1;
const NAV_INDEX_NOTIF = 2;
const NAV_INDEX_SETTINGS = 3;

function pathToActiveIndex(pathname: string): number {
  if (pathname === '/' || pathname === '') return NAV_INDEX_HOME;
  if (pathname === '/presets') return NAV_INDEX_PRESETS;
  if (pathname === '/notifications') return NAV_INDEX_NOTIF;
  if (pathname === '/settings') return NAV_INDEX_SETTINGS;
  return -1;
}

// Center x của 4 nav slots (skip FAB). Tính tuần tự từ trái:
// Home → Presets → [FAB] → Notif → Settings
const ITEM_CENTERS_REL = (() => {
  const home = PILL_PADDING_H + ITEM_SIZE / 2;
  const presets = home + ITEM_SIZE / 2 + ITEM_GAP + ITEM_SIZE / 2;
  const fabCenter = presets + ITEM_SIZE / 2 + ITEM_GAP + FAB_SIZE / 2;
  const notif = fabCenter + FAB_SIZE / 2 + ITEM_GAP + ITEM_SIZE / 2;
  const settings = notif + ITEM_SIZE / 2 + ITEM_GAP + ITEM_SIZE / 2;
  return [home, presets, notif, settings];
})();

const INDICATOR_OFFSETS = ITEM_CENTERS_REL.map((x) => x - INDICATOR_SIZE / 2);

interface AppDockProps {
  onPlusPress: () => void;
  isPlusActive?: boolean;
}

export function AppDock({ onPlusPress, isPlusActive = false }: AppDockProps) {
  const c = useAppTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const animationsEnabled = useAnimationsEnabled();
  const unread = useNotificationStore((s) => s.unreadCount);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (v) => setReduceMotion(v),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const useAnim = animationsEnabled && !reduceMotion;

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () =>
      setKeyboardOpen(true),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setKeyboardOpen(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Dock luôn hiển thị ở mọi route, chỉ ẩn khi keyboard mở.
  const visible = !keyboardOpen;

  const activeIndex = useMemo(() => pathToActiveIndex(pathname), [pathname]);

  const translateY = useSharedValue(0);
  const fabRotation = useSharedValue(0);
  const indicatorIndex = useSharedValue(activeIndex);

  useEffect(() => {
    const target = visible ? 0 : PILL_HEIGHT + insets.bottom + 32;
    if (useAnim) {
      translateY.value = withSpring(target, {
        damping: 22,
        stiffness: 180,
        mass: 0.9,
      });
    } else {
      translateY.value = target;
    }
  }, [visible, useAnim, translateY, insets.bottom]);

  useEffect(() => {
    if (activeIndex < 0) return;
    if (useAnim) {
      indicatorIndex.value = withSpring(activeIndex, {
        damping: 20,
        stiffness: 180,
        mass: 0.8,
        overshootClamping: false,
      });
    } else {
      indicatorIndex.value = activeIndex;
    }
  }, [activeIndex, useAnim, indicatorIndex]);

  useEffect(() => {
    const target = isPlusActive ? 1 : 0;
    if (useAnim) {
      fabRotation.value = withSpring(target, {
        damping: 14,
        stiffness: 220,
        mass: 0.6,
      });
    } else {
      fabRotation.value = target;
    }
  }, [isPlusActive, useAnim, fabRotation]);

  const dockAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const indicatorAnimatedStyle = useAnimatedStyle(() => {
    const x = interpolate(
      indicatorIndex.value,
      [
        NAV_INDEX_HOME,
        NAV_INDEX_PRESETS,
        NAV_INDEX_NOTIF,
        NAV_INDEX_SETTINGS,
      ],
      INDICATOR_OFFSETS,
    );
    return {
      opacity: activeIndex < 0 ? 0 : 1,
      transform: [{ translateX: x }],
    };
  });

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${fabRotation.value * 45}deg` }],
  }));

  const navigateTo = (path: string) => {
    if (pathname === path) return;
    hapticLight();
    // navigate: tab-aware navigation. Tabs giữ screens mounted, switching
    // chỉ swap visible view. Reanimated tab navigator handle smooth slide
    // (jumpMode="smooth") → jump xa không lướt qua tab giữa.
    router.navigate(path as never);
  };

  const handlePlus = () => {
    hapticLight();
    onPlusPress();
  };

  // Glass: BlurView làm phần frosted; overlay rất nhạt chỉ để tăng tương phản
  // icon, KHÔNG đè lấp blur. Alpha thấp = thấy rõ blur của nội dung bên dưới.
  const dockOverlay = c.isDark
    ? 'rgba(28,28,32,0.18)'
    : 'rgba(255,255,255,0.22)';
  const dockBorderColor = c.isDark
    ? 'rgba(255,255,255,0.16)'
    : 'rgba(255,255,255,0.45)';
  const indicatorBg = c.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';
  const fabBg = c.primary;
  const fabFg = c.inverseForeground;
  const iconColor = c.foreground;
  const inactiveIconColor = c.muted;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: insets.bottom + 16 }]}
    >
      <Animated.View
        style={[
          styles.pill,
          {
            shadowColor: c.isDark ? '#000' : '#1A1A1F',
            borderColor: dockBorderColor,
          },
          dockAnimatedStyle,
        ]}
      >
        <BlurView
          intensity={100}
          tint={c.isDark ? 'dark' : 'light'}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={1}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: dockOverlay },
          ]}
        />

        <Animated.View
          style={[
            styles.indicator,
            { backgroundColor: indicatorBg },
            indicatorAnimatedStyle,
          ]}
          pointerEvents="none"
        />

        <DockNavItem
          Icon={Home}
          isActive={activeIndex === NAV_INDEX_HOME}
          color={
            activeIndex === NAV_INDEX_HOME ? iconColor : inactiveIconColor
          }
          accessibilityLabel="Trang chủ"
          onPress={() => navigateTo('/')}
        />

        <DockNavItem
          Icon={Bookmark}
          isActive={activeIndex === NAV_INDEX_PRESETS}
          color={
            activeIndex === NAV_INDEX_PRESETS ? iconColor : inactiveIconColor
          }
          accessibilityLabel="Preset khoản chi"
          onPress={() => navigateTo('/presets')}
        />

        <Pressable
          onPress={handlePlus}
          accessibilityRole="button"
          accessibilityLabel="Thêm khoản chi mới"
          accessibilityState={{ expanded: isPlusActive }}
          style={styles.fabPressable}
          android_ripple={{
            color: c.divider,
            borderless: true,
            radius: FAB_SIZE / 2,
          }}
        >
          <Animated.View
            style={[
              styles.fab,
              {
                backgroundColor: fabBg,
                shadowColor: c.isDark ? '#000' : c.primary,
              },
              fabAnimatedStyle,
            ]}
          >
            <Plus size={28} color={fabFg} strokeWidth={2.4} />
          </Animated.View>
        </Pressable>

        <DockNavItem
          Icon={Bell}
          isActive={activeIndex === NAV_INDEX_NOTIF}
          color={
            activeIndex === NAV_INDEX_NOTIF ? iconColor : inactiveIconColor
          }
          accessibilityLabel={`Thông báo${unread > 0 ? `, ${unread} chưa đọc` : ''}`}
          onPress={() => navigateTo('/notifications')}
          badge={unread > 0 ? (unread > 9 ? '9+' : String(unread)) : null}
          badgeBg={c.danger}
          badgeBorder={c.background}
        />

        <DockNavItem
          Icon={Settings}
          isActive={activeIndex === NAV_INDEX_SETTINGS}
          color={
            activeIndex === NAV_INDEX_SETTINGS ? iconColor : inactiveIconColor
          }
          accessibilityLabel="Cài đặt"
          onPress={() => navigateTo('/settings')}
        />
      </Animated.View>
    </View>
  );
}

interface DockNavItemProps {
  Icon: typeof Home;
  isActive: boolean;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
  badge?: string | null;
  badgeBg?: string;
  badgeBorder?: string;
}

function DockNavItem({
  Icon,
  isActive,
  color,
  accessibilityLabel,
  onPress,
  badge,
  badgeBg,
  badgeBorder,
}: DockNavItemProps) {
  const scale = useSharedValue(1);
  const animationsEnabled = useAnimationsEnabled();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    if (animationsEnabled) {
      scale.value = withSpring(0.9, { damping: 14, stiffness: 320 });
    }
  };
  const onPressOut = () => {
    if (animationsEnabled) {
      scale.value = withSpring(1, { damping: 12, stiffness: 240 });
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isActive }}
      style={styles.navItemPressable}
      hitSlop={6}
    >
      <Animated.View style={[styles.navItemInner, animatedStyle]}>
        <Icon size={22} color={color} strokeWidth={isActive ? 2.4 : 1.9} />
        {badge && badgeBg && badgeBorder ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: badgeBg, borderColor: badgeBorder },
            ]}
          >
            <AppText
              variant="meta"
              weight="bold"
              tone="inverse"
              style={styles.badgeText}
            >
              {badge}
            </AppText>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pill: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PILL_PADDING_H,
    gap: ITEM_GAP,
    borderWidth: StyleSheet.hairlineWidth,
    // overflow:hidden để clip BlurView/overlay theo bo tròn. Trên Android,
    // elevation shadow vẫn render bên ngoài nên không bị mất.
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  indicator: {
    position: 'absolute',
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    top: (PILL_HEIGHT - INDICATOR_SIZE) / 2,
    left: 0,
  },
  navItemPressable: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemInner: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressable: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 8,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeText: {
    fontSize: 9,
    lineHeight: 11,
  },
});
