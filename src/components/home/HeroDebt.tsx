import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AnimatedEntrance, AppText, GradientHero, Money } from '../ui';

interface HeroDebtProps {
  total: number;
}

export const HeroDebt = memo(function HeroDebt({ total }: HeroDebtProps) {
  const c = useAppTheme();

  const isSettled = total === 0;
  const isPositive = total > 0;

  let label: string;
  let tone: 'success' | 'danger' | undefined;
  let gradFrom: string;
  if (isSettled) {
    label = 'Đã thanh toán đầy đủ';
    tone = undefined;
    gradFrom = c.accentSoft;
  } else if (isPositive) {
    label = 'Bạn đang được nợ';
    tone = 'success';
    gradFrom = c.successSoft;
  } else {
    label = 'Bạn đang nợ';
    tone = 'danger';
    gradFrom = c.dangerSoft;
  }
  const gradTo = c.tint ?? c.surface;
  const footnote = isSettled ? 'Không còn khoản nào cần thanh toán' : 'trên tất cả các nhóm';

  return (
    <AnimatedEntrance delay={0}>
      <GradientHero fromColor={gradFrom} toColor={gradTo} style={styles.heroWrap}>
        <View style={styles.heroInner}>
          <AppText variant="label" tone="muted">
            {label}
          </AppText>
          <View style={styles.heroAmount}>
            <Money value={Math.abs(total)} variant="hero" tone={tone} animate />
          </View>
          <AppText variant="meta" tone="muted">
            {footnote}
          </AppText>
        </View>
      </GradientHero>
    </AnimatedEntrance>
  );
});

const styles = StyleSheet.create({
  heroWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  heroInner: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
  },
  heroAmount: {
    marginVertical: 2,
  },
});
