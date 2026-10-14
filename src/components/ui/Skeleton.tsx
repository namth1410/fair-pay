import { createContext, type ReactNode, useContext, useEffect } from 'react';
import {
  type DimensionValue,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useAnimationsEnabled } from '../../utils/userPreferences';

// Skeleton cho giao diện "Hội thoại" (2026-10): khối bo tròn nhấp nháy nhẹ bằng opacity,
// dựng đúng hình học từng màn để lúc data về không nhảy layout. Chỉ các khối (Bone) nhấp
// nháy — khung (nền banner, đường kẻ dòng) đứng yên.
// KHÔNG dùng Skeleton của heroui-native: nó gắn layout animation entering/exiting
// (FadeIn/FadeOut) — loại từng crash bản release trên OPPO/ColorOS — và lúc unmount còn
// mờ dần đè lên nội dung thật.

const PulseContext = createContext<SharedValue<number> | null>(null);

interface SkeletonPulseProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Gốc của một màn skeleton: 1 nhịp chung cho mọi Bone bên trong. Lồng nhau thì dùng lại
 * nhịp của gốc ngoài cùng. Tắt "Hiệu ứng chuyển động" / giảm chuyển động → khối đứng yên.
 */
export function SkeletonPulse({ children, style }: SkeletonPulseProps) {
  const parent = useContext(PulseContext);
  const progress = useSharedValue(0);
  const animationsEnabled = useAnimationsEnabled();
  const reduceMotion = useReducedMotion();
  const animate = !parent && animationsEnabled && !reduceMotion;

  useEffect(() => {
    if (!animate) return;
    progress.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(progress);
  }, [animate, progress]);

  if (parent) return <View style={style}>{children}</View>;

  return (
    <PulseContext.Provider value={progress}>
      <View
        style={style}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Đang tải"
        accessibilityState={{ busy: true }}
      >
        {children}
      </View>
    </PulseContext.Provider>
  );
}

interface BoneProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
  /** Màu khối — mặc định divider; trên nền màu (banner xanh) truyền màu hợp nền. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Một khối placeholder. Đặt trong SkeletonPulse để nhấp nháy. */
export function Bone({ width = '100%', height, radius = 6, color, style }: BoneProps) {
  const c = useAppTheme();
  const progress = useContext(PulseContext);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: progress ? 1 - progress.value * 0.5 : 1,
  }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: color ?? c.divider },
        style,
        pulseStyle,
      ]}
    />
  );
}

const TITLE_WIDTHS: DimensionValue[] = ['58%', '42%', '66%', '50%', '36%'];
const SUB_WIDTHS: DimensionValue[] = ['34%', '46%', '28%', '40%', '52%'];

interface RowsSkeletonProps {
  count?: number;
  /** Khối đầu dòng: avatar tròn (nhóm, thông báo) hay ô bo góc (preset, chuyến đi). */
  leading?: 'circle' | 'tile';
  leadingSize?: number;
  minHeight?: number;
}

/**
 * Danh sách dòng kiểu app nhắn tin (GroupChatRow, NotificationRow, dòng preset/chuyến đi):
 * khối đầu + 2 dòng chữ + đường kẻ mảnh thụt lề theo phần chữ.
 */
export function RowsSkeleton({
  count = 6,
  leading = 'circle',
  leadingSize = 54,
  minHeight = 76,
}: RowsSkeletonProps) {
  const c = useAppTheme();
  return (
    <SkeletonPulse>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, { minHeight }]}>
          <Bone
            width={leadingSize}
            height={leadingSize}
            radius={leading === 'circle' ? leadingSize / 2 : 18}
          />
          <View style={[styles.rowBody, { borderBottomColor: c.divider }]}>
            <Bone width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} height={14} />
            <Bone width={SUB_WIDTHS[i % SUB_WIDTHS.length]} height={11} />
          </View>
        </View>
      ))}
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
  },
  rowBody: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 13,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
