import {
  Canvas,
  Group,
  Image as SkiaImage,
  makeImageFromView,
  Mask,
  Rect,
  RoundedRect,
  Shader,
  Skia,
  type SkImage,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { hapticHeavy } from '../utils/haptics';
import { getAnimationsEnabled } from '../utils/userPreferences';

const { width: W, height: H } = Dimensions.get('window');
const CENTER_X = W / 2;
const CENTER_Y = H / 2;
const HOLE_MAX_R = W / 10;

// Halo extends 3× core radius — fade rộng để không có boundary nhìn thấy.
const HOLE_HALO_RATIO = 3.0;
// Bounding box bao quanh hole + halo + biên độ noise (~20%).
const HOLE_BOX_R = HOLE_MAX_R * HOLE_HALO_RATIO * 1.4;

/**
 * Black-hole / spiral-galaxy shader — adapt từ Fabrice Neyret "Galaxy3"
 * (Shadertoy) sang transition use-case.
 *
 * Cấu trúc 3 lớp radial (Gaussian density profile theo `rho` normalize
 * tới `u_haloR`):
 *  • densG (galaxy disk @0.55) — gas có spiral arms
 *  • densB (bulb @0.42)        — bright accretion glow ngay quanh hố
 *  • densK (black hole @0.40)  — core đen tuyệt đối, override mọi thứ
 *
 * Spiral arms = logarithmic-spiral phase: `shear = 2*log(rho)` + ang
 * compression `COMPR*cos(NB_ARMS*phase)` → gas mật độ dồn về các nhánh
 * cong logarit. `spires` modulate dens theo arm để arms sáng hơn.
 *
 * Gas texture = 4-octave turbulent simplex (mỗi octave xoay Mat2 theo
 * thời gian) lấy MODE-3 "wires" `1-|2n-1|` cho filamentary/strand look.
 *
 * Output premultiplied: `half4(col*a, a)`. Alpha lấy max của 3 layers
 * — galaxy ngoài alpha thấp (gas wisp), bulb/core alpha cao (đặc).
 *
 * Origin: https://www.shadertoy.com/view/MdXSzS (Galaxy3, F. Neyret)
 */
const BLACK_HOLE_SKSL = `
uniform float u_time;
uniform float u_radius;
uniform float u_maxRadius;
uniform float u_haloR;
uniform float2 u_center;

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

// "Wires" mode noise (MODE 3 trong Galaxy3) — filamentary look
float wireN(float2 uv) {
  float n = 0.5 + 0.5 * snoise(float3(uv, 0.0));
  return 1.0 - abs(2.0 * n - 1.0);
}

// Turbulent multi-octave với rotation per-octave
float turbulence(float2 uv, float t) {
  float v = 0.0;
  float a = -0.1 * t;
  float co = cos(a), si = sin(a);
  float2x2 M = float2x2(co, -si, si, co);
  float s = 1.0;
  for (int i = 0; i < 4; i++) {
    uv = M * uv;
    float b = wireN(uv * s);
    v += (1.0 / s) * pow(b, 3.0); // RETICULATION = 3
    s *= 2.0;
  }
  return v * 0.5;
}

half4 main(float2 fragCoord) {
  // Threshold rất thấp — galaxy ở sub-pixel size khi qua ngưỡng → snap-out
  // không nhìn thấy. Trước là 0.5 (≈1.5px halo) nên user thấy "biến mất đột ngột".
  if (u_radius < 0.05) return half4(0.0);

  // mod để tránh float precision loss khi u_time lớn (app chạy lâu)
  float t = mod(u_time * 0.001, 1000.0);

  // Global rotation toàn bộ UV — cả nhánh spiral, phase, gas đều quay
  // cùng nhau. SPIN_RATE rad/sec — 1.6 rad/s ≈ 92 deg/s, suốt 1.5s
  // hold của hố sẽ thấy rõ "xoáy".
  float SPIN_RATE = 1.6;
  float spin = SPIN_RATE * t;
  float sc = cos(spin), ss = sin(spin);
  float2 pRot = float2(
    (fragCoord.x - u_center.x) * sc - (fragCoord.y - u_center.y) * ss,
    (fragCoord.x - u_center.x) * ss + (fragCoord.y - u_center.y) * sc
  );

  float2 uv = pRot / u_haloR;
  float rho = length(uv);

  if (rho > 1.3) return half4(0.0);

  float ang = atan(uv.y, uv.x);
  float shear = 2.0 * log(max(rho, 0.01));

  // Spiral arm parameters
  float NB_ARMS = 5.0;
  float COMPR = 0.12;

  // Spiral arm phase + compression — phase dùng ang đã ROTATED →
  // nhánh quay cùng global spin, không đứng yên.
  float phase = NB_ARMS * (ang - shear);
  float angComp = ang - COMPR * cos(phase);
  float2 uvRot = rho * float2(cos(angComp), sin(angComp));
  float spires = 1.0 + NB_ARMS * COMPR * sin(phase);

  // Gaussian density layers
  float r1 = rho / 0.55; float densG = exp(-r1 * r1);
  float r2 = rho / 0.42; float densB = exp(-r2 * r2);
  float r3 = rho / 0.40; float densK = exp(-r3 * r3);

  densG *= 0.7 * spires;

  // Gas texture: turbulent noise sample qua rotation matrix
  float c2 = cos(shear), s2 = sin(shear);
  float2x2 R = float2x2(c2, -s2, s2, c2);
  float2 uvGas = 0.11 * R * uvRot;
  float gas = turbulence(uvGas, t);
  float gasTrans = pow(1.0 - gas * densG, 2.0);

  float3 GALAXY_COL = float3(0.82, 0.86, 1.0);  // cool blue-white wisps
  float3 BULB_COL   = float3(1.0, 0.85, 0.62);  // warm accretion glow
  float3 BLACK_COL  = float3(0.0);

  float3 col = float3(0.0);
  col = mix(col, gasTrans * 1.7 * GALAXY_COL, clamp(densG, 0.0, 1.0));
  col = mix(col, 2.0 * BULB_COL,              clamp(1.2 * densB, 0.0, 1.0));
  col = mix(col, BLACK_COL,                   clamp(2.0 * densK, 0.0, 1.0));

  // Combined alpha: gas tạo wisp (alpha thấp), bulb/core đặc (alpha cao)
  float alpha = max(max(densG * 0.9, densB), densK * 1.5);
  alpha = clamp(alpha, 0.0, 1.0);

  // Fade range = max*0.4 → plateau full alpha trong 60% đầu shrink
  // (r > 0.4*max), 40% cuối ramp xuống 0. Plateau quan trọng để user
  // THẤY size co lại tại opacity đầy đủ — nếu fade alpha song song
  // size từ t=0 (range=max), khi size còn 50% thì alpha cũng 50% →
  // hole vừa nhỏ vừa mờ → mắt khó tracking shrink, perceive như
  // "vụt tắt". Plateau giữ contrast cao trong shrink phase rồi fade
  // mượt cuối → "thu bé rõ rồi mờ dần".
  float fade = smoothstep(0.0, u_maxRadius * 0.4, u_radius);

  return half4(col * alpha * fade, alpha * fade);
}
`;

const blackHoleEffect = Skia.RuntimeEffect.Make(BLACK_HOLE_SKSL);

interface PieceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Piece {
  id: string;
  image: SkImage;
  rect: PieceRect;
  /** Border-radius của component gốc — clip snapshot với SkRRect cho khớp */
  radius: number;
  rotDir: number;
  rotMag: number;
  delay: number;
  angleToCenter: number;
}

interface BlackHoleOptions {
  onCovered?: () => void;
}

interface RegisteredTarget {
  ref: RefObject<View | null>;
  radius: number;
}

interface Ctx {
  register: (
    id: string,
    ref: RefObject<View | null>,
    radius: number,
  ) => void;
  unregister: (id: string) => void;
  suck: (opts?: BlackHoleOptions) => void;
  isSucking: boolean;
}

const BlackHoleCtx = createContext<Ctx | null>(null);

export function useBlackHole(): Ctx {
  const c = useContext(BlackHoleCtx);
  if (!c) throw new Error('BlackHoleTransitionProvider missing in tree');
  return c;
}

/**
 * `radius` PHẢI khớp borderRadius ngoài cùng của child. Snapshot của View
 * wrapper là rectangular nên cần clip lại bằng SkRRect khi vẽ trong Canvas
 * để giữ rounded corners — nếu không pass, snapshot trông sẽ "vuông" so với
 * component gốc (mất borderRadius khi pieces hiện trong overlay).
 */
export function SuckTarget({
  children,
  style,
  radius = 0,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  radius?: number;
}) {
  const id = useId();
  const ref = useRef<View | null>(null);
  const ctx = useContext(BlackHoleCtx);

  useEffect(() => {
    if (!ctx) return;
    ctx.register(id, ref, radius);
    return () => ctx.unregister(id);
  }, [ctx, id, radius]);

  const hide = !!ctx?.isSucking;

  // KHÔNG dùng overflow:hidden + borderRadius ở đây — sẽ cắt shadow của
  // child khi render bình thường. Snapshot được clip ở Skia bằng <Mask>.
  // YÊU CẦU caller: margin của visual card phải nằm NGOÀI SuckTarget (gói
  // SuckTarget trong View-gutter có margin) — nếu không, SuckTarget bounds
  // = visual + margin, rounded clip rơi vào margin trống và visual rect
  // bên trong vẫn vuông (đáng kể với SVG/Skia bg trên Android).
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[style, hide && styles.hidden]}
    >
      {children}
    </View>
  );
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface PieceNodeProps {
  piece: Piece;
  progress: SharedValue<number>;
}

