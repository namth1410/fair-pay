import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { memo, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

// Star Nest by Pablo Roman Andrioli — MIT. Ported from Shadertoy to SkSL.
const buildShader = (iter: number, steps: number) => `
uniform float2 u_res;
uniform float u_time;
uniform float2 u_mouse;

const int ITER = ${iter};
const int STEPS = ${steps};
const float formuparam = 0.53;
const float stepsize = 0.1;
const float zoom = 0.8;
const float tile = 0.85;
const float brightness = 0.0015;
const float darkmatter = 0.3;
const float distfading = 0.73;
const float saturation = 0.85;

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res - 0.5;
  uv.y *= u_res.y / u_res.x;
  float3 dir = float3(uv * zoom, 1.0);
  float time = u_time * 0.001 * 0.01 + 0.25;

  float a1 = 0.5 + u_mouse.x * 2.0;
  float a2 = 0.8 + u_mouse.y * 2.0;
  float2x2 rot1 = float2x2(cos(a1), sin(a1), -sin(a1), cos(a1));
  float2x2 rot2 = float2x2(cos(a2), sin(a2), -sin(a2), cos(a2));
  dir.xz = dir.xz * rot1;
  dir.xy = dir.xy * rot2;

  float3 from = float3(1.0, 0.5, 0.5);
  from += float3(time * 2.0, time, -2.0);
  from.xz = from.xz * rot1;
  from.xy = from.xy * rot2;

  float s = 0.1;
  float fade = 1.0;
  float3 v = float3(0.0);
  for (int r = 0; r < STEPS; r++) {
    float3 p = from + s * dir * 0.5;
    p = abs(float3(tile) - mod(p, float3(tile * 2.0)));
    float pa = 0.0;
    float a = 0.0;
    for (int i = 0; i < ITER; i++) {
      p = abs(p) / dot(p, p) - formuparam;
      a += abs(length(p) - pa);
      pa = length(p);
    }
    float dm = max(0.0, darkmatter - a * a * 0.001);
    a = a * a * a;
    if (r > 6) fade *= 1.0 - dm;
    v += float3(fade);
    v += float3(s, s * s, s * s * s * s) * a * brightness * fade;
    fade *= distfading;
    s += stepsize;
  }
  v = mix(float3(length(v)), v, saturation);
  return half4(half3(v * 0.01), 1.0);
}
`;

const EFFECTS = {
  low: Skia.RuntimeEffect.Make(buildShader(10, 12)),
  medium: Skia.RuntimeEffect.Make(buildShader(14, 16)),
  high: Skia.RuntimeEffect.Make(buildShader(17, 20)),
};

type Quality = 'low' | 'medium' | 'high';

interface SkiaStarNestProps {
  /** Góc quan sát, normalized [0..1]. Bỏ qua khi `interactive=true`. */
  mouse?: [number, number];
  /** Hệ số tốc độ bay. 1 = gốc. */
  speedFactor?: number;
  /** low 10×12, medium 14×16, high 17×20 (gốc). Default 'high'. */
  quality?: Quality;
  /** Cho phép kéo ngón tay để xoay góc nhìn. */
  interactive?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export const SkiaStarNest = memo(function SkiaStarNest({
  mouse = [0, 0],
  speedFactor = 1,
  quality = 'high',
  interactive = false,
  style,
  children,
}: SkiaStarNestProps) {
  const clock = useClock();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const mx = useSharedValue(mouse[0]);
  const my = useSharedValue(mouse[1]);

  const uniforms = useDerivedValue(() => ({
    u_res: [Math.max(1, size.w), Math.max(1, size.h)] as [number, number],
    u_time: clock.value * speedFactor,
    u_mouse: (interactive ? [mx.value, my.value] : mouse) as [number, number],
  }));

  const pan = useMemo(
    () =>
      Gesture.Pan().onUpdate((e) => {
        'worklet';
        if (size.w > 0 && size.h > 0) {
          mx.value = Math.max(0, Math.min(1, e.x / size.w));
          my.value = Math.max(0, Math.min(1, e.y / size.h));
        }
      }),
    [size, mx, my],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const effect = EFFECTS[quality];

  const content = (
    <View style={[styles.wrap, style]} onLayout={onLayout}>
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

  return interactive ? <GestureDetector gesture={pan}>{content}</GestureDetector> : content;
});

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});
