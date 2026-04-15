import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';

interface AppCardProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  trailing?: React.ReactNode;
  borderLeft?: { width: number; color: string };
}

export function AppCard({
  title,
  subtitle,
  onPress,
  onLongPress,
  trailing,
  borderLeft,
}: AppCardProps) {
  const c = useAppTheme();

  const Wrapper = onPress || onLongPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress || onLongPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={[
        styles.card,
        { backgroundColor: c.surface },
        borderLeft && { borderLeftWidth: borderLeft.width, borderLeftColor: borderLeft.color },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: c.muted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
  },
  content: { flex: 1 },
  title: { fontSize: 15, fontWeight: '500', fontFamily: fonts.medium },
  subtitle: { fontSize: 12, marginTop: 2 },
});
