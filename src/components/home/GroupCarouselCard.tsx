import { Users } from 'lucide-react-native';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
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
  /** Total number of cards — dùng cho modular wrap math. */
  total: number;
  /** False khi total < 3 → không loop, position = absoluteIndex - scrollX trực tiếp. */
  allowLoop: boolean;
  /**
   * Continuous offset của carousel (đơn vị: số slot). Có thể âm hoặc lớn hơn
   * `total` — modulo ở read time để loop vô hạn.
   */
  scrollX: SharedValue<number>;
  /** Khoảng cách giữa 2 tâm card liền kề (px). */
  slot: number;
  cardWidth: number;
  cardHeight: number;
  /** Tap khi card đã ở giữa → push route. */
  onPressActive: () => void;
  /** Tap khi card đang ở vị trí bên → snap nó vào giữa. */
  onSnapTo: () => void;
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
      directionLabel: 'đã thanh toán',
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
  allowLoop,
  scrollX,
  slot,
  cardWidth,
  cardHeight,
  onPressActive,
  onSnapTo,
}: GroupCarouselCardProps) {
  const c = useAppTheme();
  const animationsEnabled = useAnimationsEnabled();
  const tone = getBalanceTone(balance, c);
  const heroFallback = pickHeroGradient(id);

  // Image inset: padding xung quanh, borderRadius nhỏ hơn card. Avatar luôn
  // square ở upload (aspect [1,1]) nên `cover` fit khít, không crop.
  const initials = getInitials(name || id);
  const imageSize = cardWidth - CARD_PAD * 2;

  const pressed = useSharedValue(0);

  // Vị trí liên tục so với tâm carousel (đơn vị: số slot).
  //   0  = đúng giữa
  //   ±1 = card cạnh trái/phải
  //   |p| > 1.5 → ẩn (xa quá)
  // Với allowLoop, modulo vào (-N/2, N/2] để mỗi card lấy "instance" gần nhất
  // → infinite loop. Với N<3 (allowLoop=false), dùng raw position trực tiếp.
  const position = useDerivedValue(() => {
    const N = total;
    if (N <= 1) return 0;
    const raw = absoluteIndex - scrollX.value;
    if (!allowLoop) return raw;
    return ((raw + N / 2) % N + N) % N - N / 2;
  });

  const wrapperStyle = useAnimatedStyle(() => {
    const p = position.value;
    const absP = Math.abs(p);
    const press = 1 - 0.025 * pressed.value;

    // KHÔNG dùng opacity manipulation: Android deallocate hardware layer khi
    // opacity về 0, lúc visible lại Skia Canvas chưa kịp re-paint → 1 frame
    // trống lộ ScrollView bg trắng. Giữ luôn opacity=1, dùng translate đẩy ra
    // ngoài màn cho các card xa tâm (đã đủ off-screen bằng p*slot).
    //
    // Scale tối thiểu 0.5 cho cards rất xa (clamp). Vẫn render đầy đủ →
    // rasterization cache hợp lệ → không nháy khi card xoay vào carousel.
    const scale = Math.max(0.5, 1 - 0.18 * absP) * press;
    const rotZ = p * 6;
    const tx = p * slot;
    // zIndex: center cao nhất, side card thấp hơn → tap vào vùng overlap (nếu
    // có) → center wins. Nhưng với slot=1.05*cardWidth cards không overlap.
    const zIndex = absP < 0.5 ? 30 : absP < 1.2 ? 20 : 10;

    return {
      zIndex,
      transform: [
        { translateX: tx },
        { rotate: `${rotZ}deg` },
        { scale },
      ],
    };
  });

  // Money parallax nhẹ — chỉ khi card đang gần tâm.
  const moneyParallaxStyle = useAnimatedStyle(() => {
    if (!animationsEnabled) return { transform: [{ translateX: 0 }] };
    const p = position.value;
    if (Math.abs(p) > 1) return { transform: [{ translateX: 0 }] };
    return { transform: [{ translateX: -p * 12 }] };
  });

  const handlePressIn = () => {
    pressed.value = withTiming(1, { duration: 90 });
  };
  const handlePressOut = () => {
    pressed.value = withTiming(0, { duration: 140 });
  };

  const handlePress = () => {
    const p = position.value;
    if (Math.abs(p) < 0.3) {
      // Card đã ở giữa → mở chi tiết.
      hapticLight();
      onPressActive();
      return;
    }
    if (Math.abs(p) > 1.4) {
      // Card đang ẩn — không nên xử lý (Pressable lẽ ra cũng đã pointerEvents none).
      return;
    }
    // Card ở vị trí bên → snap vào giữa, không push route.
    hapticLight();
    onSnapTo();
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
      // Cache content của card thành bitmap GPU 1 lần rồi tái dùng cho mọi
      // transform sau đó. Khi scale/rotate đổi liên tục lúc card chuyển vị trí,
      // Android KHÔNG recompose shadow boundary + clip path mỗi frame → tránh
      // 1-frame trống lộ ScrollView bg (trắng light mode). iOS rasterize tương
      // tự để tránh shadow re-render giật.
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      <View
        style={[styles.clipBox, { backgroundColor: heroFallback.from }]}
        // collapsable=false giúp Android giữ View này làm 1 native node riêng
        // (không inline với parent) → hardware texture của parent cache ổn định.
        collapsable={false}
      >
        {/* SVG seed gradient = base layer LUÔN render (không conditional). Khi
            Skia Canvas mất surface 1 frame lúc card đổi opacity (visible ↔
            hidden khi vào/ra carousel), gradient dưới đáy che lại nên không lộ
            ra `clipBox` background → không flash trắng. Chi phí ~0 vì SVG static. */}
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

        {/* Color-spill bg: blurred copy của avatar, scale 1.6× để màu lan rộng
            ra mép card (blur RN Image fade ở rìa). Dùng RN <Image blurRadius>
            thay cho Skia Canvas vì Skia blur shader re-execute khi parent
            transform → 1 frame clear surface → flash trắng. RN Image render
            blur 1 lần (CoreImage iOS / RenderScript Android), transform sau đó
            chỉ thao tác bitmap, không re-blur. */}
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{
              position: 'absolute',
              left: -cardWidth * 0.3,
              top: -cardHeight * 0.3,
              width: cardWidth * 1.6,
              height: cardHeight * 1.6,
            }}
            blurRadius={25}
            resizeMode="cover"
          />
        ) : null}

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
              {
                width: imageSize,
                height: imageSize,
                // Phòng tuyến: nếu RN <Image> bị flicker 1 frame trong lúc
                // parent transform (Android quirk), placeholder lộ ra là màu
                // seed gradient chứ không phải trắng.
                backgroundColor: heroFallback.from,
              },
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

            <View style={styles.bottomCol}>
              {tone.isSettled ? (
                <AppText
                  variant="meta"
                  style={{
                    color: tone.toneColor,
                    fontFamily: fonts.semibold,
                    letterSpacing: 0.6,
                    fontSize: 11,
                    textTransform: 'uppercase',
                  }}
                >
                  {tone.directionLabel}
                </AppText>
              ) : (
                <Animated.View style={moneyParallaxStyle}>
                  <Money
                    value={balance}
                    variant="default"
                    tone={tone.moneyTone}
                    showSign
                  />
                </Animated.View>
              )}
            </View>
          </View>
        </View>

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
  bottomCol: {
    gap: 2,
  },
});
