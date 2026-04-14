import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import { Link } from 'expo-router';
import { Button, Spinner } from 'heroui-native';
import { useAuthStore } from '../../stores/auth.store';
import { colors } from '../../config/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signInWithEmail, signInWithGoogle, isLoading } = useAuthStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  const handleEmailLogin = async () => {
    if (!email || !password) {
      setError('Vui lòng nhập email và mật khẩu');
      return;
    }
    setError('');
    try {
      await signInWithEmail(email, password);
    } catch (e: any) {
      setError(e.message || 'Đăng nhập thất bại');
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e.message || 'Đăng nhập Google thất bại');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: c.foreground }]}>SplitVN</Text>
        <Text style={[styles.subtitle, { color: c.foreground, opacity: 0.6 }]}>
          Chia tiền nhóm dễ dàng
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={{ color: c.danger }}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          style={[
            styles.input,
            {
              color: c.foreground,
              borderColor: isDark ? '#334155' : '#E2E8F0',
              backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
            },
          ]}
          placeholder="Email"
          placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <TextInput
          style={[
            styles.input,
            {
              color: c.foreground,
              borderColor: isDark ? '#334155' : '#E2E8F0',
              backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
            },
          ]}
          placeholder="Mật khẩu"
          placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

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

        <View style={styles.divider}>
          <View
            style={[
              styles.dividerLine,
              { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
            ]}
          />
          <Text
            style={[
              styles.dividerText,
              { color: isDark ? '#94A3B8' : '#64748B' },
            ]}
          >
            hoặc
          </Text>
          <View
            style={[
              styles.dividerLine,
              { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
            ]}
          />
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
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
  },
  errorBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    width: '100%',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
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
