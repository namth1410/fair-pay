import { router, usePathname } from 'expo-router';
import Bell from 'lucide-react-native/dist/esm/icons/bell';
import MessagesSquare from 'lucide-react-native/dist/esm/icons/messages-square';
import Plus from 'lucide-react-native/dist/esm/icons/plus';
import UserRound from 'lucide-react-native/dist/esm/icons/user-round';
import Zap from 'lucide-react-native/dist/esm/icons/zap';
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

// Thanh tab kiểu app nhắn tin (giao diện "Hội thoại" 2026-10): phẳng, full-width,
// hairline phía trên, icon + nhãn; nút "+" tròn màu thương hiệu ở giữa.
// Layout: [Nhóm] [Preset] [+] [Thông báo] [Cài đặt]
const BAR_HEIGHT = 58;
const FAB_SIZE = 50;

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

  let unreadBadge: string | null = null;
  if (unread > 9) unreadBadge = '9+';
  else if (unread > 0) unreadBadge = String(unread);

  // Thanh tab luôn hiện ở các tab chính, chỉ ẩn khi keyboard mở.
  const visible = !keyboardOpen;
  const bottomPad = Math.max(insets.bottom, 8);

  const activeIndex = useMemo(() => pathToActiveIndex(pathname), [pathname]);

  const translateY = useSharedValue(0);
  const fabRotation = useSharedValue(0);

  useEffect(() => {
    const target = visible ? 0 : BAR_HEIGHT + bottomPad + 8;
    if (useAnim) {
      translateY.value = withSpring(target, {
        damping: 22,
        stiffness: 180,
        mass: 0.9,
      });
    } else {
      translateY.value = target;
    }
  }, [visible, useAnim, translateY, bottomPad]);

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

  const barAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

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

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: c.surface,
          borderTopColor: c.divider,
          paddingBottom: bottomPad,
        },
        barAnimatedStyle,
      ]}
    >
      <DockNavItem
        Icon={MessagesSquare}
        label="Nhóm"
        isActive={activeIndex === NAV_INDEX_HOME}
        accessibilityLabel="Nhóm của bạn"
        onPress={() => navigateTo('/')}
      />

      <DockNavItem
        Icon={Zap}
        label="Preset"
        isActive={activeIndex === NAV_INDEX_PRESETS}
        accessibilityLabel="Preset khoản chi"
        onPress={() => navigateTo('/presets')}
      />

      <View style={styles.fabSlot}>
        <Pressable
          onPress={handlePlus}
          accessibilityRole="button"
          accessibilityLabel="Thêm khoản chi mới"
          accessibilityState={{ expanded: isPlusActive }}
          hitSlop={6}
          android_ripple={{
            color: c.primarySoft,
            borderless: true,
            radius: FAB_SIZE / 2,
          }}
        >
          <Animated.View
            style={[styles.fab, { backgroundColor: c.primary }, fabAnimatedStyle]}
          >
            <Plus size={26} color={c.inverseForeground} strokeWidth={2.4} />
          </Animated.View>
        </Pressable>
      </View>

      <DockNavItem
        Icon={Bell}
        label="Thông báo"
        isActive={activeIndex === NAV_INDEX_NOTIF}
        accessibilityLabel={`Thông báo${unread > 0 ? `, ${unread} chưa đọc` : ''}`}
        onPress={() => navigateTo('/notifications')}
        badge={unreadBadge}
      />

      <DockNavItem
        Icon={UserRound}
        label="Cài đặt"
        isActive={activeIndex === NAV_INDEX_SETTINGS}
        accessibilityLabel="Cài đặt"
        onPress={() => navigateTo('/settings')}
      />
    </Animated.View>
  );
}

interface DockNavItemProps {
  Icon: typeof Bell;
  label: string;
  isActive: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  badge?: string | null;
}

function DockNavItem({
  Icon,
  label,
  isActive,
  accessibilityLabel,
  onPress,
  badge,
}: DockNavItemProps) {
  const c = useAppTheme();
  const scale = useSharedValue(1);
  const animationsEnabled = useAnimationsEnabled();
  const color = isActive ? c.primary : c.muted;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    if (animationsEnabled) {
      scale.value = withSpring(0.92, { damping: 14, stiffness: 320 });
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
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isActive }}
      style={styles.navItem}
    >
      <Animated.View style={[styles.navItemInner, animatedStyle]}>
        <View>
          <Icon size={22} color={color} strokeWidth={isActive ? 2.3 : 1.9} />
          {badge ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: c.danger, borderColor: c.surface },
              ]}
            >
              <AppText
                variant="meta"
                weight="bold"
                style={[styles.badgeText, { color: c.isDark ? c.background : '#FFFFFF' }]}
              >
                {badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText
          variant="meta"
          weight={isActive ? 'bold' : 'medium'}
          numberOfLines={1}
          style={[styles.label, { color }]}
        >
          {label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navItem: {
    flex: 1,
    height: BAR_HEIGHT - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
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
