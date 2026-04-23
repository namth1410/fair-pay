import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { memo, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { hexToRgb } from './hexToRgb';

// Layered soft-light blobs trên nền base color.
// Không chia cho sum (tránh 0/0 = đen) — chỉ mix thêm lên base.
const SKSL = `
uniform float u_time;
uniform float2 u_res;
uniform float3 u_bg;
uniform float3 u_c0;
uniform float3 u_c1;
uniform float3 u_c2;
uniform float u_speed;

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float t = u_time * 0.001 * u_speed;

  float2 p0 = float2(0.28 + 0.26 * sin(t * 0.9),        0.32 + 0.28 * cos(t * 0.7));
  float2 p1 = float2(0.74 + 0.26 * sin(t * 0.6 + 1.3),  0.38 + 0.24 * cos(t * 0.8 + 2.1));
  float2 p2 = float2(0.50 + 0.30 * cos(t * 0.5 + 3.0),  0.72 + 0.24 * sin(t * 1.1 + 0.5));

  float w0 = smoothstep(0.75, 0.05, distance(uv, p0));
  float w1 = smoothstep(0.75, 0.05, distance(uv, p1));
  float w2 = smoothstep(0.75, 0.05, distance(uv, p2));

  float3 col = u_bg;
  col = mix(col, u_c0, w0 * 0.75);
  col = mix(col, u_c1, w1 * 0.65);
  col = mix(col, u_c2, w2 * 0.60);

  return half4(col, 1.0);
}
`;

const effect = Skia.RuntimeEffect.Make(SKSL);

interface SkiaMeshGradientProps {
  /** 3 màu blob overlay. */
  colors: [string, string, string];
  /** Màu nền base — vùng không có blob sẽ là màu này. */
  baseColor: string;
  speed?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export const SkiaMeshGradient = memo(function SkiaMeshGradient({
  colors,
  baseColor,
  speed = 0.5,
  style,
  children,
}: SkiaMeshGradientProps) {
  const clock = useClock();
  const [size, setSize] = useState({ w: 0, h: 0 });

  const rgb = useMemo(
    () => ({
      bg: hexToRgb(baseColor),
      c0: hexToRgb(colors[0]),
      c1: hexToRgb(colors[1]),
      c2: hexToRgb(colors[2]),
    }),
    [colors, baseColor],
  );

  const uniforms = useDerivedValue(() => ({
    u_time: clock.value,
    u_res: [Math.max(1, size.w), Math.max(1, size.h)] as [number, number],
    u_bg: rgb.bg,
    u_c0: rgb.c0,
    u_c1: rgb.c1,
    u_c2: rgb.c2,
    u_speed: speed,
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  return (
    <View style={[styles.wrap, { backgroundColor: baseColor }, style]} onLayout={onLayout}>
      {effect && size.w > 0 ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderRadius: 18,
  },
});
