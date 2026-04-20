import { Link } from 'expo-router';
import { Button } from 'heroui-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { BrandDecoration } from '../../components/brand/BrandDecoration';
import { Wordmark } from '../../components/brand/Wordmark';
import {
  AnimatedEntrance,
  AppText,
  AppTextField,
  PasswordField,
} from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../utils/error';
import { validateEmail } from '../../utils/validate';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { signUpWithEmail, isLoading } = useAuthStore();
  const c = useAppTheme();

  const handleRegister = async () => {
    if (!displayName || !email || !password || !confirmPassword) {
      setError('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (displayName.trim().length < 2 || displayName.trim().length > 50) {
      setError('Tên hiển thị phải từ 2 đến 50 ký tự');
      return;
    }
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setError('');
    try {
      await signUpWithEmail(email, password, displayName);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView
      // Android adjustResize handles this natively; see login.tsx for details.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <BrandDecoration />
      <View style={styles.content}>
        <AnimatedEntrance delay={0}>
          <View style={styles.brand}>
            <Wordmark size="md" />
          </View>
        </AnimatedEntrance>
        <AnimatedEntrance delay={80}>
          <AppText variant="subtitle" tone="muted" style={styles.subtitle}>
            Tạo tài khoản Fair Pay
          </AppText>
        </AnimatedEntrance>

        {error ? (
          <View
            style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <AppText variant="caption" tone="danger">
              {error}
            </AppText>
          </View>
        ) : null}

        <AnimatedEntrance delay={150}>
          <AppTextField
            placeholder="Tên hiển thị (2-50 ký tự)"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            accessibilityLabel="Tên hiển thị"
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={220}>
          <AppTextField
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Email"
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={290}>
          <PasswordField
            placeholder="Mật khẩu (ít nhất 6 ký tự)"
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            accessibilityLabel="Mật khẩu"
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={330}>
          <PasswordField
            placeholder="Xác nhận mật khẩu"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoComplete="new-password"
            accessibilityLabel="Xác nhận mật khẩu"
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={400}>
          <Button
            variant="primary"
            size="lg"
            onPress={handleRegister}
            isDisabled={isLoading}
            style={styles.button}
          >
            <Button.Label>
              {isLoading ? 'Đang đăng ký...' : 'Đăng ký'}
            </Button.Label>
          </Button>

          <View style={styles.footer}>
            <Link href="/(auth)/login">
              <AppText variant="caption" tone="primary" weight="semibold">
                Đã có tài khoản? Đăng nhập
              </AppText>
            </Link>
          </View>
        </AnimatedEntrance>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  brand: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 24,
  },
  errorBox: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
  },
  button: {
    width: '100%',
    marginTop: 4,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
});
