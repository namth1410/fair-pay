import {
  BlurMask,
  Canvas,
  Group,
  Path as SkiaPath,
  Rect,
  Shader,
  Skia,
  type SkPath,
  useClock,
} from '@shopify/react-native-skia';
import {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { hexToRgb } from '../components/ui/skia/hexToRgb';
import { useAppTheme } from '../hooks/useAppTheme';
import { hapticHeavy, hapticLight } from '../utils/haptics';
import { type Bolt, generateImpactStrike, type Pt } from '../utils/lightning';
import { getAnimationsEnabled } from '../utils/userPreferences';

const { width: W, height: H } = Dimensions.get('window');
const MAX_SMOKE_RADIUS = Math.hypot(W, H) + 80;

const SMOKE_LIGHT = '#C8CCD6';
const SMOKE_DARK = '#1A1E28';

/**
 * Smoke shader — Ashima 3D simplex noise + 5 octave scale exponential.
 *
 * Tại sao 3D simplex tốt hơn 2D value noise: cho lấy `time` làm trục Z thứ 3
 * → khói "evolve" trong noise space 3D (mỗi pixel sample tại tọa độ space-time
 * khác nhau) thay vì texture 2D trượt phẳng. Cảm giác volumetric, không phải
 * "vân giấy đang dịch".
 *
 * 5 octave scale 3/6/12/24/48 với offset + time speed riêng → các lớp puff
 * lớn (scale 3) chuyển động chậm + chi tiết nhỏ (scale 48) chuyển động nhanh
 * → hiện tượng parallax mây thật.
 *
 * Wispy boundary: dùng chính cloud density bend `dist` → vùng dày nhô lan
 * ngoài, vùng loãng tạo gaps → biên không phải vòng tròn.
 *
 * Source: Ashima/Stefan Gustavson simplex noise (port từ GLSL Shadertoy).
 */
const SMOKE_SKSL = `
uniform float u_time;
uniform float2 u_res;
uniform float2 u_center;
uniform float u_radius;
uniform float u_opacity;
uniform float3 u_color;

float3 mod289_3(float3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
float4 mod289_4(float4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
float4 permute(float4 x) { return mod289_4(((x * 34.0) + 1.0) * x); }
float4 taylorInvSqrt(float4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(float3 v) {
  float2 C = float2(1.0/6.0, 1.0/3.0);
  float4 D = float4(0.0, 0.5, 1.0, 2.0);

  float3 i = floor(v + dot(v, C.yyy));
  float3 x0 = v - i + dot(i, C.xxx);

  float3 g = step(x0.yzx, x0.xyz);
  float3 l = 1.0 - g;
  float3 i1 = min(g.xyz, l.zxy);
  float3 i2 = max(g.xyz, l.zxy);

  float3 x1 = x0 - i1 + C.xxx;
  float3 x2 = x0 - i2 + C.yyy;
  float3 x3 = x0 - D.yyy;

  i = mod289_3(i);
  float4 p = permute(permute(permute(
             i.z + float4(0.0, i1.z, i2.z, 1.0))
           + i.y + float4(0.0, i1.y, i2.y, 1.0))
           + i.x + float4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  float3 ns = n_ * D.wyz - D.xzx;

  float4 j = p - 49.0 * floor(p * ns.z * ns.z);

  float4 x_ = floor(j * ns.z);
  float4 y_ = floor(j - 7.0 * x_);

  float4 x = x_ * ns.x + ns.yyyy;
  float4 y = y_ * ns.x + ns.yyyy;
  float4 h = 1.0 - abs(x) - abs(y);

  float4 b0 = float4(x.xy, y.xy);
  float4 b1 = float4(x.zw, y.zw);

  float4 s0 = floor(b0) * 2.0 + 1.0;
  float4 s1 = floor(b1) * 2.0 + 1.0;
  float4 sh = -step(h, float4(0.0));

  float4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  float4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  float3 p0 = float3(a0.xy, h.x);
  float3 p1 = float3(a0.zw, h.y);
  float3 p2 = float3(a1.xy, h.z);
  float3 p3 = float3(a1.zw, h.w);

  float4 norm = taylorInvSqrt(float4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  float4 m = max(0.6 - float4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, float4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float clouds(float2 uv, float t) {
  uv += float2(t * 0.05, t * 0.01);
  float n =
    snoise(float3((uv + float2(50.0, 33.0))    * 3.0,  t * 0.5))  * 0.8 +
    snoise(float3( uv                          * 6.0,  t * 0.4))  * 0.4 +
    snoise(float3((uv + float2(-300.0, 50.0))  * 12.0, t * 0.1))  * 0.2 +
    snoise(float3((uv + float2(-100.0, 200.0)) * 24.0, t * 0.7))  * 0.1 +
    snoise(float3((uv + float2(400.0, -200.0)) * 48.0, t * 0.2))  * 0.05;
  return 0.5 * (n + 1.0);
}

half4 main(float2 fragCoord) {
  // Width-normalized uv giống reference (Shadertoy convention) — giữ tỉ
  // lệ aspect đúng để puff lớn không bị méo theo trục dọc.
  float2 uv = fragCoord / u_res.x;
  float2 center = u_center / u_res.x;

  float t = u_time * 0.001;
  float density = clouds(uv, t);

  // Brightness variation: vùng đậm/nhạt trong khói. Khoảng [0.55, 1.10]
  // → khói có texture 3D rõ ràng nhưng vẫn cover được layer bên dưới.
  float brightness = 0.55 + density * 0.55;
  float3 col = u_color * brightness;

  // Wispy boundary — dùng cloud density bend ranh giới radial. Vùng dày
  // (density > 0.5) lan ngoài bán kính, vùng loãng (< 0.5) co vào trong
  // → mép khói có wisps + gaps tự nhiên thay vì circle.
  float dist = distance(uv, center);
  float radiusN = u_radius / u_res.x;
  float wispyDist = dist + (density - 0.5) * radiusN * 0.55;

  float radialMask = 1.0 - smoothstep(radiusN * 0.5, radiusN * 1.0, wispyDist);
  float alpha = clamp(radialMask * u_opacity, 0.0, 1.0);
  return half4(col * alpha, alpha);
}
`;

const smokeEffect = Skia.RuntimeEffect.Make(SMOKE_SKSL);

interface LightningOptions {
  /**
   * Fire khi smoke đã phủ kín màn hình (~470ms) — caller gọi
   * `router.push(...)` tại đây để new screen mount BÊN DƯỚI khói opaque.
   * Khói tan dần sẽ reveal screen mới — không thấy slide animation.
   */
  onCovered?: () => void;
}

interface Ctx {
  strike: (opts?: LightningOptions) => void;
}

const LightningCtx = createContext<Ctx | null>(null);

export function useLightning(): Ctx {
  const c = useContext(LightningCtx);
  if (!c) throw new Error('LightningTransitionProvider missing in tree');
  return c;
}

interface Snapshot {
  paths: SkPath[];
}

function buildPath(points: Pt[]): SkPath {
  const p = Skia.Path.Make();
  if (points.length === 0) return p;
  p.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const pt = points[i]!;
    p.lineTo(pt.x, pt.y);
  }
  return p;
}

