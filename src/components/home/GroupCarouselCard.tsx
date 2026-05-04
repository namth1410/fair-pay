import {
  Blur,
  Canvas,
  Image as SkiaImage,
  useImage,
} from '@shopify/react-native-skia';
import { ChevronRight, Users } from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { hapticLight } from '../../utils/haptics';
import { getInitials, pickHeroGradient } from '../../utils/seedGradient';
import { useAnimationsEnabled } from '../../utils/userPreferences';
import { AppText, Money } from '../ui';

interface GroupCarouselCardProps {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  balance: number;
  /** This card's absolute index in the groups list. */
  absoluteIndex: number;
  /** Total number of cards — used for modular wrap math. */
  total: number;
  /**
   * Currently active card index — SharedValue, mutated on UI thread. May be
   * negative or larger than `total - 1`; reduced via modulo at read time so
   * the stack loops infinitely.
   */
  topIndex: SharedValue<number>;
  /** Pan drag offset of the top card. Inactive cards interpolate against this. */
  dragX: SharedValue<number>;
  cardWidth: number;
  cardHeight: number;
  /** Used as the off-screen distance for swipe-out. */
  screenWidth: number;
  onPressActive: () => void;
}

interface BalanceTone {
  toneColor: string;
  toneSoft: string;
  directionLabel: string;
  moneyTone: 'success' | 'danger' | undefined;
  isSettled: boolean;
}

function getBalanceTone(
  balance: number,
  c: ReturnType<typeof useAppTheme>,
): BalanceTone {
  if (balance === 0) {
    return {
      toneColor: c.muted,
      toneSoft: c.divider,
      directionLabel: 'cân bằng',
      moneyTone: undefined,
      isSettled: true,
    };
  }
  if (balance > 0) {
    return {
      toneColor: c.success,
      toneSoft: c.successSoft,
      directionLabel: 'được nhận',
      moneyTone: 'success',
      isSettled: false,
    };
  }
  return {
    toneColor: c.danger,
    toneSoft: c.dangerSoft,
    directionLabel: 'cần trả',
    moneyTone: 'danger',
    isSettled: false,
  };
}

const SHINE_WIDTH = 80;
const CARD_PAD = 14;
const CARD_RADIUS = 24;
const IMAGE_RADIUS = 16;

