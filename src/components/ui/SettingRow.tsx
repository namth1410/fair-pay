import { StyleSheet, Switch, Text, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';

interface SettingRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SettingRow({ label, hint, value, onValueChange }: SettingRowProps) {
  const c = useAppTheme();

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={[styles.label, { color: c.foreground }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.hint, { color: c.muted }]}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: c.divider, true: c.primary + '80' }}
        thumbColor={value ? c.primary : c.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  info: { flex: 1, marginRight: 12 },
  label: { fontSize: 15, fontWeight: '500', fontFamily: fonts.medium },
  hint: { fontSize: 12, marginTop: 2 },
});
