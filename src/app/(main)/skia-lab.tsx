import { Stack } from 'expo-router';
import { Button } from 'heroui-native';
import { Sparkles } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  SkiaBalanceRing,
  SkiaBreathingHalo,
  SkiaConfettiBurst,
  type SkiaConfettiBurstHandle,
  SkiaMeshGradient,
  SkiaShimmerCard,
} from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function SkiaLabScreen() {
  const c = useAppTheme();
  const confettiRef = useRef<SkiaConfettiBurstHandle>(null);
  const [ringProgress, setRingProgress] = useState(0.72);

  const fireConfetti = () => {
    confettiRef.current?.fire();
  };

  const reloadRing = () => {
    const next = Math.round(Math.random() * 100) / 100;
    setRingProgress(next);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Skia Lab' }} />
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Section title="Mesh gradient (SkSL shader)">
            <SkiaMeshGradient
              baseColor={c.tint}
              colors={[c.primary, c.primarySoft, c.warmAccent]}
              speed={0.5}
              style={styles.heroLg}
            >
              <View style={styles.heroInner}>
                <AppText variant="title" tone="inverse">
                  Sakura in motion
                </AppText>
                <AppText variant="caption" tone="inverse">
                  3 blob chuyển động real-time — 60fps trên flagship
                </AppText>
              </View>
            </SkiaMeshGradient>
          </Section>

          <Section title="Shimmer skeleton">
            <View style={[styles.cardPad, { backgroundColor: c.surface, borderColor: c.divider }]}>
              <SkiaShimmerCard
                width={280}
                height={64}
                borderRadius={14}
                baseColor={c.surfaceAlt}
                highlightColor={c.primarySoft}
              />
              <View style={{ height: 12 }} />
              <SkiaShimmerCard
                width={280}
                height={64}
                borderRadius={14}
                baseColor={c.surfaceAlt}
                highlightColor={c.primarySoft}
              />
            </View>
          </Section>

          <Section title="Breathing halo (tap để boost)">
            <View style={[styles.cardPad, { backgroundColor: c.surface, borderColor: c.divider }]}>
              <View style={styles.haloRow}>
                <SkiaBreathingHalo
                  size={160}
                  colors={[c.primarySoft, c.warmAccent, c.accentSoft]}
                  interactive
                >
                  <Sparkles size={44} color={c.primaryStrong} strokeWidth={1.5} />
                </SkiaBreathingHalo>
              </View>
              <AppText variant="caption" tone="muted" center>
                Tap vào halo để thấy pulse boost
              </AppText>
            </View>
          </Section>

          <Section title="Balance ring">
            <View style={[styles.cardPad, { backgroundColor: c.surface, borderColor: c.divider }]}>
              <View style={styles.ringRow}>
                <SkiaBalanceRing
                  size={110}
                  thickness={10}
                  progress={ringProgress}
                  tone="positive"
                  label={`${Math.round(ringProgress * 100)}%`}
                />
                <SkiaBalanceRing
                  size={110}
                  thickness={10}
                  progress={Math.max(0, 1 - ringProgress)}
                  tone="negative"
                  label={`${Math.round((1 - ringProgress) * 100)}%`}
                />
                <SkiaBalanceRing
                  size={110}
                  thickness={10}
                  progress={0.45}
                  tone="neutral"
                  label="45%"
                />
              </View>
              <Button variant="secondary" size="sm" onPress={reloadRing}>
                <Button.Label>Randomize</Button.Label>
              </Button>
            </View>
          </Section>

          <Section title="Confetti burst">
            <View style={[styles.cardPad, { backgroundColor: c.surface, borderColor: c.divider }]}>
              <AppText variant="caption" tone="muted" center>
                Bắn pháo hoa từ giữa màn hình
              </AppText>
              <View style={{ height: 12 }} />
              <Button variant="primary" onPress={fireConfetti}>
                <Button.Label>Celebrate</Button.Label>
              </Button>
            </View>
          </Section>

          <View style={{ height: 40 }} />
        </ScrollView>

        <SkiaConfettiBurst
          ref={confettiRef}
          colors={[c.primary, c.primaryStrong, c.warmAccent, c.success, c.accentSoft]}
        />
      </View>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label" tone="muted" style={styles.sectionLabel}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    marginBottom: 10,
  },
  heroLg: {
    height: 180,
    borderRadius: 22,
    justifyContent: 'flex-end',
  },
  heroInner: {
    padding: 20,
  },
  cardPad: {
    padding: 16,
    gap: 8,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  haloRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 12,
  },
});