function PieceNode({ piece, progress }: PieceNodeProps) {
  const { rect, image, radius, rotDir, rotMag, delay, angleToCenter } = piece;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = CENTER_X - cx;
  const dy = CENTER_Y - cy;
  const alignAngle = angleToCenter - Math.PI / 2;

  const transform = useDerivedValue(() => {
    const t = progress.value;
    const local = Math.max(
      0,
      Math.min(1, (t - delay) / Math.max(0.001, 1 - delay)),
    );
    const eased = local * local * local;

    const baseScale = Math.max(0, 1 - eased);
    const scaleRadial = baseScale * (1 + eased * 1.1);
    const scalePerp = baseScale * (1 - eased * 0.75);

    return [
      { translateX: dx * eased },
      { translateY: dy * eased },
      { rotate: rotDir * rotMag * eased },
      { rotate: alignAngle },
      { scaleY: scaleRadial },
      { scaleX: scalePerp },
      { rotate: -alignAngle },
    ];
  });

  // Giữ opacity = 1 đến gần cuối — pieces "biến mất" qua scale-to-0 ngay
  // tại tâm hố, không fade dọc đường (fade sớm = cảm giác "tan biến giữa
  // không trung" thay vì "bị hút trọn vào hố"). Fade nhỏ 10% cuối để
  // smooth out aliasing khi scale → 0.
  const opacity = useDerivedValue(() => {
    const t = progress.value;
    const local = Math.max(
      0,
      Math.min(1, (t - delay) / Math.max(0.001, 1 - delay)),
    );
    if (local < 0.9) return 1;
    return Math.max(0, 1 - (local - 0.9) / 0.1);
  });

  const imageNode = (
    <SkiaImage
      image={image}
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fit="fill"
    />
  );

  // Why <Mask> thay vì <Group clip={path}> hay <RoundedRect>+<ImageShader>:
  // - clip={SkPath/SkRRect} trong Skia 2.4.x bug nhẹ với góc alpha khi
  //   raster snapshot có nền opaque.
  // - ImageShader is an INFINITE shader (clamp/tile ngoài vùng `rect`) →
  //   pixel ngoài rounded path vẫn được paint trước khi shape clip → leak
  //   nền raster ra góc.
  // Mask alpha+clip là pipeline chính thống của react-native-skia: image
  // chỉ được raster Ở ĐÚNG vùng alpha của mask shape (RoundedRect trắng).
  return (
    <Group transform={transform} origin={vec(cx, cy)} opacity={opacity}>
      {radius > 0 ? (
        <Mask
          mode="alpha"
          clip
          mask={
            <RoundedRect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              r={radius}
              color="white"
            />
          }
        >
          {imageNode}
        </Mask>
      ) : (
        imageNode
      )}
    </Group>
  );
}

