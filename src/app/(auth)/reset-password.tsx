import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { BrandDecoration } from '../../components/brand/BrandDecoration';
import { Wordmark } from '../../components/brand/Wordmark';
import { AnimatedEntrance, AppText, PasswordField } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../utils/error';

type Status = 'parsing' | 'ready' | 'invalid';
type ParseResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'no_token' | 'exchange_failed' };

const PARSE_TIMEOUT_MS = 3000;

function extractParams(url: string): URLSearchParams {
  // Supabase có thể đặt token ở fragment (#) hoặc query (?). Merge cả 2.
  const merged = new URLSearchParams();
  const fragment = url.split('#')[1];
  if (fragment) {
    new URLSearchParams(fragment).forEach((v, k) => merged.set(k, v));
  }
  const queryPart = url.split('?')[1]?.split('#')[0];
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => {
      if (!merged.has(k)) merged.set(k, v);
    });
  }
  return merged;
}

async function applySessionFromUrl(url: string): Promise<ParseResult> {
  console.log('[ResetPassword] raw URL:', url);
  const params = extractParams(url);

  // Supabase trả về error khi link đã dùng rồi / hết hạn
  const errorCode = params.get('error_code') || params.get('error');
  if (errorCode) {
    console.log('[ResetPassword] Supabase error:', errorCode, params.get('error_description'));
    return { ok: false, reason: 'expired' };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      console.log('[ResetPassword] setSession failed:', error.message);
      return { ok: false, reason: 'exchange_failed' };
    }
    return { ok: true };
  }

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.log('[ResetPassword] exchangeCodeForSession failed:', error.message);
      return { ok: false, reason: 'exchange_failed' };
    }
    return { ok: true };
  }

  return { ok: false, reason: 'no_token' };
}

export default function ResetPasswordScreen() {
  const [status, setStatus] = useState<Status>('parsing');
  const [invalidReason, setInvalidReason] =
    useState<'expired' | 'no_token' | 'exchange_failed' | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { updatePassword, isLoading, session } = useAuthStore();
  const router = useRouter();
  const c = useAppTheme();
  const url = Linking.useURL();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    let cancelled = false;

    async function handle() {
      const candidates = [url, await Linking.getInitialURL()].filter(
        (u): u is string => !!u && u.includes('reset-password')
      );

      let lastReason: 'expired' | 'no_token' | 'exchange_failed' = 'no_token';
      for (const candidate of candidates) {
        if (session) {
          await supabase.auth.signOut();
        }
        const result = await applySessionFromUrl(candidate);
        if (cancelled) return;
        if (result.ok) {
          handledRef.current = true;
          setStatus('ready');
          return;
        }
        lastReason = result.reason;
      }

      if (!cancelled && candidates.length > 0) {
        setInvalidReason(lastReason);
        setStatus('invalid');
      }
    }

    handle();

    const timer = setTimeout(() => {
      if (!cancelled && !handledRef.current) {
        setInvalidReason('no_token');
        setStatus('invalid');
      }
    }, PARSE_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url]);

  const handleSubmit = async () => {
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
      await updatePassword(password);
      router.replace('/(main)');
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

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

        {status === 'parsing' ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={c.primaryStrong} />
            <AppText variant="caption" tone="muted" style={styles.centerText}>
              Đang xác thực link...
            </AppText>
          </View>
        ) : status === 'invalid' ? (
          <>
            <AnimatedEntrance delay={80}>
              <AppText variant="subtitle" tone="muted" style={styles.subtitle}>
                {invalidReason === 'expired'
                  ? 'Link đã được dùng hoặc hết hạn. Lưu ý: link reset chỉ dùng được 1 lần và mở được trên điện thoại (không mở trên máy tính trước).'
                  : invalidReason === 'exchange_failed'
                  ? 'Xác thực link thất bại. Vui lòng gửi lại email.'
                  : 'Không tìm thấy token đặt lại mật khẩu trong link.'}
              </AppText>
            </AnimatedEntrance>
            <AnimatedEntrance delay={150}>
              <Button
                variant="primary"
                size="lg"
                onPress={() => router.replace('/(auth)/forgot-password')}
                style={styles.button}
              >
                <Button.Label>Gửi lại email</Button.Label>
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
          </>
        ) : (
          <>
            <AnimatedEntrance delay={80}>
              <AppText variant="subtitle" tone="muted" style={styles.subtitle}>
                Đặt mật khẩu mới cho tài khoản
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
              <PasswordField
                placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
                value={password}
                onChangeText={setPassword}
                autoComplete="new-password"
                accessibilityLabel="Mật khẩu mới"
              />
            </AnimatedEntrance>

            <AnimatedEntrance delay={220}>
              <PasswordField
                placeholder="Xác nhận mật khẩu mới"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoComplete="new-password"
                accessibilityLabel="Xác nhận mật khẩu"
              />
            </AnimatedEntrance>

            <AnimatedEntrance delay={290}>
              <Button
                variant="primary"
                size="lg"
                onPress={handleSubmit}
                isDisabled={isLoading}
                style={styles.button}
              >
                <Button.Label>
                  {isLoading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
                </Button.Label>
              </Button>
            </AnimatedEntrance>
          </>
        )}
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
  },
  secondaryButton: {
    marginTop: 12,
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  centerText: {
    marginTop: 8,
  },
});
