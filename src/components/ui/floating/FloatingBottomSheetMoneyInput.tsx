import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import CircleX from 'lucide-react-native/dist/esm/icons/circle-x';
import { type ComponentRef, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fonts } from '../../../config/fonts';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { formatThousands, parseMoneyInput } from '../../../utils/format';
import { FloatingLabelContainer } from './FloatingLabelContainer';

interface FloatingBottomSheetMoneyInputProps {
  label: string;
  /** Raw digit string, e.g. "150000". Component handles display formatting. */
  value: string;
  /** Receives raw digit string with non-digits stripped. */
  onChangeText: (raw: string) => void;
  error?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  returnKeyType?: 'done' | 'next' | 'search' | 'go' | 'send';
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  surfaceColor?: string;
}

/**
 * Ô tiền cho bottom sheet — bản BottomSheetTextInput của FloatingMoneyInput:
 * hiển thị phân tách hàng nghìn (3500000 → 3.500.000) + nút xoá nhanh (x).
 *
 * CONTROLLED an toàn ở đây dù nằm trong gorhom sheet: bug IME tiếng Việt chỉ
 * dính bàn phím compose dấu; number-pad không có IME compose. Các ô text trong
 * sheet vẫn phải dùng FloatingBottomSheetInput (uncontrolled).
 *
 * Không có chip gợi ý inline — sheet dùng MoneyChipsDock dock trên keyboard.
 */
export function FloatingBottomSheetMoneyInput({
  label,
  value,
  onChangeText,
  error,
  onFocus,
  onBlur,
  returnKeyType,
  onSubmitEditing,
  accessibilityLabel,
  surfaceColor,
}: FloatingBottomSheetMoneyInputProps) {
  const c = useAppTheme();
  const inputRef = useRef<ComponentRef<typeof BottomSheetTextInput>>(null);
  const [isFocused, setIsFocused] = useState(false);

  const display = useMemo(() => formatThousands(value), [value]);

  const handleChange = useCallback(
    (text: string) => {
      onChangeText(parseMoneyInput(text));
    },
    [onChangeText],
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  const handleClear = useCallback(() => {
    onChangeText('');
    // Giữ focus + keyboard mở sau khi xoá (onPressIn có thể làm input blur trên 1 số OEM).
    inputRef.current?.focus();
  }, [onChangeText]);

  const hasValue = value.length > 0;
  const isClearVisible = isFocused && hasValue;

  return (
    <FloatingLabelContainer
      label={label}
      isFocused={isFocused}
      hasValue={hasValue}
      error={error}
      minHeight={50}
      surfaceColor={surfaceColor}
    >
      <View style={styles.row}>
        <BottomSheetTextInput
          ref={inputRef}
          value={display}
          onChangeText={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          keyboardType="number-pad"
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={c.muted}
          cursorColor={c.primary}
          selectionColor={c.primary}
          textAlignVertical="center"
          style={[
            styles.input,
            {
              color: c.foreground,
              fontFamily: fonts.bold,
            },
          ]}
        />
        {isClearVisible ? (
          <Pressable
            onPressIn={handleClear}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Xoá nội dung"
            style={styles.clearBtn}
          >
            <CircleX size={18} color={c.muted} />
          </Pressable>
        ) : null}
      </View>
    </FloatingLabelContainer>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
    minHeight: 20,
    includeFontPadding: false,
  },
  clearBtn: {
    paddingLeft: 8,
  },
});
