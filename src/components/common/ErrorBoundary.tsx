import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui/AppText';

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
  const c = useAppTheme();

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
});
