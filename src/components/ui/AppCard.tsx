import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from './AppText';

interface AppCardProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  borderLeft?: { width: number; color: string };
  titleTone?: 'default' | 'muted' | 'primary';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppCard({
  title,
  subtitle,
  onPress,
  onLongPress,
  leading,
  trailing,
  borderLeft,
  titleTone = 'default',
}: AppCardProps) {
  const c = useAppTheme();
  const scale = useSharedValue(1);

  const interactive = Boolean(onPress || onLongPress);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (interactive) scale.value = withSpring(0.97, { damping: 18, stiffness: 300 });
  };
  const handlePressOut = () => {
    if (interactive) scale.value = withSpring(1, { damping: 18, stiffness: 300 });
  };

  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.content}>
        <AppText variant="body" weight="semibold" tone={titleTone} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="meta" tone="muted" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  const baseStyle = [
    styles.card,
    {
      backgroundColor: c.surface,
      shadowColor: c.foreground,
    },
    borderLeft && { borderLeftWidth: borderLeft.width, borderLeftColor: borderLeft.color },
  ];

  if (interactive) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        style={[baseStyle, animatedStyle]}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={baseStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    // Subtle soft shadow — pink undertone set via shadowColor above
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  leading: { marginRight: 12 },
  content: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 2 },
  trailing: { marginLeft: 10 },
});
