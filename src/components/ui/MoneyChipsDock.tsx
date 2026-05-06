import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { useAppTheme } from '../../hooks/useAppTheme';
import { computeMoneySuggestions, formatThousands } from '../../utils/format';
import { AppText } from './AppText';

interface MoneyChipsDockProps {
  /** Chỉ hiện khi input tiền đang focus (consumer track qua onFocus/onBlur). */
  visible: boolean;
  /** Raw digit string của input tiền. */
  amountStr: string;
  /** Pick callback — set raw digit string. */
  onPick: (amount: number) => void;
}

export function MoneyChipsDock({ visible, amountStr, onPick }: MoneyChipsDockProps) {
  const c = useAppTheme();
  const suggestions = useMemo(() => computeMoneySuggestions(amountStr), [amountStr]);
  if (!visible || suggestions.length === 0) return null;

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.dock}>
      <View
        style={[
          styles.wrap,
          { backgroundColor: c.background, borderTopColor: c.divider },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.row}
        >
          {suggestions.map((amount) => (
            <Pressable
              key={amount}
              onPress={() => onPick(amount)}
              accessibilityRole="button"
              accessibilityLabel={`Chọn ${formatThousands(amount)} đồng`}
              style={[
                styles.chip,
                { backgroundColor: c.accentSoft, borderColor: c.divider },
              ]}
            >
              <AppText
                variant="caption"
                weight="semibold"
                style={{ color: c.primaryStrong }}
              >
                {formatThousands(amount)}đ
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  wrap: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
});