function buildSnapshot(bolts: Bolt[]): Snapshot {
  const paths: SkPath[] = [];
  bolts.forEach((b) => {
    paths.push(buildPath(b.main));
    b.branches.forEach((br) => paths.push(buildPath(br)));
  });
  return { paths };
}

/**
 * 5-layer paint stack: far halo blue-violet → outer glow → mid → inner ice-white
 * → hot white core. Gradient màu lạnh tạo cảm giác plasma điện.
 */
function GlowPath({
  path,
  progress,
}: {
  path: SkPath;
  progress: SharedValue<number>;
}) {
  const trimmed = useDerivedValue(() => {
    const t = progress.value;
    if (t <= 0) return Skia.Path.Make();
    const cp = path.copy();
    cp.trim(0, t, false);
    return cp;
  });

  return (
    <Group>
      <SkiaPath
        path={trimmed}
        style="stroke"
        strokeWidth={40}
        strokeCap="round"
        strokeJoin="round"
        color="rgba(96,128,200,0.18)"
      >
        <BlurMask blur={32} style="solid" />
      </SkiaPath>
      <SkiaPath
        path={trimmed}
        style="stroke"
        strokeWidth={22}
        strokeCap="round"
        strokeJoin="round"
        color="rgba(140,180,255,0.32)"
      >
        <BlurMask blur={18} style="solid" />
      </SkiaPath>
      <SkiaPath
        path={trimmed}
        style="stroke"
        strokeWidth={11}
        strokeCap="round"
        strokeJoin="round"
        color="rgba(180,210,255,0.55)"
      >
        <BlurMask blur={7} style="solid" />
      </SkiaPath>
      <SkiaPath
        path={trimmed}
        style="stroke"
        strokeWidth={4.5}
        strokeCap="round"
        strokeJoin="round"
        color="rgba(220,235,255,0.92)"
      >
        <BlurMask blur={2.5} style="solid" />
      </SkiaPath>
      <SkiaPath
        path={trimmed}
        style="stroke"
        strokeWidth={1.6}
        strokeCap="round"
        strokeJoin="round"
        color="white"
      >
        <BlurMask blur={0.5} style="solid" />
      </SkiaPath>
    </Group>
  );
}

