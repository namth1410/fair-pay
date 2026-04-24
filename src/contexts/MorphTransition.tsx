import { Canvas, Circle, Shader, Skia, useClock } from '@shopify/react-native-skia';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { hexToRgb } from '../components/ui/skia/hexToRgb';
import { fonts } from '../config/fonts';

export interface MorphRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MorphOptions {
  rect: MorphRect;
  /** Màu nền của button — dùng cho patch gốc để nối liền với gradient. */
  color: string;
  /** 3 màu cho mesh gradient lan tỏa. [0] nên gần `color` nhất để khớp seam. */
  gradientColors: [string, string, string];
  /** Text trong button sẽ "tan biến". */
  text: string;
  /** Màu text, mặc định trắng. */
  textColor?: string;
  /**
   * Màu nền của route đích. Cuối transition, gradient sẽ interpolate về màu
   * này trước khi fade opacity → không còn jump màu khi overlay biến mất.
   */
  destBg: string;
  /** Tổng thời lượng overlay tồn tại (ms). Default 1500. */
  duration?: number;
  /**
   * Fire khi circle gradient đã lan phủ kín màn hình (~700ms).
   * Caller nên gọi `router.push(...)` tại thời điểm này để new route mount
   * BÊN DƯỚI overlay đang opaque — tránh flash new page trước khi morph xong.
   */
  onCovered?: () => void;
}

interface MorphContextValue {
  /** Gọi trực tiếp với rect đã biết (tự đo bằng cách khác). */
  run: (opts: MorphOptions) => void;
  /**
   * Đo `node` relative tới provider's root rồi chạy morph. Đây là API
   * KHUYẾN NGHỊ vì coords của button và overlay chia sẻ cùng origin →
   * không bao giờ lệch trên bất kỳ máy/platform nào.
   */
  runFrom: (node: View | null, opts: Omit<MorphOptions, 'rect'>) => void;
}

const MorphCtx = createContext<MorphContextValue | null>(null);

export function useMorphTransition(): MorphContextValue {
  const c = useContext(MorphCtx);
  if (!c) throw new Error('MorphTransitionProvider missing in component tree');
  return c;
}

// Mesh gradient SKSL với tint-mix — khi u_tintMix chạy 0→1, mọi pixel
// interpolate về u_tint (màu nền route đích) để nối liền với page bên dưới.
const MESH_SKSL = `
uniform float u_time;
uniform float2 u_res;
uniform float3 u_c0;
uniform float3 u_c1;
uniform float3 u_c2;
uniform float3 u_tint;
uniform float u_tintMix;

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float t = u_time * 0.001;

  float2 p0 = float2(0.30 + 0.26 * sin(t * 1.1),       0.34 + 0.26 * cos(t * 0.9));
  float2 p1 = float2(0.72 + 0.24 * sin(t * 0.8 + 1.1), 0.38 + 0.22 * cos(t * 1.3 + 2.1));
  float2 p2 = float2(0.50 + 0.28 * cos(t * 0.7 + 3.0), 0.72 + 0.22 * sin(t * 1.2 + 0.5));

  float w0 = smoothstep(0.85, 0.05, distance(uv, p0));
  float w1 = smoothstep(0.85, 0.05, distance(uv, p1));
  float w2 = smoothstep(0.85, 0.05, distance(uv, p2));

  float3 col = u_c0;
  col = mix(col, u_c1, w1 * 0.78);
  col = mix(col, u_c2, w2 * 0.72);
  col = mix(col, u_c0, w0 * 0.55);

  // Tint morph về màu nền đích cuối transition
  col = mix(col, u_tint, u_tintMix);

  return half4(col, 1.0);
}
`;

const meshEffect = Skia.RuntimeEffect.Make(MESH_SKSL);

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MAX_RADIUS = Math.hypot(SCREEN_W, SCREEN_H) + 8;

