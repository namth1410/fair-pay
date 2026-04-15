import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

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
  const entering =
    direction === 'down'
      ? FadeInDown.delay(delay).duration(350).springify()
      : FadeInUp.delay(delay).duration(350).springify();

  return <Animated.View entering={entering}>{children}</Animated.View>;
}
