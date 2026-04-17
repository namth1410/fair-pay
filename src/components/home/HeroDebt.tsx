import { memo, useEffect, useState } from 'react';
import { type LayoutChangeEvent,StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AnimatedEntrance, AppText, Money } from '../ui';

interface HeroDebtProps {
  total: number;
}

type Mode = 'positive' | 'negative' | 'settled';

interface Palette {
  tintFrom: string;
  tintTo: string;
  meshGlow: string;
  petal: string;
  orbit: string;
  accent: string;
  statusBg: string;
  statusFg: string;
  statusDot: string;
  label: string;
  meta: string;
  rule: string;
}

function buildPalette(mode: Mode, c: ReturnType<typeof useAppTheme>): Palette {
  const base = {
    tintFrom: c.surface,
    tintTo: c.background,
    meshGlow: c.primarySoft,
    petal: c.primary,
    orbit: c.divider,
    label: c.muted,
    meta: c.muted,
    rule: c.divider,
  };
  if (mode === 'positive') {
    return {
      ...base,
      tintFrom: c.successSoft,
      tintTo: c.surface,
      meshGlow: c.successSoft,
      accent: c.success,
      statusBg: c.success,
      statusFg: c.inverseForeground,
      statusDot: c.inverseForeground,
    };
  }
  if (mode === 'negative') {
    return {
      ...base,
      tintFrom: c.dangerSoft,
      tintTo: c.surface,
      meshGlow: c.dangerSoft,
      accent: c.danger,
      statusBg: c.danger,
      statusFg: c.inverseForeground,
      statusDot: c.inverseForeground,
    };
  }
  return {
    ...base,
    tintFrom: c.accentSoft,
    tintTo: c.surface,
    meshGlow: c.accentSoft,
    accent: c.primaryStrong,
    statusBg: c.primarySoft,
    statusFg: c.primaryStrong,
    statusDot: c.primaryStrong,
  };
}

// Scattered "sakura petal" positions (viewBox 100x100 units).
// Hand-picked so they cluster asymmetrically top-right + bottom-left,
// avoiding the central typography zone.
const PETALS: { cx: number; cy: number; rx: number; ry: number; rot: number; o: number }[] = [
  { cx: 84, cy: 14, rx: 3.2, ry: 1.6, rot: -28, o: 0.55 },
  { cx: 92, cy: 28, rx: 2.1, ry: 1.0, rot: 42, o: 0.35 },
  { cx: 78, cy: 30, rx: 1.4, ry: 0.7, rot: 10, o: 0.28 },
  { cx: 8, cy: 78, rx: 2.8, ry: 1.4, rot: 18, o: 0.45 },
  { cx: 16, cy: 90, rx: 1.8, ry: 0.9, rot: -22, o: 0.3 },
  { cx: 26, cy: 82, rx: 1.2, ry: 0.6, rot: 60, o: 0.22 },
  { cx: 70, cy: 70, rx: 1.0, ry: 0.5, rot: -8, o: 0.2 },
  { cx: 50, cy: 10, rx: 1.3, ry: 0.6, rot: 30, o: 0.22 },
];

