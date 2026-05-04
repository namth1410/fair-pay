import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { hapticHeavy, hapticLight, hapticMedium } from '../../utils/haptics';
import { useAnimationsEnabled } from '../../utils/userPreferences';
import { AppText } from './AppText';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_W - 48, 340);
// Dải mây render ở mép trên modal — đóng vai trò "leading edge" khi
// clipper height đang đổi. Đủ dày để mây có không gian thở (>~48px) nhưng
// không che hết tiêu đề khi opacity > 0.
const STRIP_HEIGHT = 56;

// Vorocloud — stepped distance field từ 4 anchor points + cos-displacement.
// Render trong dải mỏng STRIP_HEIGHT × CARD_WIDTH ở đỉnh modal.
//
// Port GLSL → SkSL: vec*→float*, mainImage→main, iTime giây ⇒ u_time ms ×0.001.
// Mảng `pts[4]` unroll thành 4 float2. Clamp pow để tránh UB khi neg.
// Alpha = max channel của col → vùng giữa các cell trong suốt thay vì đen,
// để nền card phía dưới có thể lộ một phần qua mây.
const VORO_SKSL = `
uniform float u_time;
uniform float2 u_res;

float vorocloud(float2 p) {
  float t = u_time * 0.001;
  float2 pp = cos(float2(p.x * 14.0,
                         16.0 * p.y + cos(floor(p.x * 30.0)) + t * 6.28318530718));
  p = cos(p * 12.1 + pp * 10.0 + 0.5 * cos(pp.x * 10.0));

  float2 a0 = float2(0.5, 0.6)   + float2(0.03                + p.x,                     p.y);
  float2 a1 = float2(-0.4, 0.4)  + float2(0.03 * cos(1.0)     + p.x, 0.03 * sin(1.0)     + p.y);
  float2 a2 = float2(0.2, -0.7)  + float2(0.03 * cos(2.0)     + p.x, 0.03 * sin(2.0)     + p.y);
  float2 a3 = float2(-0.3, -0.4) + float2(0.03 * cos(3.0)     + p.x, 0.03 * sin(3.0)     + p.y);

  float d = 5.0;
  d = min(d, distance(a0, pp));
  d = min(d, distance(a1, pp));
  d = min(d, distance(a2, pp));
  d = min(d, distance(a3, pp));

  float f = 2.0 * pow(max(1.0 - 0.3 * d, 0.0), 13.0);
  return min(f, 1.0);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float2 p = uv - float2(0.5);

  float4 col = float4(0.0);
  col.g += 0.02;

  float v = vorocloud(p);
  v = 0.2 * floor(v * 5.0);
  col.r += 0.1 * v;
  col.g += 0.6 * v;
  col.b += 0.5 * pow(v, 5.0);

  v = vorocloud(p * 2.0);
  v = 0.2 * floor(v * 5.0);
  col.r += 0.1 * v;
  col.g += 0.2 * v;
  col.b += 0.01 * pow(v, 5.0);

  float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  return half4(col.rgb, alpha);
}
`;

const voroEffect = Skia.RuntimeEffect.Make(VORO_SKSL);

const ENTER_HEIGHT_MS = 540;
const EXIT_HEIGHT_MS = 480;
const EXIT_HEIGHT_DELAY_MS = 140;