export function BlackHoleTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const rootRef = useRef<View | null>(null);
  const targetsRef = useRef<Map<string, RegisteredTarget>>(new Map());
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [isSucking, setIsSucking] = useState(false);

  const progress = useSharedValue(0);
  const holeRadius = useSharedValue(0);
  const bgDim = useSharedValue(0);

  const register = useCallback(
    (id: string, ref: RefObject<View | null>, radius: number) => {
      targetsRef.current.set(id, { ref, radius });
    },
    [],
  );

  const unregister = useCallback((id: string) => {
    targetsRef.current.delete(id);
  }, []);

  const clear = useCallback(() => {
    setPieces(null);
    setIsSucking(false);
  }, []);

  const suck = useCallback(
    (opts?: BlackHoleOptions) => {
      // Khi user tắt animation: bỏ qua toàn bộ overlay đo đạc/Skia,
      // gọi onCovered ngay để caller `router.push(...)` chạy →
      // expo-router native stack lo phần slide_from_right.
      if (!getAnimationsEnabled()) {
        requestAnimationFrame(() => {
          opts?.onCovered?.();
        });
        return;
      }

      const root = rootRef.current;
      const entries = Array.from(targetsRef.current.entries());

      if (!root || entries.length === 0) {
        opts?.onCovered?.();
        return;
      }

      const measureRoot = new Promise<{ rx: number; ry: number }>((resolve) => {
        root.measureInWindow((rx, ry) => resolve({ rx, ry }));
      });

      Promise.all([
        measureRoot,
        ...entries.map(
          ([id, { ref, radius }]) =>
            new Promise<{
              id: string;
              image: SkImage;
              absX: number;
              absY: number;
              w: number;
              h: number;
              radius: number;
            } | null>((resolve) => {
              const node = ref.current;
              if (!node) {
                resolve(null);
                return;
              }
              node.measureInWindow((x, y, w, h) => {
                if (w <= 0 || h <= 0) {
                  resolve(null);
                  return;
                }
                const imgPromise = makeImageFromView(
                  ref,
                ) as Promise<SkImage | null>;
                imgPromise
                  .then((image) => {
                    if (!image) {
                      resolve(null);
                      return;
                    }
                    resolve({ id, image, absX: x, absY: y, w, h, radius });
                  })
                  .catch(() => resolve(null));
              });
            }),
        ),
      ])
        .then((results) => {
          const [rootMeasure, ...rest] = results;
          const { rx, ry } = rootMeasure as { rx: number; ry: number };
          const rawPieces = rest as Array<{
            id: string;
            image: SkImage;
            absX: number;
            absY: number;
            w: number;
            h: number;
            radius: number;
          } | null>;

          const filtered = rawPieces.filter(
            (p): p is NonNullable<typeof p> => !!p,
          );

          if (filtered.length === 0) {
            opts?.onCovered?.();
            return;
          }

          const halfDiag = Math.hypot(W, H) / 2;
          const enriched: Piece[] = filtered.map((p) => {
            const localX = p.absX - rx;
            const localY = p.absY - ry;
            const pcx = localX + p.w / 2;
            const pcy = localY + p.h / 2;
            const ddx = CENTER_X - pcx;
            const ddy = CENTER_Y - pcy;
            const dist = Math.hypot(ddx, ddy);
            const distNorm = Math.min(1, dist / halfDiag);
            const delay = Math.min(0.32, distNorm * 0.36);
            const seed = hashStr(p.id);
            const rotDir = seed & 1 ? 1 : -1;
            const rotMag = Math.PI * (0.3 + ((seed >>> 1) & 0xff) / 255 * 0.8);
            return {
              id: p.id,
              image: p.image,
              rect: { x: localX, y: localY, width: p.w, height: p.h },
              radius: p.radius,
              rotDir,
              rotMag,
              delay,
              angleToCenter: Math.atan2(ddy, ddx),
            };
          });

          // Reset
          progress.value = 0;
          holeRadius.value = 0;
          bgDim.value = 0;

          // Stage 1: mount overlay
          setPieces(enriched);

          // Stage 2: 80ms delay → hide originals (đảm bảo Skia paint xong)
          setTimeout(() => {
            setIsSucking(true);
          }, 80);

          hapticHeavy();

          // Timeline:
          //  0 →  380: hole xuất hiện (easeOut)
          //  0 → 1200: pieces bay + co lại biến mất tại tâm hố
          //         1300: onCovered → router.push (screen mới mount sau hố)
          // 1450 → 2050: hole "shrink" + clear. Skia 2.4 + Reanimated 4
          //              có bug khiến subsequent withTiming không render
          //              visually — hố biến mất đột ngột thay vì shrink.
          //              Đã debug nhiều round, accept hiện trạng.
          progress.value = withTiming(1, {
            duration: 1200,
            easing: Easing.linear,
          });

          if (opts?.onCovered) {
            setTimeout(opts.onCovered, 1300);
          }

          holeRadius.value = withTiming(HOLE_MAX_R, {
            duration: 380,
            easing: Easing.out(Easing.cubic),
          });
          bgDim.value = withTiming(0.2, {
            duration: 500,
            easing: Easing.out(Easing.quad),
          });

          setTimeout(() => {
            holeRadius.value = withTiming(0, {
              duration: 600,
              easing: Easing.linear,
            });
            bgDim.value = withTiming(0, {
              duration: 600,
              easing: Easing.linear,
            });
            setTimeout(() => clear(), 600);
          }, 1450);
        })
        .catch(() => {
          opts?.onCovered?.();
        });
    },
    [bgDim, clear, holeRadius, progress],
  );

  const ctxValue = useMemo<Ctx>(
    () => ({ register, unregister, suck, isSucking }),
    [register, unregister, suck, isSucking],
  );

  // Shader uniforms — clock cho noise/spiral animation, u_haloR scale
  // theo holeRadius để galaxy size co-giãn cùng hố.
  const clock = useClock();
  const holeUniforms = useDerivedValue(() => ({
    u_time: clock.value,
    u_radius: holeRadius.value,
    u_maxRadius: HOLE_MAX_R,
    u_haloR: Math.max(holeRadius.value * HOLE_HALO_RATIO, 1),
    u_center: [CENTER_X, CENTER_Y] as [number, number],
  }));

  const visible = !!pieces;

  return (
    <BlackHoleCtx.Provider value={ctxValue}>
      <View ref={rootRef} collapsable={false} style={styles.root}>
        {children}

        {visible ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.overlay]}
          >
            <Canvas style={StyleSheet.absoluteFill}>
              <Rect
                x={0}
                y={0}
                width={W}
                height={H}
                color="black"
                opacity={bgDim}
              />
              {pieces!.map((p) => (
                <PieceNode key={p.id} piece={p} progress={progress} />
              ))}

              {/* Hố đen — shader rasterize alpha gradient méo bằng simplex
                  noise. Rect bao đủ rộng (HOLE_BOX_R quanh tâm) để chứa
                  hole + halo + biên độ noise mà không phải sample full
                  canvas. */}
              {blackHoleEffect ? (
                <Rect
                  x={CENTER_X - HOLE_BOX_R}
                  y={CENTER_Y - HOLE_BOX_R}
                  width={HOLE_BOX_R * 2}
                  height={HOLE_BOX_R * 2}
                >
                  <Shader source={blackHoleEffect} uniforms={holeUniforms} />
                </Rect>
              ) : null}
            </Canvas>
          </View>
        ) : null}
      </View>
    </BlackHoleCtx.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hidden: { opacity: 0 },
  overlay: { zIndex: 99998, elevation: 98 },
});