export function LightningTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isDark } = useAppTheme();
  const clock = useClock();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const boltProgress = useSharedValue(0);
  const boltOpacity = useSharedValue(0);
  const flashWhite = useSharedValue(0);
  const flashDark = useSharedValue(0);
  const smokeRadius = useSharedValue(0);
  const smokeOpacity = useSharedValue(0);
  const targetX = useSharedValue(W / 2);
  const targetY = useSharedValue(H / 2);

  const stop = useCallback(() => setSnapshot(null), []);

  const strike = useCallback(
    (opts?: LightningOptions) => {
      // Khi user tắt animation: skip overlay, gọi onCovered ngay để
      // caller `router.push(...)` chạy → expo-router native stack lo slide.
      if (!getAnimationsEnabled()) {
        requestAnimationFrame(() => {
          opts?.onCovered?.();
        });
        return;
      }

      const seed = Math.floor(Math.random() * 0xffffff);
      const target: Pt = { x: W / 2, y: H / 2 };
      const bolts = generateImpactStrike(seed, W, target);
      setSnapshot(buildSnapshot(bolts));

      targetX.value = target.x;
      targetY.value = target.y;
      boltProgress.value = 0;
      boltOpacity.value = 0;
      flashWhite.value = 0;
      flashDark.value = 0;
      smokeRadius.value = 0;
      smokeOpacity.value = 0;

      // Light haptic ở 0ms (anticipation), Heavy ở 200ms (impact thật của bolt)
      hapticLight();
      setTimeout(hapticHeavy, 200);

      // Bolt: vẽ từ trên xuống tâm trong 200ms, hold 220ms, fade 380ms
      boltProgress.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
      boltOpacity.value = withSequence(
        withTiming(1, { duration: 35 }),
        withTiming(1, { duration: 220 }),
        withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }),
      );

      // Strobe trắng-đen xen kẽ. Cross-fade thay vì gap 0 ở giữa: khi white
      // descend thì dark ascend → cảm giác chớp liền mạch không có "frame
      // bình thường" lọt giữa các pulse.
      flashWhite.value = withSequence(
        withTiming(1.0, { duration: 35 }),
        withTiming(0, { duration: 50 }),
        withTiming(0.75, { duration: 50 }),
        withTiming(0, { duration: 50 }),
        withTiming(0.45, { duration: 50 }),
        withTiming(0, { duration: 100 }),
      );
      flashDark.value = withSequence(
        withTiming(0, { duration: 35 }),
        withTiming(0.7, { duration: 50 }),
        withTiming(0, { duration: 50 }),
        withTiming(0.5, { duration: 50 }),
        withTiming(0, { duration: 50 }),
        withTiming(0, { duration: 100 }),
      );

      // Smoke: bắt đầu 130ms (ngay trước impact bolt 200ms), expand 770ms
      // → opaque tại 820ms, hold 200ms để stack mount xong, fade 480ms.
      smokeRadius.value = withSequence(
        withTiming(0, { duration: 130 }),
        withTiming(MAX_SMOKE_RADIUS, {
          duration: 770,
          easing: Easing.out(Easing.cubic),
        }),
      );
      smokeOpacity.value = withSequence(
        withTiming(0, { duration: 130 }),
        withTiming(1, { duration: 690, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 480, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) runOnJS(stop)();
        }),
      );

      // Push tại 870ms (50ms sau smoke đạt opaque) → settings mount + fade
      // animation 300ms hoàn tất khoảng 1170ms khi smoke đang fade ở 0.7.
      // Khói tan dần reveal screen mới — không có jump cut.
      if (opts?.onCovered) {
        setTimeout(opts.onCovered, 870);
      }
    },
    [
      boltOpacity,
      boltProgress,
      flashDark,
      flashWhite,
      smokeOpacity,
      smokeRadius,
      stop,
      targetX,
      targetY,
    ],
  );

  const smokeColor = isDark ? hexToRgb(SMOKE_DARK) : hexToRgb(SMOKE_LIGHT);

  const uniforms = useDerivedValue(() => ({
    u_time: clock.value,
    u_res: [W, H] as [number, number],
    u_center: [targetX.value, targetY.value] as [number, number],
    u_radius: smokeRadius.value,
    u_opacity: smokeOpacity.value,
    u_color: smokeColor,
  }));

  const flashWhiteOp = useDerivedValue(() => flashWhite.value);
  const flashDarkOp = useDerivedValue(() => flashDark.value);
  const boltGroupOp = useDerivedValue(() => boltOpacity.value);

  return (
    <LightningCtx.Provider value={{ strike }}>
      {children}
      {snapshot ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.overlay]}
        >
          <Canvas style={StyleSheet.absoluteFill}>
            {/* Smoke layer (bottom) */}
            {smokeEffect ? (
              <Rect x={0} y={0} width={W} height={H}>
                <Shader source={smokeEffect} uniforms={uniforms} />
              </Rect>
            ) : null}

            {/* Bolts (above smoke — sét đâm xuyên qua khói) */}
            <Group opacity={boltGroupOp}>
              {snapshot.paths.map((p, i) => (
                <GlowPath key={i} path={p} progress={boltProgress} />
              ))}
            </Group>

            {/* Strobe white + dark (top — global illumination) */}
            <Rect
              x={0}
              y={0}
              width={W}
              height={H}
              color="white"
              opacity={flashWhiteOp}
            />
            <Rect
              x={0}
              y={0}
              width={W}
              height={H}
              color="black"
              opacity={flashDarkOp}
            />
          </Canvas>
        </Animated.View>
      ) : null}
    </LightningCtx.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 99999, elevation: 99 },
});
