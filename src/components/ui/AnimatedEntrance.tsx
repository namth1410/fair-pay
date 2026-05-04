import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { useAnimationsEnabled } from '../../utils/userPreferences';

interface AnimatedEntranceProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down';
}

export function AnimatedEntrance({
  children,
  delay = 0,
  direction = 'down',
}: AnimatedEntranceProps) {
  const animationsEnabled = useAnimationsEnabled();

  if (!animationsEnabled) {
    return <Animated.View>{children}</Animated.View>;
  }

  const entering =
    direction === 'down'
      ? FadeInDown.delay(delay).duration(350).springify()
      : FadeInUp.delay(delay).duration(350).springify();

  return <Animated.View entering={entering}>{children}</Animated.View>;
}
