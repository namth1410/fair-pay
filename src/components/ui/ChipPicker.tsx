import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from './AppText';

interface ChipOption<T extends string = string> {
  key: T;
  label: string;
}

interface ChipPickerProps<T extends string = string> {
  options: ChipOption<T>[];
  selected: T;
  onSelect: (key: T) => void;
  activeColor?: string;
  activeSoft?: string;
}

export function ChipPicker<T extends string = string>({
  options,
  selected,
  onSelect,
  activeColor,
  activeSoft,
}: ChipPickerProps<T>) {
  const c = useAppTheme();
  const active = activeColor || c.primaryStrong;
  const activeBg = activeSoft || c.accentSoft;

  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const isSelected = opt.key === selected;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={opt.label}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? activeBg : 'transparent',
                borderColor: isSelected ? active : c.divider,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight={isSelected ? 'semibold' : 'medium'}
              style={{ color: isSelected ? active : c.muted }}
            >
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
});
