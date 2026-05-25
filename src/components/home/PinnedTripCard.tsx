import { router } from 'expo-router';
import { MapPin, Pin } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { TripWithGroup } from '../../types/database.types';
import { hapticLight } from '../../utils/haptics';
import { AppText } from '../ui';

interface PinnedTripCardProps {
  trip: TripWithGroup;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PinnedTripCard = memo(function PinnedTripCard({
  trip,
}: PinnedTripCardProps) {
  const c = useAppTheme();
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    hapticLight();
    scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
  };

  const handlePress = () => {
    router.push(`/(main)/trips/${trip.id}` as never);
  };

  const isClosed = trip.status === 'closed';
  const statusDotColor = isClosed ? c.muted : c.success;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={`Pinned trip ${trip.name}, ${trip.group_name}, ${isClosed ? 'đã đóng' : 'đang mở'}`}
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.divider,
          shadowColor: c.foreground,
        },
        pressStyle,
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { backgroundColor: c.primarySoft }]}>
          <Pin size={14} color={c.primaryStrong} strokeWidth={2} fill={c.primaryStrong} />
        </View>
        <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
      </View>

      <AppText variant="body" weight="semibold" numberOfLines={1} style={styles.title}>
        {trip.name}
      </AppText>

      <View style={styles.metaRow}>
        <MapPin size={11} color={c.muted} strokeWidth={2} />
        <AppText
          variant="meta"
          tone="muted"
          numberOfLines={1}
          style={styles.groupName}
        >
          {trip.group_name}
        </AppText>
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  groupName: {
    flex: 1,
    minWidth: 0,
  },
});
