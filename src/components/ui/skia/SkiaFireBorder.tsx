import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { memo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { useAnimationsEnabled } from '../../../utils/userPreferences';

// Lửa BÁM VIỀN chip (ring-of-fire), không lan vào padding.
//
// - Compute Signed Distance Field (rounded rect) từ pixel tới biên chip.
// - Lửa chỉ tồn tại trong dải mỏng `thickness` quanh viền — fade nhanh ra ngoài.
// - Cắt sạch phía dưới đáy chip (`fragCoord.y > chipBottom` → alpha 0): lửa
//   không cháy xuống.
// - Cho phép leak nhẹ ~1.5px vào trong chip để flame liền lạc với border, không
//   tạo viền cứng — text vẫn đọc rõ vì leak rất mỏng.
const SKSL = `
uniform float u_time;
uniform float2 u_res;
uniform float2 u_chip;
uniform float2 u_chip_origin;
uniform float u_thickness;
uniform float u_radius;
uniform float u_intensity;

float hash(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
}

float noise2(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),                     hash(i + float2(1.0, 0.0)), u.x),
    mix(hash(i + float2(0.0, 1.0)),  hash(i + float2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 4; i++) {
    v += a * noise2(p);
    p *= 2.05;
    a *= 0.5;
  }
  return v;
}

// Signed distance to rounded rectangle. p = pixel relative to chip center.
float sdRoundedBox(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + float2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, float2(0.0))) - r;
}

half4 main(float2 fragCoord) {
  float2 chipCenter = u_chip_origin + u_chip * 0.5;
  float chipBottom  = u_chip_origin.y + u_chip.y;
  float2 halfChip   = u_chip * 0.5;
  float r = min(u_radius, min(halfChip.x, halfChip.y));
  float sdf = sdRoundedBox(fragCoord - chipCenter, halfChip, r);

  // Cắt phía dưới đáy chip: lửa không cháy xuống
  if (fragCoord.y > chipBottom + 0.5) {
    return half4(0.0);
  }

  // Border mask: mạnh ngay tại sdf = 0 (viền chip), fade nhanh ra ngoài (thickness)
  // và leak nhẹ ~1.5px vào trong (để liền lạc, không cứng cạnh).
  float innerLeak = 1.5;
  float borderMask;
  if (sdf >= 0.0) {
    borderMask = 1.0 - smoothstep(0.0, u_thickness, sdf);
  } else {
    borderMask = smoothstep(-innerLeak, 0.0, sdf);
  }
  if (borderMask <= 0.001) return half4(0.0);

  // FBM fire flow — pattern phải cuộn LÊN trên.
  // Skia Y-down: fragCoord.y tăng theo hướng xuống. Để pattern dịch lên (giảm y
  // theo thời gian), phase offset trong noise space phải DƯƠNG: pixel tại
  // y_screen tại time t đọc fbm(.., y_screen + t*v) → cùng giá trị fbm xuất hiện
  // tại y_screen = const − t*v, tức là y giảm dần ⇒ pattern dịch lên.
  float time = u_time * 0.001;
  float2 uv = fragCoord / u_res;
  float aspect = u_res.x / max(u_res.y, 1.0);
  float2 p = float2(uv.x * aspect, uv.y) * 5.0;
  float flow1 = fbm(p + float2(0.0, time * 2.4));
  float flow2 = fbm(p * 1.9 + float2(time * 0.5, time * 4.0));
  float flame = flow1 * 0.7 + flow2 * 0.45;

  // Vertical bias: flame MẠNH NHẤT ở đáy chip (nguồn lửa), mảnh dần lên trên.
  // altitude = khoảng cách (px) từ pixel tới đáy chip, > 0 vì đã cắt phía dưới.
  float altitude = chipBottom - fragCoord.y;
  float maxAltitude = u_chip.y + u_thickness;
  float h = clamp(altitude / max(maxAltitude, 1.0), 0.0, 1.0);
  float verticalBias = pow(1.0 - h, 0.6);

  float intensity = smoothstep(0.30, 0.92, flame) * verticalBias * borderMask * u_intensity;
  if (intensity <= 0.001) return half4(0.0);

  // Heat gradient: red → orange → yellow
  float3 deepRed   = float3(0.95, 0.10, 0.00);
  float3 orange    = float3(1.00, 0.55, 0.05);
  float3 yellowHot = float3(1.00, 0.92, 0.45);
  float3 col = mix(deepRed, orange, smoothstep(0.0, 0.55, intensity));
  col = mix(col, yellowHot, smoothstep(0.55, 1.0, intensity));

  float alpha = intensity;
  return half4(col * alpha, alpha);
}
`;

const effect = Skia.RuntimeEffect.Make(SKSL);

interface SkiaFireBorderProps {
  /** Độ dày dải lửa bám viền (px). */
  thickness?: number;
  /** 0..1 — flame intensity. */
  intensity?: number;
  /** Border radius của chip (default = pill). */
  cornerRadius?: number;
  children?: React.ReactNode;
  style?: ViewStyle;
}

export const SkiaFireBorder = memo(function SkiaFireBorder({
  thickness = 8,
  intensity = 1.0,
  cornerRadius,
  children,
  style,
}: SkiaFireBorderProps) {
  const clock = useClock();
  const [chip, setChip] = useState({ w: 0, h: 0 });
  const animationsEnabled = useAnimationsEnabled();

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== chip.w || height !== chip.h) setChip({ w: width, h: height });
  };

  // Canvas outset = thickness ở 3 phía (top + 2 bên), bottom flush với đáy chip
  const canvasW = chip.w + 2 * thickness;
  const canvasH = chip.h + thickness;
  const radius = cornerRadius ?? chip.h / 2;

  const uniforms = useDerivedValue(() => ({
    u_time: clock.value,
    u_res: [Math.max(1, canvasW), Math.max(1, canvasH)] as [number, number],
    u_chip: [Math.max(1, chip.w), Math.max(1, chip.h)] as [number, number],
    u_chip_origin: [thickness, thickness] as [number, number],
    u_thickness: thickness,
    u_radius: radius,
    u_intensity: intensity,
  }));

  return (
    <View style={[styles.wrap, style]} onLayout={onLayout}>
      {children}
      {animationsEnabled && effect && chip.w > 0 ? (
        <Canvas
          style={[
            styles.canvas,
            { top: -thickness, left: -thickness, width: canvasW, height: canvasH },
          ]}
          pointerEvents="none"
        >
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  canvas: {
    position: 'absolute',
  },
});
