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

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signUpWithEmail, isLoading } = useAuthStore();
  const c = useAppTheme();

  const handleRegister = async () => {
    if (!displayName || !email || !password) {
      setError('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    setError('');
    try {
      await signUpWithEmail(email, password, displayName);
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
          <Text style={[styles.title, { color: c.foreground }]}>Đăng ký</Text>
        </AnimatedEntrance>
        <AnimatedEntrance delay={80}>
          <Text style={[styles.subtitle, { color: c.foreground, opacity: 0.6 }]}>
            Tạo tài khoản SplitVN
          </Text>
        </AnimatedEntrance>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={{ color: c.danger }}>{error}</Text>
          </View>
        ) : null}

        <AnimatedEntrance delay={150}>
          <AppTextField
            placeholder="Tên hiển thị"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
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
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={290}>
          <AppTextField
            placeholder="Mật khẩu (ít nhất 6 ký tự)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
        </AnimatedEntrance>

        <AnimatedEntrance delay={360}>
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
              <Text style={{ color: c.primary }}>
                Đã có tài khoản? Đăng nhập
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
    marginTop: 4,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
});
