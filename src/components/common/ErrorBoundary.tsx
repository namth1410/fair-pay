import { Component, type ReactNode } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui/AppText';

// Fallback colors when theme context is unavailable (e.g. error during provider init)
const FALLBACK = {
  light: { bg: '#FFFFFF', fg: '#1A1A2E', primary: '#F472B6', muted: '#6B7280' },
  dark: { bg: '#1A1A2E', fg: '#F8F8FF', primary: '#F472B6', muted: '#9CA3AF' },
};

function getFallbackColors() {
  const scheme = Appearance.getColorScheme();
  return scheme === 'dark' ? FALLBACK.dark : FALLBACK.light;
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

interface ErrorFallbackProps {
  error: Error | null;
  onReset: () => void;
}

function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  // useAppTheme may fail if error occurred before theme context was ready
  let c: ReturnType<typeof useAppTheme> | null = null;
  try {
    c = useAppTheme();
  } catch {
    // Theme context not available — use system color scheme fallback
  }

  if (c) {
    return (
      <View
        accessibilityRole="alert"
        style={[styles.container, { backgroundColor: c.background }]}
      >
        <AppText variant="title" weight="bold" center>
          Đã xảy ra lỗi
        </AppText>
        <AppText variant="body" tone="muted" center style={styles.message}>
          {error?.message || 'Lỗi không xác định'}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thử lại"
          style={[styles.button, { backgroundColor: c.primaryStrong }]}
          onPress={onReset}
        >
          <AppText weight="semibold" style={{ color: '#FFFFFF' }}>
            Thử lại
          </AppText>
        </Pressable>
      </View>
    );
  }

  // Minimal fallback when theme is unavailable
  const fb = getFallbackColors();
  return (
    <View accessibilityRole="alert" style={[styles.container, { backgroundColor: fb.bg }]}>
      <Text style={[styles.fallbackTitle, { color: fb.fg }]}>Đã xảy ra lỗi</Text>
      <Text style={[styles.fallbackMessage, { color: fb.muted }]}>
        {error?.message || 'Lỗi không xác định'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Thử lại"
        style={[styles.button, { backgroundColor: fb.primary }]}
        onPress={onReset}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Thử lại</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback error={this.state.error} onReset={this.handleReset} />
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: {
    marginTop: 8,
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  fallbackMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
});
