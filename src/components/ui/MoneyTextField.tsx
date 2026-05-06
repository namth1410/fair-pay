import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import {
  computeMoneySuggestions,
  DEFAULT_MONEY_SUGGESTIONS,
  formatThousands,
  parseMoneyInput,
} from '../../utils/format';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';

interface MoneyTextFieldProps {
  label?: string;
  placeholder?: string;
  /** Raw digit string, e.g. "150000". Component handles display formatting. */
  value: string;
  /** Receives raw digit string with non-digits stripped. */
  onChangeText: (raw: string) => void;
  error?: string;
  showSuggestions?: boolean;
  defaultSuggestions?: number[];
  autoFocus?: boolean;
  returnKeyType?: 'done' | 'next' | 'search' | 'go' | 'send';
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  accessibilityLabel?: string;
}

export function MoneyTextField({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  showSuggestions = true,
  defaultSuggestions = DEFAULT_MONEY_SUGGESTIONS,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  onFocus,
  onBlur,
  accessibilityLabel,
}: MoneyTextFieldProps) {
  const c = useAppTheme();

  const display = useMemo(() => formatThousands(value), [value]);

  const suggestions = useMemo(
    () => computeMoneySuggestions(value, defaultSuggestions),
    [value, defaultSuggestions],
  );

  const handleChange = (text: string) => {
    onChangeText(parseMoneyInput(text));
  };

  const handlePickSuggestion = (amount: number) => {
    onChangeText(String(amount));
  };

  return (
    <View style={styles.container}>
      <AppTextField
        label={label}
        placeholder={placeholder}
        value={display}
        onChangeText={handleChange}
        error={error}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={onFocus}
        onBlur={onBlur}
        accessibilityLabel={accessibilityLabel}
      />
      {showSuggestions && suggestions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {suggestions.map((amount) => (
            <Pressable
              key={amount}
              onPress={() => handlePickSuggestion(amount)}
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  chipRow: { gap: 6, paddingVertical: 2, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
});
