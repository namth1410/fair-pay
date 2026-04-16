import { FieldError, Input, Label, TextField } from 'heroui-native';
import type { KeyboardTypeOptions } from 'react-native';

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
  accessibilityLabel?: string;
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
  accessibilityLabel,
}: AppTextFieldProps) {
  return (
    <TextField isInvalid={!!error} accessibilityLabel={accessibilityLabel}>
      {label ? <Label>{label}</Label> : null}
      <Input
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete as 'email' | 'new-password' | 'current-password' | undefined}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}
