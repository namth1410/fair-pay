import { useCallback, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { fonts } from '../../../config/fonts';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { FloatingLabelContainer } from './FloatingLabelContainer';

interface FloatingLabelInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoComplete?: string;
  autoFocus?: boolean;
  returnKeyType?: 'done' | 'next' | 'search' | 'go' | 'send';
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  accessibilityLabel?: string;
  maxLength?: number;
  inputStyle?: StyleProp<TextStyle>;
  multiline?: boolean;
  surfaceColor?: string;
}

export function FloatingLabelInput({
  label,
  value,
  onChangeText,
  error,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  onFocus,
  onBlur,
  accessibilityLabel,
  maxLength,
  inputStyle,
  multiline,
  surfaceColor,
}: FloatingLabelInputProps) {
  const c = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  const hasValue = (value ?? '').length > 0;

  return (
    <FloatingLabelContainer
      label={label}
      isFocused={isFocused}
      hasValue={hasValue}
      error={error}
      minHeight={multiline ? 72 : 50}
      surfaceColor={surfaceColor}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete as 'email' | 'new-password' | 'current-password' | undefined}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={accessibilityLabel ?? label}
        maxLength={maxLength}
        multiline={multiline}
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
