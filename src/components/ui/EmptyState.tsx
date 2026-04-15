import { Button } from 'heroui-native';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

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

export function EmptyState({ title, subtitle, icon: Icon, action }: EmptyStateProps) {
  const c = useAppTheme();

  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}>
      {Icon ? (
        <Icon size={48} color={c.muted} style={styles.icon} strokeWidth={1.5} />
      ) : null}
      <Text style={[styles.title, { color: c.foreground, opacity: 0.4 }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: c.foreground, opacity: 0.3 }]}>
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <Button variant="outline" size="sm" onPress={action.onPress} style={styles.action}>
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
  icon: {
    marginBottom: 12,
    opacity: 0.3,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  action: {
    marginTop: 16,
  },
});
