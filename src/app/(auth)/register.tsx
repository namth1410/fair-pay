import { Link } from 'expo-router';
import { Button } from 'heroui-native';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BrandDecoration } from '../../components/brand/BrandDecoration';
import { Wordmark } from '../../components/brand/Wordmark';
import { RegisterNoticeDialog } from '../../components/common/RegisterNoticeDialog';
import {
  AnimatedEntrance,
  AppText,
  DismissKeyboardView,
} from '../../components/ui';
import { FloatingLabelInput, FloatingPasswordInput } from '../../components/ui/floating';
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
  const [showNotice, setShowNotice] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUpWithEmail, signInWithGoogle, isLoading } = useAuthStore();
  const c = useAppTheme();

  // Hiện lưu ý "server free-tier giới hạn 4 email/giờ, nên đăng nhập Google"
  // ngay sau khi vào màn — delay nhẹ để transition slide_from_right settle xong.
  useEffect(() => {
    const t = setTimeout(() => setShowNotice(true), 450);
    return () => clearTimeout(t);
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // Thành công → AuthGate tự redirect sang (main), màn này unmount.
    } catch (e: unknown) {
      setShowNotice(false);
      setError(getErrorMessage(e));
    } finally {
      setGoogleLoading(false);
    }
  };

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
    Keyboard.dismiss();
    setError('');
    try {
      await signUpWithEmail(email, password, displayName);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <BrandDecoration />
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <DismissKeyboardView style={styles.content}>
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
          <FloatingLabelInput
            label="Tên hiển thị (2-50 ký tự)"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            accessibilityLabel="Tên hiển thị"
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={220}>
          <FloatingLabelInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Email"
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={290}>
          <FloatingPasswordInput
            label="Mật khẩu (ít nhất 6 ký tự)"
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            accessibilityLabel="Mật khẩu"
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={330}>
          <FloatingPasswordInput
            label="Xác nhận mật khẩu"
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
        </DismissKeyboardView>
      </KeyboardAwareScrollView>

      <RegisterNoticeDialog
        isOpen={showNotice}
        onClose={() => setShowNotice(false)}
        onUseGoogle={handleGoogleSignIn}
        googleLoading={googleLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
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