export const HeroDebt = memo(function HeroDebt({ total }: HeroDebtProps) {
  const c = useAppTheme();

  let mode: Mode;
  let label: string;
  let statusLabel: string;
  let tone: 'success' | 'danger' | undefined;
  let footnote: string;

  if (total === 0) {
    mode = 'settled';
    label = 'Tổng quan số dư';
    statusLabel = 'đã thanh toán';
    tone = undefined;
    footnote = 'Không còn khoản nào cần thanh toán';
  } else if (total > 0) {
    mode = 'positive';
    label = 'Bạn đang được nợ';
    statusLabel = 'được nhận';
    tone = 'success';
    footnote = 'trên tất cả các nhóm đang hoạt động';
  } else {
    mode = 'negative';
    label = 'Bạn đang nợ';
    statusLabel = 'cần trả';
    tone = 'danger';
    footnote = 'trên tất cả các nhóm đang hoạt động';
  }

  const p = buildPalette(mode, c);

  // Shiny sweep: infinite diagonal streak across the hero card.
  // Captures wrap width via onLayout so the shine travels edge-to-edge
  // regardless of device width.
  const [wrapSize, setWrapSize] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(0);

  const onWrapLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setWrapSize({ width, height });
  };

  useEffect(() => {
    if (wrapSize.width === 0) return;
    progress.value = 0;
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 500 }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
  }, [progress, wrapSize.width]);

  const SHINE_WIDTH = 90;
  const TRAVEL_PAD = SHINE_WIDTH * 1.6;
  const shineAnimStyle = useAnimatedStyle(() => {
    const start = -TRAVEL_PAD;
    const end = wrapSize.width + TRAVEL_PAD;
    const tx = start + progress.value * (end - start);
    return {
      transform: [{ translateX: tx }, { rotate: '-22deg' }],
      opacity: wrapSize.width > 0 ? 1 : 0,
    };
  });

  // Subtle card "breathe" synced to the shine pass — bell curve peaking
  // at progress 0.5 (mid-sweep), resting at 1.0 during the hold phase
  // so the card only pulses when the light hits it.
  const cardBreatheStyle = useAnimatedStyle(() => {
    const bell = Math.sin(Math.PI * progress.value);
    return {
      transform: [{ scale: 1 + bell * 0.014 }],
    };
  });

  // Shine color — white on light (pink bg), soft white on dark.
  // Opacity stays modest so it reads as a gloss pass, not a flashlight.
  const shineColor = c.isDark ? '#FFE8F4' : '#FFFFFF';

  return (
    <AnimatedEntrance delay={0}>
      <Animated.View
        onLayout={onWrapLayout}
        style={[styles.wrap, { shadowColor: c.foreground }, cardBreatheStyle]}
      >
        {/* Decorative layered SVG background: mesh + petals + orbital arc */}
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <Defs>
            <LinearGradient id="hero-tint" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={p.tintFrom} />
              <Stop offset="100%" stopColor={p.tintTo} />
            </LinearGradient>
            <RadialGradient id="hero-glow" cx="88%" cy="18%" r="65%">
              <Stop offset="0%" stopColor={p.meshGlow} stopOpacity="0.85" />
              <Stop offset="60%" stopColor={p.meshGlow} stopOpacity="0.15" />
              <Stop offset="100%" stopColor={p.meshGlow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#hero-tint)" />
          <Rect width="100" height="100" fill="url(#hero-glow)" />
          {/* Thin orbital arc — sweeps from top-right into the card */}
          <Path
            d="M 120 0 Q 60 30 -10 90"
            stroke={p.orbit}
            strokeWidth={0.35}
            fill="none"
            opacity={0.7}
          />
          <Path
            d="M 130 10 Q 80 50 -5 110"
            stroke={p.accent}
            strokeWidth={0.18}
            fill="none"
            opacity={0.45}
          />
          {/* Scatter petals */}
          {PETALS.map((pt, i) => (
            <Ellipse
              key={i}
              cx={pt.cx}
              cy={pt.cy}
              rx={pt.rx}
              ry={pt.ry}
              fill={p.petal}
              opacity={pt.o}
              transform={`rotate(${pt.rot} ${pt.cx} ${pt.cy})`}
            />
          ))}
          {/* A single "featured" accent dot */}
          <Circle cx={88} cy={72} r={1.8} fill={p.accent} opacity={0.35} />
        </Svg>

        {/* Shiny sweep — diagonal light streak, lives between bg & content */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shine,
            {
              width: SHINE_WIDTH,
              height: wrapSize.height * 2,
              top: -wrapSize.height * 0.5,
            },
            shineAnimStyle,
          ]}
        >
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="hero-shine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor={shineColor} stopOpacity="0" />
                <Stop offset="42%" stopColor={shineColor} stopOpacity="0.18" />
                <Stop offset="50%" stopColor={shineColor} stopOpacity="0.55" />
                <Stop offset="58%" stopColor={shineColor} stopOpacity="0.18" />
                <Stop offset="100%" stopColor={shineColor} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#hero-shine)" />
          </Svg>
        </Animated.View>

        {/* Foreground content */}
        <View style={styles.inner}>
          {/* Top row: editorial label + floating status pill */}
          <View style={styles.topRow}>
            <View style={styles.labelBlock}>
              <View style={[styles.tick, { backgroundColor: p.accent }]} />
              <AppText
                variant="label"
                style={{ color: p.label, fontFamily: fonts.semibold }}
              >
                {label}
              </AppText>
            </View>

            <View style={[styles.statusPill, { backgroundColor: p.statusBg }]}>
              <View style={[styles.statusDot, { backgroundColor: p.statusDot }]} />
              <AppText
                variant="meta"
                weight="semibold"
                style={{ color: p.statusFg, letterSpacing: 0.3 }}
              >
                {statusLabel}
              </AppText>
            </View>
          </View>

          {/* Hero amount — dramatic vertical space */}
          <View style={styles.amountRow}>
            <Money value={Math.abs(total)} variant="hero" tone={tone} animate />
          </View>

          {/* Bottom meta: editorial rule + footnote */}
          <View style={styles.bottomRow}>
            <View style={[styles.metaRule, { backgroundColor: p.accent }]} />
            <AppText
              variant="meta"
              style={{ color: p.meta, fontFamily: fonts.medium, letterSpacing: 0.2 }}
            >
              {footnote}
            </AppText>
          </View>
        </View>

      </Animated.View>
    </AnimatedEntrance>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 24,
    overflow: 'hidden',
    minHeight: 188,
    // Deep soft shadow — lifts the hero above the ribbon & list
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  inner: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    flex: 1,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  labelBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  tick: {
    width: 14,
    height: 2,
    borderRadius: 1,
    marginRight: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  amountRow: {
    marginTop: 18,
    marginBottom: 14,
    alignItems: 'flex-start',
    paddingLeft: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRule: {
    width: 18,
    height: 2,
    borderRadius: 1,
    marginRight: 10,
    opacity: 0.9,
  },
  shine: {
    position: 'absolute',
    left: 0,
  },
});
