import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { useAppTheme } from '../../hooks/useAppTheme';
import { hapticLight, hapticMedium } from '../../utils/haptics';

const { height: WINDOW_H } = Dimensions.get('window');

const LOGO_SIZE = 110;
const FONT_SIZE = 42;
const FONT_FAMILY = 'BeVietnamPro_700Bold';
const SPACE_WIDTH = FONT_SIZE * 0.28;

const BOUNCE_HEIGHT = 64;
const DROP_SIZE = 14;
const DOT_SIZE = 5;
const BURST_COUNT = 8;

// 8 hướng để stack tạo viền chữ — radius ~1.5px đủ crisp ở 42px font.
const OUTLINE_OFFSETS: Array<[number, number]> = [
  [-1.5, 0],
  [1.5, 0],
  [0, -1.5],
  [0, 1.5],
  [-1.1, -1.1],
  [-1.1, 1.1],
  [1.1, -1.1],
  [1.1, 1.1],
];

// Logo dự án — inline SVG (không dùng SvgXml chỉ để tránh dependency Metro
// transformer cho .svg files).
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
<circle fill="#EC4899" cy="50" cx="50" r="45"/>
<circle fill="none" stroke="#ffffff" stroke-width="8.55" cx="50" cy="50" r="21.825"/>
<g id="friend"><circle fill="#EC4899" cx="19.4" cy="50" r="8.4376"/>
<path stroke="#EC4899" stroke-width="3.2378" d="M67,50H77"/>
<circle fill="#ffffff" cx="19.4" cy="50" r="6.00745"/></g>
<use xlink:href="#friend" transform="rotate(120,50,50)"/>
<use xlink:href="#friend" transform="rotate(240,50,50)"/></svg>`;

interface Props {
  onComplete: () => void;
}

interface PartLayout {
  x: number;
  width: number;
}

const PART_KEYS = ['F', 'air', 'P', 'ay'] as const;
type PartKey = (typeof PART_KEYS)[number];

export function SplashScene({ onComplete }: Props) {
  const { isDark } = useAppTheme();

  // Dark mode đảo màu để text + ink luôn đọc được trên nền:
  // - Light bg: trắng outline đen → loang đen
  // - Dark bg: đen outline trắng → loang trắng
  const fillStart = isDark ? '#000000' : '#FFFFFF';
  const fillEnd = isDark ? '#FFFFFF' : '#000000';
  const outlineColor = isDark ? '#FFFFFF' : '#000000';
  const inkColor = isDark ? '#FFFFFF' : '#000000';
  const bg = isDark ? '#1A1A1F' : '#F7F7F7';

  const layoutsRef = useRef<Record<PartKey, PartLayout | null>>({
    F: null,
    air: null,
    P: null,
    ay: null,
  });
  const [centers, setCenters] = useState<{
    fCenterX: number;
    pCenterX: number;
  } | null>(null);

  const onPartLayout = (key: PartKey) => (e: LayoutChangeEvent) => {
    layoutsRef.current[key] = {
      x: e.nativeEvent.layout.x,
      width: e.nativeEvent.layout.width,
    };
    if (PART_KEYS.every((k) => layoutsRef.current[k] !== null)) {
      const F = layoutsRef.current.F!;
      const P = layoutsRef.current.P!;
      setCenters({
        fCenterX: F.x + F.width / 2,
        pCenterX: P.x + P.width / 2,
      });
    }
  };

  const rootOpacity = useSharedValue(1);
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const dropProgress = useSharedValue(0);
  const dropOpacity = useSharedValue(0);
  const fSquish = useSharedValue(1);
  const pSquish = useSharedValue(1);
  const burstProgress = useSharedValue(0);
  const colorF = useSharedValue(0);
  const colorAir = useSharedValue(0);
  const colorP = useSharedValue(0);
  const colorAy = useSharedValue(0);

  // Phase 1: logo + text fade in. Chạy ngay khi mount, không phụ thuộc layout.
  useEffect(() => {
    logoOpacity.value = withTiming(1, {
      duration: 400,
      easing: Easing.out(Easing.quad),
    });
    logoScale.value = withSpring(1, { damping: 11, stiffness: 95 });
    textOpacity.value = withDelay(
      150,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }),
    );
  }, []);

  // Phase 2+: drop bounce, squish, ink loang, fade out — chỉ chạy sau khi đo
  // xong vị trí F và P (cần biết để bounce đúng giữa 2 chữ cái).
  useEffect(() => {
    if (!centers) return;

    const dropStart = 800;
    const dropFadeIn = 100;
    const bounceDur = 1100;
    const dropFadeOut = 120;

    dropOpacity.value = withSequence(
      withDelay(dropStart, withTiming(1, { duration: dropFadeIn })),
      withDelay(bounceDur, withTiming(0, { duration: dropFadeOut })),
    );
    dropProgress.value = withDelay(
      dropStart + dropFadeIn,
      withTiming(1, { duration: bounceDur, easing: Easing.inOut(Easing.quad) }),
    );

    const fImpactT = dropStart + dropFadeIn;
    const pImpactT = fImpactT + bounceDur;

    const t1 = setTimeout(() => {
      fSquish.value = withSequence(
        withTiming(0.78, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 6, stiffness: 200 }),
      );
      hapticLight();
    }, fImpactT);

    const t2 = setTimeout(() => {
      pSquish.value = withSequence(
        withTiming(0.78, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 6, stiffness: 200 }),
      );
      hapticMedium();
    }, pImpactT);

    // Ink loang ra theo khoảng cách tới P: P trước → "ay" → "air" → F.
    const inkAt = (delay: number) =>
      withDelay(
        pImpactT + delay,
        withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }),
      );
    colorP.value = inkAt(0);
    colorAy.value = inkAt(80);
    colorAir.value = inkAt(160);
    colorF.value = inkAt(240);

    burstProgress.value = withDelay(
      pImpactT,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }),
    );

    const fadeStart = pImpactT + 1000;
    rootOpacity.value = withDelay(
      fadeStart,
      withTiming(
        0,
        { duration: 400, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(onComplete)();
        },
      ),
    );

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [centers]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const textRowStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  const dropStyle = useAnimatedStyle(() => {
    if (!centers) return { opacity: 0 };
    const t = dropProgress.value;
    const cx = interpolate(t, [0, 1], [centers.fCenterX, centers.pCenterX]);
    // 2 cú nảy: lift = |sin(t·2π)|·H. Touchdown tại t=0, 0.5, 1; peak tại 0.25, 0.75.
    const lift = Math.abs(Math.sin(t * Math.PI * 2)) * BOUNCE_HEIGHT;
    // Méo theo vận tốc Y: nhanh → kéo dài chiều rơi (giọt nước thật).
    const vy = Math.cos(t * Math.PI * 2);
    const stretch = 1 + Math.abs(vy) * 0.35;
    const squeeze = 1 / stretch;
    return {
      opacity: dropOpacity.value,
      transform: [
        { translateX: cx - DROP_SIZE / 2 },
        { translateY: -lift },
        { scaleX: squeeze },
        { scaleY: stretch },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { backgroundColor: bg },
        rootStyle,
      ]}
      pointerEvents="auto"
    >
      <Animated.View style={[styles.logoWrap, logoStyle]} pointerEvents="none">
        <SvgXml xml={LOGO_SVG} width={LOGO_SIZE} height={LOGO_SIZE} />
      </Animated.View>

      <Animated.View
        style={[styles.textRowWrap, textRowStyle]}
        pointerEvents="none"
      >
        <View style={styles.textRow}>
          <OutlinedPart
            text="F"
            colorProgress={colorF}
            squishValue={fSquish}
            fillStart={fillStart}
            fillEnd={fillEnd}
            outlineColor={outlineColor}
            onLayout={onPartLayout('F')}
          />
          <OutlinedPart
            text="air"
            colorProgress={colorAir}
            fillStart={fillStart}
            fillEnd={fillEnd}
            outlineColor={outlineColor}
            onLayout={onPartLayout('air')}
          />
          <View style={{ width: SPACE_WIDTH }} />
          <OutlinedPart
            text="P"
            colorProgress={colorP}
            squishValue={pSquish}
            fillStart={fillStart}
            fillEnd={fillEnd}
            outlineColor={outlineColor}
            onLayout={onPartLayout('P')}
          />
          <OutlinedPart
            text="ay"
            colorProgress={colorAy}
            fillStart={fillStart}
            fillEnd={fillEnd}
            outlineColor={outlineColor}
            onLayout={onPartLayout('ay')}
          />

          <Animated.View
            style={[styles.drop, { backgroundColor: inkColor }, dropStyle]}
            pointerEvents="none"
          />

          {centers && (
            <ParticleBurst
              progress={burstProgress}
              originX={centers.pCenterX}
              color={inkColor}
            />
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

interface OutlinedPartProps {
  text: string;
  colorProgress: SharedValue<number>;
  squishValue?: SharedValue<number>;
  fillStart: string;
  fillEnd: string;
  outlineColor: string;
  onLayout?: (e: LayoutChangeEvent) => void;
}

function OutlinedPart({
  text,
  colorProgress,
  squishValue,
  fillStart,
  fillEnd,
  outlineColor,
  onLayout,
}: OutlinedPartProps) {
  const wrapStyle = useAnimatedStyle(() => {
    if (!squishValue) return {};
    const sy = squishValue.value;
    // Anchor squish ở baseline: khi scaleY giảm, dịch xuống bằng (1-sy)·halfHeight
    // để đỉnh chữ tụt xuống thay vì tâm scale.
    return {
      transform: [
        { translateY: (1 - sy) * (FONT_SIZE * 0.42) },
        { scaleY: sy },
      ],
    };
  });

  const fillStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      colorProgress.value,
      [0, 1],
      [fillStart, fillEnd],
    ),
  }));

  return (
    <Animated.View style={wrapStyle} onLayout={onLayout}>
      {OUTLINE_OFFSETS.map(([dx, dy], i) => (
        <Text
          key={i}
          style={[
            styles.outlineText,
            {
              color: outlineColor,
              transform: [{ translateX: dx }, { translateY: dy }],
            },
          ]}
        >
          {text}
        </Text>
      ))}
      <Animated.Text style={[styles.fillText, fillStyle]}>{text}</Animated.Text>
    </Animated.View>
  );
}

interface ParticleBurstProps {
  progress: SharedValue<number>;
  originX: number;
  color: string;
}

function ParticleBurst({ progress, originX, color }: ParticleBurstProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: BURST_COUNT }, (_, i) => ({
        angle:
          (i / BURST_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
        distance: 22 + Math.random() * 14,
      })),
    [],
  );
  return (
    <>
      {particles.map((p, i) => (
        <Dot
          key={i}
          progress={progress}
          originX={originX}
          angle={p.angle}
          distance={p.distance}
          color={color}
        />
      ))}
    </>
  );
}

interface DotProps {
  progress: SharedValue<number>;
  originX: number;
  angle: number;
  distance: number;
  color: string;
}

function Dot({ progress, originX, angle, distance, color }: DotProps) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const r = t * distance;
    return {
      opacity: t > 0 ? 1 - t : 0,
      transform: [
        { translateX: originX + Math.cos(angle) * r - DOT_SIZE / 2 },
        { translateY: Math.sin(angle) * r - DOT_SIZE / 2 },
        { scale: 1 - t * 0.4 },
      ],
    };
  });
  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color }, style]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    position: 'absolute',
    top: WINDOW_H / 2 - LOGO_SIZE - 30,
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  textRowWrap: {
    position: 'absolute',
    top: WINDOW_H / 2 + 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  outlineText: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    letterSpacing: -0.5,
  },
  fillText: {
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    letterSpacing: -0.5,
  },
  drop: {
    position: 'absolute',
    top: -DROP_SIZE - 2,
    left: 0,
    width: DROP_SIZE,
    height: DROP_SIZE,
    borderRadius: DROP_SIZE / 2,
  },
  dot: {
    position: 'absolute',
    top: -DOT_SIZE,
    left: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
