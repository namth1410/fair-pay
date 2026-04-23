import { Canvas, Group, RoundedRect, useClock } from '@shopify/react-native-skia';
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

const PARTICLE_COUNT = 52;
const LIFETIME_MS = 2400;
const GRAVITY = 900; // px/s^2

interface Particle {
  angle: number;
  speed: number;
  rot0: number;
  rotSpeed: number;
  color: string;
  w: number;
  h: number;
  driftX: number;
}

export interface SkiaConfettiBurstHandle {
  fire: (origin?: { x: number; y: number }) => void;
}

interface SkiaConfettiBurstProps {
  colors: string[];
}

export const SkiaConfettiBurst = memo(
  forwardRef<SkiaConfettiBurstHandle, SkiaConfettiBurstProps>(function SkiaConfettiBurst(
    { colors },
    ref,
  ) {
    const clock = useClock();
    const startTime = useSharedValue<number>(-1);
    const originX = useSharedValue(0);
    const originY = useSharedValue(0);
    const sizeRef = useRef({ w: 0, h: 0 });

    const particles = useMemo<Particle[]>(() => {
      const list: Particle[] = [];
      const palette = colors.length > 0 ? colors : ['#F9A8D4'];
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
        list.push({
          angle,
          speed: 280 + Math.random() * 260,
          rot0: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 10,
          color: palette[i % palette.length] ?? '#F9A8D4',
          w: 6 + Math.random() * 6,
          h: 10 + Math.random() * 8,
          driftX: (Math.random() - 0.5) * 60,
        });
      }
      return list;
    }, [colors]);

    useImperativeHandle(ref, () => ({
      fire: (origin) => {
        const o = origin ?? {
          x: sizeRef.current.w / 2,
          y: sizeRef.current.h / 2,
        };
        originX.value = o.x;
        originY.value = o.y;
        startTime.value = clock.value;
      },
    }));

    return (
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onLayout={(e) => {
          sizeRef.current = {
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          };
        }}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          {particles.map((p, i) => (
            <ConfettiPiece
              key={i}
              clock={clock}
              startTime={startTime}
              originX={originX}
              originY={originY}
              particle={p}
            />
          ))}
        </Canvas>
      </View>
    );
  }),
);

interface PieceProps {
  clock: ReturnType<typeof useClock>;
  startTime: ReturnType<typeof useSharedValue<number>>;
  originX: ReturnType<typeof useSharedValue<number>>;
  originY: ReturnType<typeof useSharedValue<number>>;
  particle: Particle;
}

const ConfettiPiece = memo(function ConfettiPiece({
  clock,
  startTime,
  originX,
  originY,
  particle,
}: PieceProps) {
  const { angle, speed, rot0, rotSpeed, color, w, h, driftX } = particle;

  const progress = useDerivedValue(() => {
    if (startTime.value < 0) return -1;
    const t = (clock.value - startTime.value) / 1000;
    if (t < 0 || t > LIFETIME_MS / 1000) return -1;
    return t;
  });

  const transform = useDerivedValue(() => {
    const t = progress.value;
    if (t < 0) return [{ translateX: -9999 }, { translateY: -9999 }];
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const x = originX.value + vx * t + driftX * t;
    const y = originY.value + vy * t + 0.5 * GRAVITY * t * t;
    const rot = rot0 + rotSpeed * t;
    return [{ translateX: x }, { translateY: y }, { rotate: rot }];
  });

  const opacity = useDerivedValue(() => {
    const t = progress.value;
    if (t < 0) return 0;
    // fade-in nhanh 0.15s, sau đó fade-out tuyến tính
    const fadeIn = Math.min(1, t / 0.15);
    const fadeOut = 1 - Math.max(0, (t - 0.4) / (LIFETIME_MS / 1000 - 0.4));
    return Math.max(0, fadeIn * fadeOut);
  });

  return (
    <Group transform={transform} opacity={opacity}>
      <RoundedRect x={-w / 2} y={-h / 2} width={w} height={h} r={1.5} color={color} />
    </Group>
  );
});
