import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';

interface FormRevealProps {
  isOpen: boolean;
  children: React.ReactNode;
}

export function FormReveal({ isOpen, children }: FormRevealProps) {
  const c = useAppTheme();

  if (!isOpen) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(250).springify()}
      exiting={FadeOutUp.duration(200)}
      style={[
        styles.container,
        { backgroundColor: c.surface, borderColor: c.divider },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
});