export const GroupCarouselCard = memo(function GroupCarouselCard({
  id,
  name,
  avatarUrl,
  memberCount,
  balance,
  absoluteIndex,
  total,
  topIndex,
  dragX,
  cardWidth,
  cardHeight,
  screenWidth,
  onPressActive,
}: GroupCarouselCardProps) {
  const c = useAppTheme();
  const animationsEnabled = useAnimationsEnabled();
  const tone = getBalanceTone(balance, c);
  const heroFallback = pickHeroGradient(id);
  // Bg "color-spill" như YouTube/Spotify: dùng CHÍNH ảnh blur cực mạnh thay vì
  // 1 màu trung bình. Spatial color (vùng nào ảnh đậm thì bg vùng đó đậm) tự
  // động theo image, không cần extract dominant.
  const skiaBg = useImage(avatarUrl ?? null);

  // Image inset: padding xung quanh, borderRadius nhỏ hơn card. Avatar luôn
  // square ở upload (aspect [1,1]) nên `cover` fit khít, không crop.
  const initials = getInitials(name || id);
  const imageSize = cardWidth - CARD_PAD * 2;

  const pressed = useSharedValue(0);

  // Modular relative position in the stack:
  //   0      = top
  //   1, 2   = behind, peeking
  //   -1     = previous card (peeks in from left during back-swipe)
  //   else   = hidden (deeper in stack or already swiped past)
  // The list cycles: with N cards, swiping forward from the last brings #0 to
  // the top again; swiping back from #0 reveals the last card.
  const rel = useDerivedValue(() => {
    const N = total;
    if (N <= 1) return 0;
    const T = topIndex.value;
    // Positive modulo so negative T also normalizes correctly.
    const raw = (((absoluteIndex - T) % N) + N) % N;
    // Last slot is shown as the "prev" peek when there are at least 3 cards.
    if (N >= 3 && raw === N - 1) return -1;
    return raw;
  });

  // True when this card is the front-most (and not being dragged off too far) —
  // gates the shine sweep + decides which card receives taps.
  const isCentered = useDerivedValue(
    () => rel.value === 0 && Math.abs(dragX.value) < 60,
  );

  const wrapperStyle = useAnimatedStyle(() => {
    const r = rel.value;
    const dx = dragX.value;
    const W = screenWidth;
    const press = 1 - 0.025 * pressed.value;

    if (r === 0) {
      const rotZ = (dx / W) * 8;
      const absProgress = Math.min(1, Math.abs(dx) / W);
      return {
        opacity: 1 - absProgress * 0.15,
        zIndex: 30,
        transform: [
          { translateX: dx },
          { translateY: 0 },
          { rotate: `${rotZ}deg` },
          { scale: 1 * press },
        ],
      };
    }
    if (r === 1) {
      const promote = Math.max(0, -dx) / W;
      const scale = 0.94 + promote * 0.06;
      const translateY = 16 - promote * 16;
      return {
        opacity: 1,
        zIndex: 20,
        transform: [{ translateY }, { scale }],
      };
    }
    if (r === 2) {
      const promote = Math.max(0, -dx) / W;
      const scale = 0.88 + promote * 0.06;
      const translateY = 32 - promote * 16;
      return {
        opacity: 0.8 + promote * 0.2,
        zIndex: 10,
        transform: [{ translateY }, { scale }],
      };
    }
    if (r === -1) {
      const promote = Math.max(0, dx) / W;
      const tx = -W * 0.9 + promote * (W * 0.9);
      const rotZ = -8 + promote * 8;
      return {
        opacity: promote,
        zIndex: 31,
        transform: [
          { translateX: tx },
          { rotate: `${rotZ}deg` },
          { scale: 1 },
        ],
      };
    }
    if (r > 2) {
      return {
        opacity: 0,
        zIndex: 0,
        transform: [{ translateY: 32 }, { scale: 0.88 }],
      };
    }
    return {
      opacity: 0,
      zIndex: 0,
      transform: [{ translateX: -W * 1.2 }, { scale: 1 }],
    };
  });

  // Money parallax — opposite direction, polish nhẹ trên top card.
  const moneyParallaxStyle = useAnimatedStyle(() => {
    if (!animationsEnabled) return { transform: [{ translateX: 0 }] };
    if (rel.value !== 0) return { transform: [{ translateX: 0 }] };
    const tx = (dragX.value / screenWidth) * 18;
    return { transform: [{ translateX: tx }] };
  });

  const shine = useSharedValue(0);
  useEffect(() => {
    if (!animationsEnabled) {
      shine.value = 0;
      return;
    }
    shine.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 700 }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
  }, [shine, animationsEnabled]);

  const shineStyle = useAnimatedStyle(() => {
    const visible = isCentered.value && animationsEnabled ? 1 : 0;
    const start = -SHINE_WIDTH * 1.6;
    const end = cardWidth + SHINE_WIDTH * 1.6;
    const tx = start + shine.value * (end - start);
    return {
      opacity: visible,
      transform: [{ translateX: tx }, { rotate: '-22deg' }],
    };
  });

  const handlePressIn = () => {
    pressed.value = withTiming(1, { duration: 90 });
  };
  const handlePressOut = () => {
    pressed.value = withTiming(0, { duration: 140 });
  };

  const handlePress = () => {
    if (rel.value !== 0 || Math.abs(dragX.value) > 40) return;
    hapticLight();
    onPressActive();
  };

  const a11y = `${name}, ${memberCount} thành viên, ${tone.directionLabel}${
    avatarUrl ? '' : ', chưa có ảnh'
  }`;

  return (
    <Animated.View
      style={[
        styles.shadowWrap,
        {
          width: cardWidth,
          height: cardHeight,
          shadowColor: c.foreground,
        },
        wrapperStyle,
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.clipBox, { backgroundColor: c.surface }]}>
        {/* Color-spill bg: ảnh chính được blur cực mạnh + scale 1.6× rồi đặt
            làm nền. Vùng nào ảnh có màu gì, bg vùng đó có màu đó (không phải
            average tone). Fallback dùng seed gradient khi chưa có avatar. */}
        {avatarUrl && skiaBg ? (
          <Canvas style={[StyleSheet.absoluteFill, { width: cardWidth, height: cardHeight }]}>
            <SkiaImage
              image={skiaBg}
              x={-cardWidth * 0.3}
              y={-cardHeight * 0.3}
              width={cardWidth * 1.6}
              height={cardHeight * 1.6}
              fit="cover"
            >
              <Blur blur={50} mode="clamp" />
            </SkiaImage>
          </Canvas>
        ) : (
          <Svg
            width="100%"
            height="100%"
            style={StyleSheet.absoluteFill}
            preserveAspectRatio="none"
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient id={`carcard-bg-${id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={heroFallback.from} />
                <Stop offset="100%" stopColor={heroFallback.to} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#carcard-bg-${id})`} />
          </Svg>
        )}

        {/* Theme overlay — wash mờ để text đọc rõ + giữ identity light/dark.
            Light: white 45% (giảm độ rực, giữ tinh thần app sáng). Dark: black
            35% (làm bg tối hơn để text trắng nổi). */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: c.isDark
                ? 'rgba(0,0,0,0.35)'
                : 'rgba(255,255,255,0.45)',
            },
          ]}
        />

        <View style={styles.padded}>
          {/* IMAGE — inset, borderRadius nhỏ hơn card 8pt cho cảm giác "ảnh
              nằm trong khung". Avatar luôn square ở upload (aspect [1,1]). */}
          <View
            style={[
              styles.imageBlock,
              { width: imageSize, height: imageSize },
            ]}
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <>
                <Svg
                  width="100%"
                  height="100%"
                  style={StyleSheet.absoluteFill}
                  preserveAspectRatio="none"
                  viewBox="0 0 100 100"
                >
                  <Defs>
                    <LinearGradient
                      id={`carcard-hero-${id}`}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <Stop offset="0%" stopColor={heroFallback.from} />
                      <Stop offset="100%" stopColor={heroFallback.to} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100" height="100" fill={`url(#carcard-hero-${id})`} />
                </Svg>
                <View style={styles.initialsLayer} pointerEvents="none">
                  <Text
                    style={{
                      color: heroFallback.text,
                      fontFamily: fonts.bold,
                      fontSize: Math.round(imageSize * 0.42),
                      letterSpacing: 1,
                      opacity: 0.85,
                      includeFontPadding: false,
                    }}
                  >
                    {initials}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* INFO — text trên gradient bg trực tiếp, không có nền riêng. */}
          <View style={styles.info}>
            <View>
              <AppText
                variant="display"
                weight="bold"
                numberOfLines={1}
                style={{ color: c.foreground }}
              >
                {name}
              </AppText>
              <View style={styles.metaRow}>
                <Users size={13} color={c.muted} strokeWidth={2.2} />
                <AppText
                  variant="meta"
                  style={{ color: c.muted, fontFamily: fonts.medium }}
                >
                  {memberCount} thành viên
                </AppText>
              </View>
            </View>

            <View style={styles.bottomRow}>
              <Animated.View style={moneyParallaxStyle}>
                {tone.isSettled ? (
                  <View style={styles.settledRow}>
                    <View
                      style={[styles.settledBar, { backgroundColor: c.muted }]}
                    />
                    <View
                      style={[styles.settledBar, { backgroundColor: c.muted }]}
                    />
                    <AppText
                      variant="meta"
                      style={{
                        color: c.muted,
                        fontFamily: fonts.semibold,
                        marginLeft: 8,
                        letterSpacing: 0.3,
                      }}
                    >
                      đã thanh toán
                    </AppText>
                  </View>
                ) : (
                  <Money
                    value={Math.abs(balance)}
                    variant="display"
                    tone={tone.moneyTone}
                    showSign
                  />
                )}
              </Animated.View>
              <View
                style={[styles.directionPill, { backgroundColor: tone.toneSoft }]}
              >
                <AppText
                  variant="meta"
                  style={{
                    color: tone.toneColor,
                    fontFamily: fonts.semibold,
                    letterSpacing: 0.4,
                    fontSize: 10.5,
                  }}
                >
                  {tone.directionLabel}
                </AppText>
                <ChevronRight size={13} color={tone.toneColor} strokeWidth={2.4} />
              </View>
            </View>
          </View>
        </View>

        {/* Shine sweep — diagonal streak chỉ chạy trên top card */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shine,
            {
              width: SHINE_WIDTH,
              height: cardHeight * 2,
              top: -cardHeight * 0.5,
            },
            shineStyle,
          ]}
        >
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient
                id={`carcard-shine-${id}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="42%" stopColor="#FFFFFF" stopOpacity="0.15" />
                <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.5" />
                <Stop offset="58%" stopColor="#FFFFFF" stopOpacity="0.15" />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#carcard-shine-${id})`} />
          </Svg>
        </Animated.View>

        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  shadowWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: CARD_RADIUS,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
  clipBox: {
    flex: 1,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  padded: {
    flex: 1,
    padding: CARD_PAD,
  },
  imageBlock: {
    borderRadius: IMAGE_RADIUS,
    overflow: 'hidden',
    position: 'relative',
  },
  initialsLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    paddingTop: 12,
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 5,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  settledRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settledBar: {
    width: 12,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
    marginRight: 3,
  },
  directionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    gap: 4,
    paddingBottom: 5,
  },
  shine: {
    position: 'absolute',
    left: 0,
  },
});
