import Eye from 'lucide-react-native/dist/esm/icons/eye';
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { FloatingLabelInput } from './FloatingLabelInput';

interface FloatingPasswordInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  autoComplete?: 'password' | 'new-password' | 'current-password';
  autoFocus?: boolean;
  returnKeyType?: 'done' | 'next' | 'go' | 'send';
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  surfaceColor?: string;
}

export function FloatingPasswordInput({
  label,
  value,
  onChangeText,
  error,
  autoComplete = 'password',
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  accessibilityLabel,
  surfaceColor,
}: FloatingPasswordInputProps) {
  const c = useAppTheme();
  const [isVisible, setIsVisible] = useState(false);

  const toggleLabel = isVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
  const Icon = isVisible ? EyeOff : Eye;

  return (
    <View style={styles.wrapper}>
      <FloatingLabelInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        error={error}
        secureTextEntry={!isVisible}
        autoCapitalize="none"
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={accessibilityLabel ?? label}
        inputStyle={styles.inputWithIcon}
        surfaceColor={surfaceColor}
        clearable={false}
      />
      <Pressable
        onPress={() => setIsVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        style={styles.eyeButton}
      >
        <Icon size={18} color={c.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  inputWithIcon: {
    paddingRight: 36,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    height: 50,
  },
});
