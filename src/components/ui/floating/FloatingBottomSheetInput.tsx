import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useCallback, useState } from 'react';
import {
  type KeyboardTypeOptions,
  type StyleProp,
  StyleSheet,
  type TextStyle,
} from 'react-native';

import { fonts } from '../../../config/fonts';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { FloatingLabelContainer } from './FloatingLabelContainer';

interface FloatingBottomSheetInputProps {
  label: string;
  /** Initial uncontrolled value (uncontrolled pattern for IME safety in BottomSheet). */
  defaultValue?: string;
  /** Called on every keystroke. Parent ghi vào ref để track value. */
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  returnKeyType?: 'done' | 'next' | 'search' | 'go' | 'send';
  onSubmitEditing?: () => void;
  editable?: boolean;
  maxLength?: number;
  multiline?: boolean;
  accessibilityLabel?: string;
  inputStyle?: StyleProp<TextStyle>;
  surfaceColor?: string;
  minHeight?: number;
}

export function FloatingBottomSheetInput({
  label,
  defaultValue = '',
  onChangeText,
  onFocus,
  onBlur,
  error,
  keyboardType,
  autoCapitalize,
  returnKeyType,
  onSubmitEditing,
  editable = true,
  maxLength,
  multiline,
  accessibilityLabel,
  inputStyle,
  surfaceColor,
  minHeight,
}: FloatingBottomSheetInputProps) {
  const c = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(() => defaultValue.length > 0);

  const handleChange = useCallback(
    (text: string) => {
      onChangeText?.(text);
      const next = text.length > 0;
      setHasValue((prev) => (prev === next ? prev : next));
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

  return (
    <FloatingLabelContainer
      label={label}
      isFocused={isFocused}
      hasValue={hasValue}
      error={error}
      minHeight={minHeight ?? (multiline ? 72 : 50)}
      surfaceColor={surfaceColor}
    >
      <BottomSheetTextInput
        defaultValue={defaultValue}
        onChangeText={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        maxLength={maxLength}
        multiline={multiline}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={c.muted}
        cursorColor={c.primary}
        selectionColor={c.primary}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          {
            color: c.foreground,
            fontFamily: fonts.regular,
          },
          inputStyle,
        ]}
      />
    </FloatingLabelContainer>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 15,
    padding: 0,
    margin: 0,
    minHeight: 20,
    includeFontPadding: false,
  },
});
