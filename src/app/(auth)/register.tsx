import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import { Link } from 'expo-router';
import { Button } from 'heroui-native';
import { useAuthStore } from '../../stores/auth.store';
import { colors } from '../../config/theme';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signUpWithEmail, isLoading } = useAuthStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

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
      setError(e.message || 'Đăng ký thất bại');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: c.foreground }]}>Đăng ký</Text>
        <Text style={[styles.subtitle, { color: c.foreground, opacity: 0.6 }]}>
          Tạo tài khoản SplitVN
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
          placeholder="Tên hiển thị"
          placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
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
          placeholder="Mật khẩu (ít nhất 6 ký tự)"
          placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />

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
    marginTop: 4,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
});
