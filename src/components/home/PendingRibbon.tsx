import { X } from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui';

interface PendingRibbonProps {
  groupName: string;
  onDismiss: () => void;
}

export const PendingRibbon = memo(function PendingRibbon({
  groupName,
  onDismiss,
}: PendingRibbonProps) {
  const c = useAppTheme();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 1.8 }],
    opacity: 0.45 * (1 - pulse.value),
  }));

  return (
    <View style={styles.wrap}>
      {/* Left accent bar — distinct "alert ribbon" shape */}
      <View style={[styles.accent, { backgroundColor: c.warning }]} />

      {/* Body: paper-tinted with diagonal line pattern */}
      <View style={[styles.body, { backgroundColor: c.surfaceAlt }]}>
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
        >
          <Defs>
            <Pattern
              id="diag"
              x="0"
              y="0"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <Line
                x1="0"
                y1="8"
                x2="8"
                y2="0"
                stroke={c.warning}
                strokeWidth="0.6"
                opacity="0.16"
              />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#diag)" />
        </Svg>

        <View style={styles.content}>
          <View style={styles.pulseWrap}>
            <Animated.View
              style={[
                styles.pulseHalo,
                { backgroundColor: c.warning },
                haloStyle,
              ]}
            />
            <View style={[styles.pulseDot, { backgroundColor: c.warning }]} />
          </View>

          <View style={styles.textBlock}>
            <View style={styles.tagRow}>
              <AppText
                variant="meta"
                style={{
                  color: c.warning,
                  fontFamily: fonts.bold,
                  letterSpacing: 1.2,
                  fontSize: 10,
                }}
              >
                ĐANG CHỜ DUYỆT
              </AppText>
              <View style={[styles.tagDivider, { backgroundColor: c.divider }]} />
              <AppText
                variant="meta"
                style={{
                  color: c.muted,
                  fontFamily: fonts.medium,
                  letterSpacing: 0.4,
                  fontSize: 10,
                }}
              >
                BR·09
              </AppText>
            </View>
            <AppText
              variant="body"
              weight="semibold"
              numberOfLines={2}
              style={{ marginTop: 4 }}
            >
              Yêu cầu vào "{groupName}" đã được gửi
            </AppText>
          </View>

          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Đóng thông báo"
            hitSlop={10}
            style={({ pressed }) => [
              styles.close,
              { backgroundColor: pressed ? c.divider : 'transparent' },
            ]}
          >
            <X size={16} color={c.muted} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    minHeight: 60,
  },
  accent: {
    width: 4,
  },
  body: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  pulseWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseHalo: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagDivider: {
    width: 1,
    height: 10,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
