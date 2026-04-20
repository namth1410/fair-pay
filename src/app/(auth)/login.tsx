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
  GoogleIcon,
  PasswordField,
} from '../../components/ui';
import { APP_SLOGAN } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../utils/error';
import { validateEmail } from '../../utils/validate';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signInWithEmail, signInWithGoogle, isLoading } = useAuthStore();
  const c = useAppTheme();

  const handleEmailLogin = async () => {
    if (!email || !password) {
      setError('Vui lòng nhập email và mật khẩu');
      return;
    }
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setError('');
    try {
      await signInWithEmail(email, password);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView
      // Android: windowSoftInputMode=adjustResize (Expo default) already
      // handles resize natively. Using behavior='height' here double-resizes
      // and leaves a gap at the bottom when the keyboard dismisses.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <BrandDecoration />
      <View style={styles.content}>
        <AnimatedEntrance delay={0}>
          <View style={styles.brand}>
            <Wordmark size="lg" />
          </View>
        </AnimatedEntrance>
        <AnimatedEntrance delay={80}>
          <AppText variant="subtitle" tone="muted" style={styles.slogan}>
            {APP_SLOGAN}
          </AppText>
        </AnimatedEntrance>

        <AnimatedEntrance delay={150}>
          <AppTextField
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Email"
            error={error && !email ? error : undefined}
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={220}>
          <PasswordField
            placeholder="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            autoComplete="password"
            accessibilityLabel="Mật khẩu"
            error={error && email && !password ? error : undefined}
          />
          <View style={styles.forgotLinkRow}>
            <Link href="/(auth)/forgot-password">
              <AppText variant="caption" tone="primary" weight="semibold">
                Quên mật khẩu?
              </AppText>
            </Link>
          </View>
        </AnimatedEntrance>

        {error && email && password ? (
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

        <AnimatedEntrance delay={290}>
          <Button
            variant="primary"
            size="lg"
            onPress={handleEmailLogin}
            isDisabled={isLoading}
            style={styles.button}
          >
            <Button.Label>
              {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button.Label>
          </Button>
        </AnimatedEntrance>

        <AnimatedEntrance delay={360}>
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
            <AppText variant="caption" tone="muted" style={styles.dividerText}>
              hoặc
            </AppText>
            <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
          </View>

          <Button
            variant="outline"
            size="lg"
            onPress={handleGoogleLogin}
            isDisabled={isLoading}
            style={[
              styles.button,
              styles.googleButton,
              {
                backgroundColor: c.isDark ? c.surface : '#FFFFFF',
                borderColor: c.divider,
              },
            ]}
          >
            <GoogleIcon size={20} />
            <Button.Label style={{ color: c.foreground }}>
              Đăng nhập với Google
            </Button.Label>
          </Button>

          <View style={styles.footer}>
            <Link href="/(auth)/register">
              <AppText variant="caption" tone="primary" weight="semibold">
                Chưa có tài khoản? Đăng ký
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
  slogan: {
    marginBottom: 24,
  },
  errorBox: {
    marginTop: 4,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
  },
  button: {
    width: '100%',
  },
  forgotLinkRow: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 12,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
});
