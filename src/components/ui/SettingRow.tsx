import { Switch } from 'heroui-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';

interface SettingRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SettingRow({ label, hint, value, onValueChange }: SettingRowProps) {
  // Whole row là tap target — Switch để pointerEvents="none" làm visual,
  // Pressable RN drive toggle. Trước dùng RNGH Pressable cho gorhom
  // BottomSheet compatibility, nhưng SettingRow hiện chỉ dùng ở settings
  // ScrollView nên RN Pressable đủ + đỡ tốn 1 TapGestureHandler/row.
  return (
    <Pressable
      style={styles.row}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={styles.info}>
        <AppText variant="body" weight="medium">
          {label}
        </AppText>
        {hint ? (
          <AppText variant="meta" tone="muted" style={styles.hint}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <View pointerEvents="none">
        <Switch isSelected={value} onSelectedChange={onValueChange} />
      </View>
    </Pressable>
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
  hint: { marginTop: 2 },
});
