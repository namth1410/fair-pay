import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupWithMemberCount } from '../../services/group.service';
import { hapticLight } from '../../utils/haptics';
import { CarouselDots } from './CarouselDots';
import { GroupCarouselCard } from './GroupCarouselCard';

interface GroupCarouselProps {
  groups: GroupWithMemberCount[];
  groupBalances: Record<string, number>;
}

// Hero ảnh nhóm là vuông (= cardWidth) để avatar upload square fit đúng,
// avatar portrait cũng không bị cắt mất phần lớn. INFO_HEIGHT cố định.
const INFO_HEIGHT = 140;
// Behind cards are translated down (rel=2 → translateY 32 + scale 0.88) so the
// stack View bounds need to extend below the top card height; otherwise Android
// would clip the bottom of the peeking cards.
const STACK_BOTTOM_OVERFLOW = 36;
const SWIPE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 600;

// Mirror a SharedValue<number> into React state so JS-side consumers (dots,
// a11y) don't touch `.value` during render.
function useMirroredIndex(sv: SharedValue<number>): number {
  const [v, setV] = useState(0);
  useAnimatedReaction(
    () => sv.value,
    (curr, prev) => {
      if (curr !== prev) runOnJS(setV)(curr);
    },
    [sv],
  );
  return v;
}

export function GroupCarousel({ groups, groupBalances }: GroupCarouselProps) {
  const router = useRouter();
  const c = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();

  const cardWidth = Math.min(screenWidth * 0.78, 320);
  const cardHeight = cardWidth + INFO_HEIGHT;

  const topIndex = useSharedValue(0);
  const dragX = useSharedValue(0);

  const topIndexJS = useMirroredIndex(topIndex);
  const total = groups.length;
  // Display index = topIndex normalized to [0, total) via positive modulo —
  // topIndex itself is unbounded so the stack can loop infinitely.
  const dotIndex =
    total > 0 ? ((topIndexJS % total) + total) % total : 0;

  const handlePressActive = useCallback(
    (groupId: string) => {
      router.push(`/(main)/groups/${groupId}`);
    },
    [router],
  );

  const fireHaptic = useCallback(() => hapticLight(), []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Wait until horizontal motion is clearly intentional — lets vertical
        // scroll of the outer ScrollView win on diagonal touches.
        .activeOffsetX([-12, 12])
        .failOffsetY([-20, 20])
        .onUpdate((e) => {
          'worklet';
          dragX.value = e.translationX;
        })
        .onEnd((e) => {
          'worklet';
          const t = e.translationX;
          const v = e.velocityX;
          // Infinite loop: no boundary check — topIndex is read modulo `total`
          // by each card, so it can grow / shrink without limit.
          const wantsForward =
            (t < -SWIPE_THRESHOLD || v < -SWIPE_VELOCITY_THRESHOLD) &&
            total > 1;
          const wantsBack =
            (t > SWIPE_THRESHOLD || v > SWIPE_VELOCITY_THRESHOLD) &&
            total > 1;

          if (wantsForward) {
            dragX.value = withTiming(
              -screenWidth,
              { duration: 220 },
              (finished) => {
                if (finished) {
                  topIndex.value = topIndex.value + 1;
                  dragX.value = 0;
                  runOnJS(fireHaptic)();
                }
              },
            );
            return;
          }
          if (wantsBack) {
            dragX.value = withTiming(
              screenWidth,
              { duration: 220 },
              (finished) => {
                if (finished) {
                  topIndex.value = topIndex.value - 1;
                  dragX.value = 0;
                  runOnJS(fireHaptic)();
                }
              },
            );
            return;
          }
          dragX.value = withSpring(0, { damping: 18, stiffness: 220 });
        }),
    [dragX, fireHaptic, screenWidth, topIndex, total],
  );

  return (
    <View
      style={[
        styles.wrap,
        { height: cardHeight + STACK_BOTTOM_OVERFLOW + 76 },
      ]}
    >
      <GestureDetector gesture={pan}>
        <View
          style={[
            styles.stack,
            { width: cardWidth, height: cardHeight + STACK_BOTTOM_OVERFLOW },
          ]}
        >
          {groups.map((g, i) => (
            <GroupCarouselCard
              key={g.id}
              id={g.id}
              name={g.name}
              avatarUrl={g.avatar_url}
              memberCount={g.member_count}
              balance={groupBalances[g.id] ?? 0}
              absoluteIndex={i}
              total={total}
              topIndex={topIndex}
              dragX={dragX}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              screenWidth={screenWidth}
              onPressActive={() => handlePressActive(g.id)}
            />
          ))}
        </View>
      </GestureDetector>

      {total > 1 && (
        <View style={styles.dotsRow}>
          <CarouselDots
            count={total}
            currentIndex={dotIndex}
            activeColor={c.primary}
            baseColor={c.divider}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 18,
    paddingBottom: 8,
  },
  stack: {
    position: 'relative',
  },
  dotsRow: {
    marginTop: 18,
  },
});
