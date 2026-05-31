import { FieldError, Input, InputGroup, Label, TextField } from 'heroui-native';
import CircleX from 'lucide-react-native/dist/esm/icons/circle-x';
import { useRef, useState } from 'react';
import {
  Pressable,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInput,
  type TextStyle,
} from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

interface AppTextFieldProps {
  label?: string;
  placeholder?: string;
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
  /** Hiện nút xoá nhanh (x) ở cuối ô khi focus + có nội dung. Mặc định true; tự tắt cho ô mật khẩu. */
  clearable?: boolean;
}

export function AppTextField({
  label,
  placeholder,
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
  clearable = true,
}: AppTextFieldProps) {
  const c = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  const showClear = clearable && !secureTextEntry;
  const isClearVisible = showClear && isFocused && value.length > 0;

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  const handleClear = () => {
    onChangeText('');
    // Giữ focus + keyboard mở sau khi xoá (onPressIn có thể làm input blur trên 1 số OEM).
    inputRef.current?.focus();
  };

  const sharedInputProps = {
    placeholder,
    value,
    onChangeText,
    secureTextEntry,
    keyboardType,
    autoCapitalize,
    autoComplete: autoComplete as 'email' | 'new-password' | 'current-password' | undefined,
    autoFocus,
    returnKeyType,
    onSubmitEditing,
    onFocus: handleFocus,
    onBlur: handleBlur,
    maxLength,
    style: inputStyle,
  };

  return (
    <TextField isInvalid={!!error} accessibilityLabel={accessibilityLabel}>
      {label ? <Label>{label}</Label> : null}
      {showClear ? (
        <InputGroup>
          <InputGroup.Input ref={inputRef} {...sharedInputProps} />
          {isClearVisible ? (
            <InputGroup.Suffix>
              <Pressable
                onPressIn={handleClear}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Xoá nội dung"
              >
                <CircleX size={18} color={c.muted} />
              </Pressable>
            </InputGroup.Suffix>
          ) : null}
        </InputGroup>
      ) : (
        <Input ref={inputRef} {...sharedInputProps} />
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}
