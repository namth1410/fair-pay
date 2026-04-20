import { FieldError, InputGroup, Label, TextField } from 'heroui-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

interface PasswordFieldProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  autoComplete?: 'password' | 'new-password' | 'current-password';
  autoFocus?: boolean;
  returnKeyType?: 'done' | 'next' | 'go' | 'send';
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
}

export function PasswordField({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  autoComplete = 'password',
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  accessibilityLabel,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const c = useAppTheme();

  const toggleLabel = isVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
  const Icon = isVisible ? EyeOff : Eye;

  return (
    <TextField isInvalid={!!error} accessibilityLabel={accessibilityLabel}>
      {label ? <Label>{label}</Label> : null}
      <InputGroup>
        <InputGroup.Input
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!isVisible}
          autoCapitalize="none"
          autoComplete={autoComplete}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />
        <InputGroup.Suffix>
          <Pressable
            onPress={() => setIsVisible((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={toggleLabel}
          >
            <Icon size={18} color={c.muted} />
          </Pressable>
        </InputGroup.Suffix>
      </InputGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}
