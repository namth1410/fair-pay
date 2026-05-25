import { CloudUpload, type LucideIcon, WifiOff } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useQueueStats } from '../../hooks/useQueueStats';
import { useAppStore } from '../../stores/app.store';
import { AppText } from '../ui/AppText';

/**
 * Banner top-of-screen hiển thị 2 trạng thái:
 *   1. Offline: cảnh báo + số mutation đang chờ sync
 *   2. Online + đang sync: hiện "Đang đồng bộ N thao tác" (subtle, primarySoft)
 *
 * Online + không có pending → height collapse về 0 (KHÔNG unmount) để tránh
 * layout shift cho content phía dưới. NetInfo subscription nằm ở
 * `initNetworkSync()` (src/utils/networkSync.ts) — banner thuần observer
 * đọc store.
 */

const ANIM_DURATION_MS = 180;
const VPAD = 6;

type BannerState = {
  message: string;
  bgKey: 'warning' | 'primarySoft';
  fgKey: 'inverseForeground' | 'foreground';
  Icon: LucideIcon;
  isOffline: boolean;
};

export function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const setBannerVisible = useAppStore((s) => s.setBannerVisible);
  const c = useAppTheme();
  const insets = useSafeAreaInsets();
  const { pendingCount } = useQueueStats();

  const state = useMemo<BannerState | null>(() => {
    if (!isOnline) {
      return {
        message:
          pendingCount > 0
            ? `Ngoại tuyến — ${pendingCount} thao tác chờ đồng bộ`
            : 'Ngoại tuyến — dữ liệu sẽ đồng bộ khi có mạng',
        bgKey: 'warning',
        fgKey: 'inverseForeground',
        Icon: WifiOff,
        isOffline: true,
      };
    }
    if (isSyncing || pendingCount > 0) {
      return {
        message: isSyncing
          ? `Đang đồng bộ${pendingCount > 0 ? ` ${pendingCount} thao tác` : '...'}`
          : `${pendingCount} thao tác chờ đồng bộ`,
        bgKey: 'primarySoft',
        fgKey: 'foreground',
        Icon: CloudUpload,
        isOffline: false,
      };
    }
    return null;
  }, [isOnline, isSyncing, pendingCount]);

  // Publish visibility cho screens consume: Home/header/sync-conflicts bỏ
  // `insets.top` redundant khi banner đã cover status bar area. Dùng `state`
  // (live, có thể null) — KHÔNG dùng `displayState` vì nó stuck ở giá trị
  // cuối cùng khi banner đang collapse, gây flag không bao giờ về false.
  useEffect(() => {
    setBannerVisible(state !== null);
  }, [state, setBannerVisible]);

  // Snapshot trạng thái visible cuối cùng để banner vẫn render đúng nội dung
  // trong lúc animate height về 0 — nếu clear ngay khi state=null sẽ banner
  // rỗng ngay lập tức, mất ý nghĩa hiệu ứng collapse.
  const [displayState, setDisplayState] = useState<BannerState | null>(null);
  useEffect(() => {
    if (state) setDisplayState(state);
  }, [state]);

  const [measuredHeight, setMeasuredHeight] = useState(0);
  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== measuredHeight) setMeasuredHeight(h);
  };

  const animatedHeight = useSharedValue(0);
  useEffect(() => {
    const target = state && measuredHeight > 0 ? measuredHeight : 0;
    animatedHeight.value = withTiming(target, {
      duration: ANIM_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [state, measuredHeight, animatedHeight]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));

  if (!displayState) return null;

  const { message, bgKey, fgKey, Icon, isOffline } = displayState;
  const backgroundColor = c[bgKey];
  const foregroundColor = c[fgKey];

  return (
    <Animated.View style={[styles.container, animatedContainerStyle]}>
      <View
        onLayout={onContentLayout}
        accessibilityRole={isOffline ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
        style={[
          styles.banner,
          {
            backgroundColor,
            paddingTop: insets.top + VPAD,
            paddingBottom: VPAD,
          },
        ]}
      >
        <Icon size={14} color={foregroundColor} strokeWidth={2.2} />
        <AppText variant="caption" weight="semibold" style={{ color: foregroundColor }}>
          {message}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
});
