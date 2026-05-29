import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useAnimationsEnabled } from '../../utils/userPreferences';

interface FormRevealProps {
  isOpen: boolean;
  children: React.ReactNode;
}

// CỐ Ý dùng PROPERTY animation (opacity/translateY qua useAnimatedStyle) thay vì
// LAYOUT animation (`entering`/`exiting`). Layout animation mutate cây view native
// đồng bộ; nếu rơi vào lúc react-native-screens đang vẽ transition (Oppo/ColorOS +
// New Arch) → `IllegalStateException: ... null child ... dispatchGetDisplayList` crash.
// Xem AnimatedEntrance.tsx + memory feedback_reanimated_layout_anim_crash.
export function FormReveal({ isOpen, children }: FormRevealProps) {
  const c = useAppTheme();
  const animationsEnabled = useAnimationsEnabled();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!isOpen) {
      progress.value = 0;
      return;
    }
    progress.value = animationsEnabled ? withTiming(1, { duration: 250 }) : 1;
  }, [isOpen, animationsEnabled]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  if (!isOpen) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: c.surface, borderColor: c.divider },
        style,
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
