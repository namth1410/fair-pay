import WifiOff from 'lucide-react-native/dist/esm/icons/wifi-off';
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
import { useAppStore } from '../../stores/app.store';
import { AppText } from '../ui/AppText';

/**
 * Banner top-of-screen — chỉ hiện 1 trạng thái duy nhất: offline.
 *
 * Online (kể cả khi đang sync hoặc còn pending) → height collapse về 0
 * (KHÔNG unmount) để tránh layout shift. User low-tech không cần biết
 * sync mechanism — chỉ cần biết khi mất mạng. Conflict flow do
 * ConflictResolverModal + Settings badge xử lý riêng.
 *
 * NetInfo subscription nằm ở `initNetworkSync()`
 * (src/utils/networkSync.ts) — banner thuần observer đọc store.
 */

const ANIM_DURATION_MS = 180;
const VPAD = 6;

type BannerState = {
  message: string;
};

export function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline);
  const setBannerVisible = useAppStore((s) => s.setBannerVisible);
  const c = useAppTheme();
  const insets = useSafeAreaInsets();

  const state = useMemo<BannerState | null>(() => {
    if (!isOnline) {
      return { message: 'Ngoại tuyến' };
    }
    return null;
  }, [isOnline]);

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

  const { message } = displayState;
  const backgroundColor = c.warning;
  const foregroundColor = c.inverseForeground;

  return (
    <Animated.View style={[styles.container, animatedContainerStyle]}>
      <View
        onLayout={onContentLayout}
        accessibilityRole="alert"
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
        <WifiOff size={14} color={foregroundColor} strokeWidth={2.2} />
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
