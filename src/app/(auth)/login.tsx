import { Link } from 'expo-router';
import { Button } from 'heroui-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AnimatedEntrance, AppTextField } from '../../components/ui';
import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../utils/error';

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
    setError('');
    try {
      await signInWithEmail(email, password);
    } catch (e: any) {
      setError(getErrorMessage(e));
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <View style={styles.content}>
        <AnimatedEntrance delay={0}>
          <Text style={[styles.title, { color: c.foreground }]}>SplitVN</Text>
        </AnimatedEntrance>
        <AnimatedEntrance delay={80}>
          <Text style={[styles.subtitle, { color: c.foreground, opacity: 0.6 }]}>
            Chia tiền nhóm dễ dàng
          </Text>
        </AnimatedEntrance>

        <AnimatedEntrance delay={150}>
          <AppTextField
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={error && !email ? error : undefined}
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={220}>
          <AppTextField
            placeholder="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            error={error && email && !password ? error : undefined}
          />
        </AnimatedEntrance>

        {error && email && password ? (
          <View style={styles.errorBox}>
            <Text style={{ color: c.danger }}>{error}</Text>
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
            <Text style={[styles.dividerText, { color: c.muted }]}>hoặc</Text>
            <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
          </View>

          <Button
            variant="outline"
            size="lg"
            onPress={handleGoogleLogin}
            isDisabled={isLoading}
            style={styles.button}
          >
            <Button.Label>Đăng nhập với Google</Button.Label>
          </Button>

          <View style={styles.footer}>
            <Link href="/(auth)/register">
              <Text style={{ color: c.primary }}>
                Chưa có tài khoản? Đăng ký
              </Text>
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
    gap: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    fontFamily: fonts.bold,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  errorBox: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
  button: {
    width: '100%',
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
    fontSize: 14,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
});
