import { Button } from 'heroui-native';
import { Pin, Plus } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useTripStore } from '../../stores/trip.store';
import { getErrorMessage } from '../../utils/error';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { showValidationError } from '../../utils/toast';
import { AppText } from '../ui';
import { PinnedTripCard } from './PinnedTripCard';
import { SectionHeader } from './SectionHeader';

interface PinnedTripsSectionProps {
  onManagePress: () => void;
}

const SECTION_PADDING = 16;
const CARD_GAP = 12;

export const PinnedTripsSection = memo(function PinnedTripsSection({
  onManagePress,
}: PinnedTripsSectionProps) {
  const c = useAppTheme();
  const pinnedTrips = useTripStore((s) => s.pinnedTrips);

  // Empty: 0 pin
  if (pinnedTrips.length === 0) {
    return (
      <View style={styles.wrap}>
        <SectionHeader title="GHIM NHANH" />
        <View style={styles.body}>
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: c.surface, borderColor: c.divider },
            ]}
          >
            <View style={styles.emptyTop}>
              <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}>
                <Pin size={18} color={c.primaryStrong} strokeWidth={2} />
              </View>
              <View style={styles.emptyText}>
                <AppText variant="body" weight="semibold" numberOfLines={1}>
                  Chưa ghim chuyến đi nào
                </AppText>
                <AppText variant="meta" tone="muted" numberOfLines={1}>
                  Truy cập nhanh từ trang chủ
                </AppText>
              </View>
            </View>
            <Button variant="primary" size="sm" onPress={onManagePress}>
              <Plus size={16} color={c.background} strokeWidth={2.4} />
              <Button.Label>Chọn chuyến để ghim</Button.Label>
            </Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="GHIM NHANH"
        right={
          <Pressable
            onPress={onManagePress}
            accessibilityRole="button"
            accessibilityLabel="Quản lý chuyến đi đã ghim"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <AppText variant="meta" weight="semibold" style={{ color: c.primaryStrong }}>
              Quản lý
            </AppText>
          </Pressable>
        }
      />
      <View style={styles.body}>
        {pinnedTrips.length === 1 && pinnedTrips[0] ? (
          <PinnedTripCard trip={pinnedTrips[0]} />
        ) : (
          <DraggablePair />
        )}
      </View>
    </View>
  );
});

/**
 * 2-pin layout: split 50/50 với drag-to-swap.
 * Long-press 400ms → lift effect (scale + shadow) + haptic medium.
 * Pan qua cardWidth/2 → commit swap qua reorderPinnedTripsLocal.
 * Release dưới threshold → spring back.
 */
const DraggablePair = memo(function DraggablePair() {
  const { width: screenWidth } = useWindowDimensions();
  const pinnedTrips = useTripStore((s) => s.pinnedTrips);
  const reorderPinnedTripsLocal = useTripStore((s) => s.reorderPinnedTripsLocal);

  const cardWidth = (screenWidth - SECTION_PADDING * 2 - CARD_GAP) / 2;

  const translateX = useSharedValue(0);
  const lifted = useSharedValue(0);
  const draggedIndex = useSharedValue(-1);

  const commitSwap = async () => {
    const current = useTripStore.getState().pinnedTrips;
    const a = current[0];
    const b = current[1];
    if (!a || !b) return;
    try {
      await reorderPinnedTripsLocal([b.id, a.id]);
    } catch (e) {
      showValidationError('Không hoán đổi được', getErrorMessage(e));
    }
  };

  const longPress = Gesture.LongPress()
    .minDuration(400)
    .maxDistance(20)
    .onStart((e) => {
      'worklet';
      draggedIndex.value = e.x < cardWidth + CARD_GAP / 2 ? 0 : 1;
      lifted.value = withSpring(1, { damping: 16, stiffness: 220 });
      runOnJS(hapticMedium)();
    });

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onUpdate((e) => {
      'worklet';
      if (lifted.value > 0) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      'worklet';
      if (lifted.value > 0) {
        const shouldSwap = Math.abs(e.translationX) > cardWidth / 2;
        if (shouldSwap) {
          runOnJS(hapticLight)();
          runOnJS(commitSwap)();
        }
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        lifted.value = withSpring(0, { damping: 16, stiffness: 220 });
        draggedIndex.value = -1;
      }
    })
    .onFinalize(() => {
      'worklet';
      if (lifted.value > 0) {
        translateX.value = withSpring(0);
        lifted.value = withSpring(0);
        draggedIndex.value = -1;
      }
    });

  const composed = Gesture.Simultaneous(longPress, pan);

  // Card 0 animated style
  const card0Style = useAnimatedStyle(() => {
    const isDragging = draggedIndex.value === 0;
    const isCounter = draggedIndex.value === 1;
    const scale = isDragging ? interpolate(lifted.value, [0, 1], [1, 1.04]) : 1;
    const elevation = isDragging ? interpolate(lifted.value, [0, 1], [1, 8]) : 1;
    return {
      transform: [
        { translateX: isDragging ? translateX.value : isCounter ? -translateX.value : 0 },
        { scale },
      ],
      zIndex: isDragging ? 10 : 1,
      elevation,
      shadowOpacity: isDragging ? interpolate(lifted.value, [0, 1], [0.05, 0.18]) : 0.05,
    };
  });

  const card1Style = useAnimatedStyle(() => {
    const isDragging = draggedIndex.value === 1;
    const isCounter = draggedIndex.value === 0;
    const scale = isDragging ? interpolate(lifted.value, [0, 1], [1, 1.04]) : 1;
    const elevation = isDragging ? interpolate(lifted.value, [0, 1], [1, 8]) : 1;
    return {
      transform: [
        { translateX: isDragging ? translateX.value : isCounter ? -translateX.value : 0 },
        { scale },
      ],
      zIndex: isDragging ? 10 : 1,
      elevation,
      shadowOpacity: isDragging ? interpolate(lifted.value, [0, 1], [0.05, 0.18]) : 0.05,
    };
  });

  const trip0 = pinnedTrips[0];
  const trip1 = pinnedTrips[1];
  if (!trip0 || !trip1) return null;

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.row}>
        <Animated.View style={[styles.cell, card0Style]}>
          <PinnedTripCard trip={trip0} />
        </Animated.View>
        <Animated.View style={[styles.cell, card1Style]}>
          <PinnedTripCard trip={trip1} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  body: {
    paddingHorizontal: SECTION_PADDING,
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  emptyCard: {
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  emptyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
