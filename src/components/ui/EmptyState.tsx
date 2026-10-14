import { Button } from 'heroui-native';
import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from './AppText';

interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: EmptyStateAction;
}

// Quầng mềm sau icon: 1 vầng xanh linh vật (primarySoft) loang ra mép. Trước là 3 đốm
// pastel, trong đó đốm warmAccent — nay là xám chữ phụ — thành vệt xám sáng trên nền tối.
const Halo = memo(function Halo({ c }: { c: ReturnType<typeof useAppTheme> }) {
  return (
    <Svg width={140} height={140} viewBox="0 0 140 140" style={styles.halo}>
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor={c.primarySoft} stopOpacity={1} />
          <Stop offset="62%" stopColor={c.primarySoft} stopOpacity={0.85} />
          <Stop offset="100%" stopColor={c.primarySoft} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={70} cy={70} r={66} fill="url(#halo)" />
    </Svg>
  );
});

export function EmptyState({ title, subtitle, icon: Icon, action }: EmptyStateProps) {
  const c = useAppTheme();

  return (
    <View
      style={styles.container}
      accessibilityRole="text"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      <View style={styles.iconStage}>
        <Halo c={c} />
        {Icon ? (
          <View style={styles.iconWrap}>
            <Icon size={44} color={c.primaryStrong} strokeWidth={1.5} />
          </View>
        ) : null}
      </View>
      <AppText variant="subtitle" weight="semibold" center style={styles.title}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="caption" tone="muted" center style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
      {action ? (
        <Button variant="primary" size="sm" onPress={action.onPress} style={styles.action}>
          <Button.Label>{action.label}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 24,
  },
  iconStage: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  halo: {
    position: 'absolute',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 4,
  },
  subtitle: {
    marginTop: 4,
    maxWidth: 260,
  },
  action: {
    marginTop: 16,
  },
});