// Deterministic "random" [0,1) từ integer seed — để mỗi char có rotation/drift
// cố định giữa các lần chạy (đỡ nhìn kỳ khi bấm lại nhiều lần).
function seedRandom(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Single char nằm trong text bị dissolve. Animate dựa vào shared `progress`
 * (0→1): mỗi char có stagger riêng theo index, drift/rotate ngẫu nhiên
 * deterministic — cảm giác chữ bay lên như đốm lửa rồi tan.
 */
const DissolvingChar = React.memo(function DissolvingChar({
  char,
  index,
  total,
  progress,
  color,
}: {
  char: string;
  index: number;
  total: number;
  progress: SharedValue<number>;
  color: string;
}) {
  // Deterministic drift — left-to-right wave, random nhẹ quanh đó
  const driftX = useMemo(() => (seedRandom(index * 31 + 7) - 0.5) * 18, [index]);
  const driftY = useMemo(() => -22 - seedRandom(index * 17 + 3) * 10, [index]);
  const rotDeg = useMemo(() => (seedRandom(index * 53 + 11) - 0.5) * 36, [index]);
  const charStart = useMemo(() => {
    // Stagger trong 55% đầu timeline, 45% sau cho từng char "hoàn tất" dissolve
    const denom = Math.max(1, total - 1);
    return (index / denom) * 0.55;
  }, [index, total]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const local = Math.max(0, Math.min(1, (t - charStart) / 0.45));
    // ease out cubic
    const eased = 1 - Math.pow(1 - local, 3);
    return {
      opacity: 1 - eased,
      transform: [
        { translateX: driftX * eased },
        { translateY: driftY * eased },
        { scale: 1 + 0.45 * eased },
        { rotate: `${rotDeg * eased}deg` },
      ],
    };
  });

  return (
    <Animated.Text
      style={[
        {
          color,
          fontFamily: fonts.semibold,
          fontSize: 14,
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {char === ' ' ? ' ' : char}
    </Animated.Text>
  );
});

export function MorphTransitionProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<MorphOptions | null>(null);
  const clock = useClock();
  const rootRef = useRef<View>(null);

  const textProgress = useSharedValue(0);
  const radius = useSharedValue(0);
  const ringR1 = useSharedValue(0);
  const ringR2 = useSharedValue(0);
  const ringA1 = useSharedValue(0);
  const ringA2 = useSharedValue(0);
  const tintMix = useSharedValue(0);
  const patchOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);

  const clear = useCallback(() => setOpts(null), []);

  const run = useCallback(
    (o: MorphOptions) => {
      setOpts(o);
      textProgress.value = 0;
      radius.value = 0;
      ringR1.value = 0;
      ringR2.value = 0;
      ringA1.value = 0;
      ringA2.value = 0;
      tintMix.value = 0;
      patchOpacity.value = 1;
      overlayOpacity.value = 1;

      // Phase 1a — text dissolve char-by-char (0 → 460ms)
      textProgress.value = withTiming(1, {
        duration: 460,
        easing: Easing.out(Easing.cubic),
      });

      // Phase 1b — 2 ring pulse Skia từ tâm button (energy burst)
      const ringTargetR = Math.max(o.rect.width, o.rect.height) * 1.6;
      const ringExpandEasing = Easing.out(Easing.cubic);
      const ringFadeEasing = Easing.in(Easing.quad);

      // Ring 1: ngay lập tức, opacity 0 → 0.55 trong 1 beat, expand & fade.
      ringR1.value = withTiming(ringTargetR, { duration: 500, easing: ringExpandEasing });
      ringA1.value = withSequence(
        withTiming(0.55, { duration: 40 }),
        withTiming(0, { duration: 460, easing: ringFadeEasing }),
      );

      // Ring 2: delay 120ms, ngắn hơn chút — tạo cảm giác 2 sóng.
      ringR2.value = withDelay(
        120,
        withTiming(ringTargetR * 0.85, { duration: 500, easing: ringExpandEasing }),
      );
      ringA2.value = withDelay(
        120,
        withSequence(
          withTiming(0.45, { duration: 60 }),
          withTiming(0, { duration: 440, easing: ringFadeEasing }),
        ),
      );

      // Phase 2 — circle gradient lan (180 → 700ms)
      radius.value = withDelay(
        180,
        withTiming(MAX_RADIUS, { duration: 520, easing: Easing.out(Easing.cubic) }),
      );

      // Notify caller khi overlay đã phủ kín → lúc này navigate an toàn.
      if (o.onCovered) {
        setTimeout(o.onCovered, 680);
      }

      const total = o.duration ?? 1500;

      // Phase 3a — patch fade sớm (280 → 480ms): khi circle đã lan qua vùng
      // button, patch không còn cần giữ nữa. Fade xong TRƯỚC phase tint để
      // không còn đốm pink nổi bật khi gradient ngả trắng.
      patchOpacity.value = withDelay(
        280,
        withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }),
      );

      // Phase 3b — gradient tint về màu nền đích (800 → 1280ms).
      tintMix.value = withDelay(
        800,
        withTiming(1, { duration: 480, easing: Easing.inOut(Easing.cubic) }),
      );

      // Phase 4 — opacity fade out (1280 → 1500ms).
      const fadeDuration = total - 1280;
      overlayOpacity.value = withDelay(
        1280,
        withTiming(0, { duration: fadeDuration, easing: Easing.linear }, (finished) => {
          if (finished) runOnJS(clear)();
        }),
      );
    },
    [clear, overlayOpacity, patchOpacity, radius, ringA1, ringA2, ringR1, ringR2, textProgress, tintMix],
  );

  const runFrom = useCallback(
    (node: View | null, partial: Omit<MorphOptions, 'rect'>) => {
      if (!node) return;

      const fireRaw = (bx: number, by: number, w: number, h: number) => {
        const root = rootRef.current;
        if (!root) {
          run({ ...partial, rect: { x: bx, y: by, width: w, height: h } });
          return;
        }
        root.measureInWindow((rx, ry) => {
          run({
            ...partial,
            rect: { x: bx - rx, y: by - ry, width: w, height: h },
          });
        });
      };

      try {
        node.measureInWindow(fireRaw);
      } catch {
        /* no-op */
      }
    },
    [run],
  );

  const rgb = useMemo(() => {
    const fallback: [number, number, number] = [0.98, 0.66, 0.83];
    const white: [number, number, number] = [1, 1, 1];
    if (!opts) return { c0: fallback, c1: fallback, c2: fallback, tint: white };
    return {
      c0: hexToRgb(opts.gradientColors[0]),
      c1: hexToRgb(opts.gradientColors[1]),
      c2: hexToRgb(opts.gradientColors[2]),
      tint: hexToRgb(opts.destBg),
    };
  }, [opts]);

  const uniforms = useDerivedValue(() => ({
    u_time: clock.value,
    u_res: [SCREEN_W, SCREEN_H] as [number, number],
    u_c0: rgb.c0,
    u_c1: rgb.c1,
    u_c2: rgb.c2,
    u_tint: rgb.tint,
    u_tintMix: tintMix.value,
  }));

  const patchStyle = useAnimatedStyle(() => ({ opacity: patchOpacity.value }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const visible = !!opts && !!meshEffect;

  const chars = useMemo(() => (opts ? Array.from(opts.text) : []), [opts]);

  return (
    <MorphCtx.Provider value={{ run, runFrom }}>
      <View ref={rootRef} collapsable={false} style={styles.root}>
        {children}
        {visible && opts ? (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, overlayStyle]}
          >
            <Canvas style={StyleSheet.absoluteFill}>
              {/* Ring pulses từ tâm button — energy burst khi text dissolve */}
              <Circle
                cx={opts.rect.x + opts.rect.width / 2}
                cy={opts.rect.y + opts.rect.height / 2}
                r={ringR1}
                color={opts.color}
                style="stroke"
                strokeWidth={2.5}
                opacity={ringA1}
              />
              <Circle
                cx={opts.rect.x + opts.rect.width / 2}
                cy={opts.rect.y + opts.rect.height / 2}
                r={ringR2}
                color={opts.color}
                style="stroke"
                strokeWidth={1.5}
                opacity={ringA2}
              />
              {/* Gradient circle lan tỏa */}
              <Circle
                cx={opts.rect.x + opts.rect.width / 2}
                cy={opts.rect.y + opts.rect.height / 2}
                r={radius}
              >
                <Shader source={meshEffect!} uniforms={uniforms} />
              </Circle>
            </Canvas>

            {/* Patch gốc của button — vị trí + màu y hệt FAB, text dissolve trên đó */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: opts.rect.x,
                  top: opts.rect.y,
                  width: opts.rect.width,
                  height: opts.rect.height,
                  backgroundColor: opts.color,
                  borderRadius: 999,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                patchStyle,
              ]}
            >
              <View style={styles.charRow}>
                {chars.map((ch, i) => (
                  <DissolvingChar
                    key={`${i}-${ch}`}
                    char={ch}
                    index={i}
                    total={chars.length}
                    progress={textProgress}
                    color={opts.textColor ?? '#FFFFFF'}
                  />
                ))}
              </View>
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>
    </MorphCtx.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  charRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
