import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

interface ChipOption<T extends string = string> {
  key: T;
  label: string;
}

interface ChipPickerProps<T extends string = string> {
  options: ChipOption<T>[];
  selected: T;
  onSelect: (key: T) => void;
  activeColor?: string;
}

export function ChipPicker<T extends string = string>({
  options,
  selected,
  onSelect,
  activeColor,
}: ChipPickerProps<T>) {
  const c = useAppTheme();
  const active = activeColor || c.primary;

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
                backgroundColor: isSelected ? active : 'transparent',
                borderColor: isSelected ? active : c.divider,
              },
            ]}
          >
            <Text
              style={{
                color: isSelected ? '#FFFFFF' : c.muted,
                fontSize: 12,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
});
