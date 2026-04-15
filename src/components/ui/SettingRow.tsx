import { Switch } from 'heroui-native';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { AppText } from './AppText';

interface SettingRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SettingRow({ label, hint, value, onValueChange }: SettingRowProps) {
  // Whole row is the tap target — heroui Switch doesn't reliably receive
  // taps when nested inside @gorhom BottomSheetScrollView (gesture-handler
  // intercepts). The Switch becomes a visual indicator (pointerEvents="none")
  // and a single Pressable from react-native-gesture-handler drives the toggle.
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