interface VoroConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function VoroConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  destructive = false,
  onConfirm,
}: VoroConfirmDialogProps) {
  const { surface, divider, foreground } = useAppTheme();
  const animationsEnabled = useAnimationsEnabled();
  const clock = useClock();

  const [mounted, setMounted] = useState(false);
  // naturalHeight = chiều cao thực của card (đo qua onLayout). Khi 0 = chưa
  // đo, clipper render rỗng cho tới khi có giá trị → entrance animation
  // mới khởi động. Cho phép cập nhật nhiều lần vì text wrap / font load có
  // thể làm height đổi sau frame đầu.
  const [naturalHeight, setNaturalHeight] = useState(0);
  const prevOpenRef = useRef(false);

  const heightSV = useSharedValue(0);
  const cloudOpacitySV = useSharedValue(0);
  const backdropSV = useSharedValue(0);

  // ── Driver: handle isOpen transitions (mount/unmount + exit animation) ──
  useEffect(() => {
    const justOpened = isOpen && !prevOpenRef.current;
    const justClosed = !isOpen && prevOpenRef.current;
    prevOpenRef.current = isOpen;

    if (justOpened) {
      // Reset state mỗi lần mở — content có thể đổi giữa các lần mở (tên
      // chuyến khác nhau ⇒ description khác chiều cao).
      setNaturalHeight(0);
      heightSV.value = 0;
      cloudOpacitySV.value = 0;
      backdropSV.value = 0;
      setMounted(true);
      hapticMedium();
    } else if (justClosed && mounted) {
      if (!animationsEnabled) {
        setMounted(false);
        return;
      }

      // Exit: mây xuất hiện ở đỉnh trước, rồi height co lại "ăn dần" từ
      // trên xuống. Vì clipper anchored bottom nên top edge tụt → strip
      // (top:0 của clipper) bám theo top edge → mây trông như đang gặm
      // dần modal.
      cloudOpacitySV.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      backdropSV.value = withDelay(
        220,
        withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
      );
      heightSV.value = withDelay(
        EXIT_HEIGHT_DELAY_MS,
        withTiming(
          0,
          { duration: EXIT_HEIGHT_MS, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(setMounted)(false);
          },
        ),
      );
    }
  }, [isOpen, mounted, animationsEnabled, heightSV, cloudOpacitySV, backdropSV]);

  // ── Entrance animation — fire khi naturalHeight đã đo xong ──
  useEffect(() => {
    if (!mounted || !isOpen || naturalHeight === 0) return;

    if (!animationsEnabled) {
      heightSV.value = naturalHeight;
      backdropSV.value = 1;
      cloudOpacitySV.value = 0;
      return;
    }

    backdropSV.value = withTiming(1, { duration: 280 });
    heightSV.value = withTiming(naturalHeight, {
      duration: ENTER_HEIGHT_MS,
      easing: Easing.out(Easing.cubic),
    });
    // Mây dẫn đầu trong lúc height đang lớn lên rồi tan dần khi modal
    // hoàn tất — đối xứng với exit (mây xuất hiện trước rồi height co).
    cloudOpacitySV.value = withSequence(
      withTiming(1, { duration: 200 }),
      withDelay(160, withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) })),
    );
  }, [mounted, isOpen, naturalHeight, animationsEnabled, heightSV, cloudOpacitySV, backdropSV]);

  const onCardLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    // Update khi đổi ≥1px — tránh loop trên float minor diff, vẫn bắt được
    // re-layout khi text wrap đổi (font load async, ngắt dòng v.v.)
    setNaturalHeight((prev) => (Math.abs(prev - h) >= 1 ? h : prev));
  };

  const uniforms = useDerivedValue(() => ({
    u_time: clock.value,
    u_res: [CARD_WIDTH, STRIP_HEIGHT] as [number, number],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropSV.value,
  }));

  const clipperStyle = useAnimatedStyle(() => ({
    height: heightSV.value,
  }));

  const cloudStripStyle = useAnimatedStyle(() => ({
    opacity: cloudOpacitySV.value,
  }));

  const handleConfirm = () => {
    if (destructive) hapticHeavy();
    else hapticLight();
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    hapticLight();
    onClose();
  };

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={handleCancel}
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={handleCancel}
            accessibilityLabel="Đóng hộp thoại"
          />
        </Animated.View>

        <View style={styles.center} pointerEvents="box-none">
          {/* Outer frame có height = naturalHeight + flex-end ⇒ neo clipper
              vào mép dưới của khung. Khi clipper.height < naturalHeight, top
              edge tụt xuống còn bottom đứng yên. */}
          <View
            style={[
              styles.outerFrame,
              {
                height: naturalHeight,
                opacity: naturalHeight > 0 ? 1 : 0,
              },
            ]}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                styles.clipper,
                {
                  backgroundColor: surface,
                  borderColor: divider,
                  shadowColor: foreground,
                } as ViewStyle,
                clipperStyle,
              ]}
            >
              {/* Card content — `position: absolute` với `bottom: 0` ⇒ neo
                  vào đáy clipper KHÔNG qua flex (tránh Yoga collapse khi
                  parent height = 0 lúc đo). Intrinsic height được đo qua
                  onLayout độc lập với clipper.height. */}
              <View style={styles.cardContent} onLayout={onCardLayout}>
                <AppText variant="title" center style={styles.title}>
                  {title}
                </AppText>
                <AppText variant="body" tone="muted" center style={styles.description}>
                  {description}
                </AppText>
                <View style={styles.actions}>
                  <Button variant="ghost" size="sm" onPress={handleCancel}>
                    <Button.Label>{cancelLabel}</Button.Label>
                  </Button>
                  <Button
                    variant={destructive ? 'danger' : 'primary'}
                    size="sm"
                    onPress={handleConfirm}
                  >
                    <Button.Label>{confirmLabel}</Button.Label>
                  </Button>
                </View>
              </View>

              {/* Cloud strip — bám đỉnh clipper (top:0). Vì clipper anchored
                  bottom, top edge di chuyển theo height ⇒ strip "đi cùng"
                  mép trên modal. */}
              {animationsEnabled && voroEffect ? (
                <Animated.View
                  style={[styles.cloudStrip, cloudStripStyle]}
                  pointerEvents="none"
                >
                  <Canvas style={StyleSheet.absoluteFill}>
                    <Fill>
                      <Shader source={voroEffect} uniforms={uniforms} />
                    </Fill>
                  </Canvas>
                </Animated.View>
              ) : null}
            </Animated.View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(4, 12, 8, 0.72)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  outerFrame: {
    width: CARD_WIDTH,
    justifyContent: 'flex-end',
  },
  clipper: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  cloudStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: STRIP_HEIGHT,
  },
  title: {
    marginBottom: 6,
  },
  description: {
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
});
