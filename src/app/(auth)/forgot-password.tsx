import { Link, useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { BrandDecoration } from '../../components/brand/BrandDecoration';
import { Wordmark } from '../../components/brand/Wordmark';
import { AnimatedEntrance, AppText, AppTextField } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getResetCooldownRemaining } from '../../services/auth.helper';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../utils/error';
import { validateEmail } from '../../utils/validate';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { sendPasswordResetEmail, isLoading } = useAuthStore();
  const router = useRouter();
  const c = useAppTheme();

  useEffect(() => {
    getResetCooldownRemaining().then((remaining) => {
      if (remaining > 0) {
        setCooldown(remaining);
        setSent(true);
      }
    });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cooldown > 0]);

  const handleSend = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setError('');
    try {
      await sendPasswordResetEmail(email.trim());
      setSent(true);
      setCooldown(60);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  const canSubmit = !isLoading && cooldown === 0;

  return (
    <KeyboardAvoidingView
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
            {sent
              ? 'Kiểm tra hộp thư và nhấn vào liên kết để đặt lại mật khẩu'
              : 'Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu'}
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

        {!sent ? (
          <>
            <AnimatedEntrance delay={150}>
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

            <AnimatedEntrance delay={220}>
              <Button
                variant="primary"
                size="lg"
                onPress={handleSend}
                isDisabled={!canSubmit}
                style={styles.button}
              >
                <Button.Label>
                  {isLoading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
                </Button.Label>
              </Button>
            </AnimatedEntrance>
          </>
        ) : (
          <AnimatedEntrance delay={150}>
            <View
              style={[styles.successBox, { backgroundColor: c.successSoft }]}
            >
              <AppText variant="caption" tone="success">
                Đã gửi email đến {email || 'địa chỉ của bạn'}. Link có hiệu lực
                trong 1 giờ.
              </AppText>
            </View>
            <Button
              variant="primary"
              size="lg"
              onPress={handleSend}
              isDisabled={!canSubmit}
              style={styles.button}
            >
              <Button.Label>
                {cooldown > 0 ? `Gửi lại (${cooldown}s)` : 'Gửi lại'}
              </Button.Label>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onPress={() => router.replace('/(auth)/login')}
              style={[styles.button, styles.secondaryButton]}
            >
              <Button.Label>Quay về đăng nhập</Button.Label>
            </Button>
          </AnimatedEntrance>
        )}

        {!sent ? (
          <AnimatedEntrance delay={290}>
            <View style={styles.footer}>
              <Link href="/(auth)/login">
                <AppText variant="caption" tone="primary" weight="semibold">
                  Quay lại đăng nhập
                </AppText>
              </Link>
            </View>
          </AnimatedEntrance>
        ) : null}
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
  successBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  button: {
    width: '100%',
  },
  secondaryButton: {
    marginTop: 12,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
});
