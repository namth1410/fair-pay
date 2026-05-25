import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupWithMemberCount } from '../../services/group.service';
import { useUIStore } from '../../stores/ui.store';
import { hapticLight } from '../../utils/haptics';
import { CarouselDots } from './CarouselDots';
import { GroupArcCard } from './GroupArcCard';

interface GroupArcCarouselProps {
  groups: GroupWithMemberCount[];
  groupBalances: Record<string, number>;
}

// Pill ngang — chiều cao cố định, chiều rộng theo % screen (cap 300).
const CARD_HEIGHT = 96;
// Gap dọc giữa 2 tâm card liền kề. cardHeight + gap = slotY.
const SLOT_GAP = 12;
// Số "slot" hiển thị trong vùng gesture. 4.2 → center + ~1.6 card mỗi phía,
// card xa hơn (p=±2,±3) bị clip bởi overflow:hidden để không tràn lên header.
const VISIBLE_SLOTS = 4.2;
// Biên độ ngang của arc (px) — edges pull sang phải đối xứng quanh center.
// Bump lên 80 (từ 60) để bù lại việc bỏ asymmetric boost, vẫn giữ curvature
// rõ. Cards trượt ra ngoài mép phải bị clip bởi overflow:hidden ở wrap.
const ARC_X = 80;
// Padding trái: center card cách mép trái screen bao nhiêu.
const LEFT_PADDING = 18;

const SNAP_SPRING = { damping: 22, stiffness: 90, mass: 1 } as const;
const VELOCITY_PROJECTION = 0.25;

// Mirror SharedValue<number> qua React state (rounded) để render dots.
function useMirroredRoundedIndex(sv: SharedValue<number>): number {
  const [v, setV] = useState(0);
  useAnimatedReaction(
    () => Math.round(sv.value),
    (curr, prev) => {
      if (curr !== prev) runOnJS(setV)(curr);
    },
    [sv],
  );
  return v;
}

export function GroupArcCarousel({
  groups,
  groupBalances,
}: GroupArcCarouselProps) {
  const router = useRouter();
  const c = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();

  // Card width KHÔNG co theo arc swing — center card luôn rộng đầy đủ. Cards
  // dưới center khi swing mạnh sẽ trượt một phần ra ngoài mép phải; phần thừa
  // bị overflow:hidden ở wrap clip → đúng cảm giác arc "tràn" khỏi khung nhìn,
  // KHÔNG phải tất cả cards thu nhỏ chung 1 width.
  const cardWidth = Math.min(screenWidth * 0.72, 300);
  const slotY = CARD_HEIGHT + SLOT_GAP;
  const gestureHeight = slotY * VISIBLE_SLOTS;

  const scrollY = useSharedValue(0);
  const panStart = useSharedValue(0);

  const total = groups.length;
  const allowLoop = total >= 3;
  const roundedIndex = useMirroredRoundedIndex(scrollY);
  const dotIndex = total > 0 ? ((roundedIndex % total) + total) % total : 0;

  // Pressable nested trong GestureDetector trên Android đôi khi fire onPress
  // 2 lần (RNGH + RN responder race) → router.push chạy 2 lần → stack 2 entries
  // → back phải 2 lần. Single-flight guard 500ms chặn double-push, đủ phủ
  // transition animation (~350ms) mà không cản tap chuyển group bình thường.
  const isPushingRef = useRef(false);

  const handlePressActive = useCallback(
    (groupId: string) => {
      if (isPushingRef.current) return;
      isPushingRef.current = true;
      setTimeout(() => { isPushingRef.current = false; }, 500);
      router.push(`/(main)/groups/${groupId}`);
    },
    [router],
  );

  const fireHaptic = useCallback(() => hapticLight(), []);

  // Tắt tab swipe khi user còn chạm vào arc carousel (gesture dọc nhưng vẫn có
  // chuyển động ngang nhẹ; giữ pattern an toàn giống GroupCarousel).
  const setCarouselTouching = useUIStore((s) => s.setCarouselTouching);

  const handleSnapToJS = useCallback(
    (absoluteIndex: number) => {
      const cur = scrollY.value;
      const N = total;
      if (N <= 1) return;
      if (!allowLoop) {
        scrollY.value = withSpring(absoluteIndex, SNAP_SPRING);
        return;
      }
      const raw = absoluteIndex - cur;
      const delta = ((raw + N / 2) % N + N) % N - N / 2;
      scrollY.value = withSpring(cur + delta, SNAP_SPRING, (finished) => {
        if (finished) runOnJS(fireHaptic)();
      });
    },
    [scrollY, total, allowLoop, fireHaptic],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-20, 20])
        .onTouchesDown(() => {
          'worklet';
          runOnJS(setCarouselTouching)(true);
        })
        .onBegin(() => {
          'worklet';
          panStart.value = scrollY.value;
        })
        .onUpdate((e) => {
          'worklet';
          scrollY.value = panStart.value - e.translationY / slotY;
        })
        .onEnd((e) => {
          'worklet';
          const projected =
            scrollY.value - (e.velocityY / slotY) * VELOCITY_PROJECTION;
          let target = Math.round(projected);
          if (!allowLoop) {
            if (target < 0) target = 0;
            if (target > total - 1) target = total - 1;
          }
          scrollY.value = withSpring(target, SNAP_SPRING, (finished) => {
            if (finished && target !== Math.round(panStart.value)) {
              runOnJS(fireHaptic)();
            }
          });
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(setCarouselTouching)(false);
        }),
    [
      panStart,
      scrollY,
      slotY,
      allowLoop,
      total,
      fireHaptic,
      setCarouselTouching,
    ],
  );

  // Anchor: stack đặt absolute ở top giữa gesture area, left = LEFT_PADDING.
  // Mỗi card transform từ vị trí đó.
  const stackTop = (gestureHeight - CARD_HEIGHT) / 2;

  return (
    <View style={[styles.wrap, { height: gestureHeight }]}>
      <GestureDetector gesture={pan}>
        <View
          style={[
            styles.gestureLayer,
            { width: screenWidth, height: gestureHeight },
          ]}
        >
          <View
            style={[
              styles.stack,
              {
                width: cardWidth,
                height: CARD_HEIGHT,
                left: LEFT_PADDING,
                top: stackTop,
              },
            ]}
            pointerEvents="box-none"
          >
            {groups.map((g, i) => (
              <GroupArcCard
                key={g.id}
                id={g.id}
                name={g.name}
                avatarUrl={g.avatar_url}
                memberCount={g.member_count}
                balance={groupBalances[g.id] ?? 0}
                absoluteIndex={i}
                total={total}
                allowLoop={allowLoop}
                scrollY={scrollY}
                slotY={slotY}
                arcX={ARC_X}
                cardWidth={cardWidth}
                cardHeight={CARD_HEIGHT}
                onPressActive={() => handlePressActive(g.id)}
                onSnapTo={() => handleSnapToJS(i)}
              />
            ))}
          </View>
        </View>
      </GestureDetector>

      {total > 1 && (
        <View style={styles.dotsCol} pointerEvents="none">
          <CarouselDots
            count={total}
            currentIndex={dotIndex}
            activeColor={c.primary}
            baseColor={c.divider}
            orientation="vertical"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  gestureLayer: {
    position: 'relative',
    overflow: 'visible',
  },
  stack: {
    position: 'absolute',
  },
  dotsCol: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
