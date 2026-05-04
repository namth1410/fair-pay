import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useAnimationsEnabled } from '../../utils/userPreferences';

interface FormRevealProps {
  isOpen: boolean;
  children: React.ReactNode;
}

export function FormReveal({ isOpen, children }: FormRevealProps) {
  const c = useAppTheme();
  const animationsEnabled = useAnimationsEnabled();

  if (!isOpen) return null;

  return (
    <Animated.View
      entering={animationsEnabled ? FadeInDown.duration(250).springify() : undefined}
      exiting={animationsEnabled ? FadeOutUp.duration(200) : undefined}
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
