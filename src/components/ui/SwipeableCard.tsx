import { Trash2 } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { hapticMedium } from '../../utils/haptics';
import { AppCard } from './AppCard';
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

interface SwipeableCardProps extends AppCardProps {
  onDelete?: () => void;
  deleteLabel?: string;
}

function RightAction({
  progress,
  onDelete,
  deleteLabel,
}: {
  progress: SharedValue<number>;
  onDelete: () => void;
  deleteLabel: string;
}) {
  const c = useAppTheme();

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(progress.value, 1),
  }));

  return (
    <Animated.View style={[styles.rightAction, animatedStyle]}>
      <Pressable
        onPress={onDelete}
        style={[styles.deleteButton, { backgroundColor: c.danger }]}
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
      >
        <Trash2 size={18} color={c.inverseForeground} strokeWidth={2} />
        <AppText variant="meta" weight="semibold" tone="inverse">
          {deleteLabel}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

export function SwipeableCard({
  onDelete,
  deleteLabel = 'Xóa',
  onLongPress,
  ...cardProps
}: SwipeableCardProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);

  const handleDelete = useCallback(() => {
    hapticMedium();
    swipeableRef.current?.close();
    onDelete?.();
  }, [onDelete]);

  const handleLongPress = useCallback(() => {
    hapticMedium();
    onLongPress?.();
  }, [onLongPress]);

  const renderRightActions = useCallback(
    (progress: SharedValue<number>) => (
      <RightAction
        progress={progress}
        onDelete={handleDelete}
        deleteLabel={deleteLabel}
      />
    ),
    [handleDelete, deleteLabel],
  );

  if (!onDelete) {
    return <AppCard {...cardProps} onLongPress={onLongPress} />;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
      containerStyle={styles.swipeContainer}
    >
      <AppCard
        {...cardProps}
        onLongPress={onLongPress ? handleLongPress : undefined}
      />
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    marginBottom: 8,
  },
  rightAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    gap: 4,
  },
});
