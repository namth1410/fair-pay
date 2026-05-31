import CircleX from 'lucide-react-native/dist/esm/icons/circle-x';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
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
  /** Hiện nút xoá nhanh (x) ở cuối ô khi focus + có nội dung. Mặc định true; tự tắt cho ô mật khẩu. */
  clearable?: boolean;
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
  clearable = true,
}: FloatingLabelInputProps) {
  const c = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

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

  const hasValue = (value ?? '').length > 0;
  const isClearVisible =
    clearable && !secureTextEntry && !multiline && isFocused && hasValue;

  return (
    <FloatingLabelContainer
      label={label}
      isFocused={isFocused}
      hasValue={hasValue}
      error={error}
      minHeight={multiline ? 72 : 50}
      surfaceColor={surfaceColor}
    >
      <View style={styles.row}>
        <TextInput
          ref={inputRef}
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
