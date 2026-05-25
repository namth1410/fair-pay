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
import { GroupCarouselCard } from './GroupCarouselCard';

interface GroupCarouselProps {
  groups: GroupWithMemberCount[];
  groupBalances: Record<string, number>;
}

const INFO_HEIGHT = 116;
// Card có thể tilt + scale; cho thêm padding dọc để bóng/cạnh không bị clip.
const VERTICAL_PADDING = 24;

// Spring snap khi dừng — damping/stiffness cho cảm giác coverflow.
const SNAP_SPRING = { damping: 22, stiffness: 90, mass: 1 } as const;

// Chuyển vận tốc thành khoảng dự đoán: ~0.25s decay quy đổi sang "số slot".
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

export function GroupCarousel({ groups, groupBalances }: GroupCarouselProps) {
  const router = useRouter();
  const c = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();

  const cardWidth = Math.min(screenWidth * 0.55, 240);
  const cardHeight = cardWidth + INFO_HEIGHT;
  // Drag-sensitivity và visual offset trùng nhau: kéo 1 SLOT = chuyển 1 card.
  // slot = 0.95 * cardWidth → 2 card bên (scale 0.82, tilt 6°) KHÔNG bị card
  // chính che. Tính: góc inner-bottom của card bên sau scale+rotate ở tọa độ
  // `slot - 0.343*cardWidth` so với tâm screen; phải > cạnh phải card chính
  // `0.5*cardWidth` → slot ≥ 0.843*cardWidth. Dùng 0.95 để chừa gap ~16-22px,
  // tránh hiện tượng "nháy nổi lên che" khi card chuyển từ bên vào giữa.
  const slot = cardWidth * 1.05;

  // Continuous offset (đơn vị: số slot). Có thể âm hoặc lớn hơn total (infinite loop).
  const scrollX = useSharedValue(0);
  // Snapshot scrollX khi bắt đầu pan để onUpdate tính delta đúng.
  const panStart = useSharedValue(0);

  const total = groups.length;
  const allowLoop = total >= 3;
  const roundedIndex = useMirroredRoundedIndex(scrollX);
  const dotIndex =
    total > 0 ? ((roundedIndex % total) + total) % total : 0;

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

  // Toggle global flag để (tabs)/_layout tắt swipe chuyển tab trong khi user
  // còn đang chạm/vuốt vào carousel — fix lẫn lộn 2 gesture ngang ở cùng vùng.
  // RNGH default cho gesture có threshold thấp nhất win; tab-view dùng 10px,
  // carousel 12px → tab tự ăn trước. Disable hẳn tab swipe ở khoảng touch là
  // cách dứt điểm nhất.
  const setCarouselTouching = useUIStore((s) => s.setCarouselTouching);

  // Tap card bên (không centered) → snap nó vào giữa (không push route).
  const handleSnapTo = useCallback(
    (absoluteIndex: number) => {
      'worklet';
      const cur = scrollX.value;
      const N = total;
      if (N <= 1) return;
      if (!allowLoop) {
        scrollX.value = withSpring(absoluteIndex, SNAP_SPRING);
        return;
      }
      // Chọn instance gần nhất của card đó: cur + delta, với delta ∈ [-N/2, N/2).
      const raw = absoluteIndex - cur;
      const delta = ((raw + N / 2) % N + N) % N - N / 2;
      scrollX.value = withSpring(cur + delta, SNAP_SPRING, (finished) => {
        if (finished) runOnJS(fireHaptic)();
      });
    },
    [scrollX, total, allowLoop, fireHaptic],
  );

  const handleSnapToJS = useCallback(
    (absoluteIndex: number) => {
      const cur = scrollX.value;
      const N = total;
      if (N <= 1) return;
      if (!allowLoop) {
        scrollX.value = withSpring(absoluteIndex, SNAP_SPRING);
        return;
      }
      const raw = absoluteIndex - cur;
      const delta = ((raw + N / 2) % N + N) % N - N / 2;
      scrollX.value = withSpring(cur + delta, SNAP_SPRING, (finished) => {
        if (finished) runOnJS(fireHaptic)();
      });
    },
    [scrollX, total, allowLoop, fireHaptic],
  );
  // Tránh warning unused — `handleSnapTo` (worklet) hiện chưa dùng, nhưng giữ
  // cho khả năng gọi từ gesture trực tiếp sau này. Dùng JS variant ở Pressable.
  void handleSnapTo;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-20, 20])
        .onTouchesDown(() => {
          'worklet';
          runOnJS(setCarouselTouching)(true);
        })
        .onBegin(() => {
          'worklet';
          panStart.value = scrollX.value;
        })
        .onUpdate((e) => {
          'worklet';
          scrollX.value = panStart.value - e.translationX / slot;
        })
        .onEnd((e) => {
          'worklet';
          // Momentum: dự đoán vị trí kết thúc dựa trên vận tốc, rồi round + spring.
          const projected =
            scrollX.value - (e.velocityX / slot) * VELOCITY_PROJECTION;
          let target = Math.round(projected);
          if (!allowLoop) {
            if (target < 0) target = 0;
            if (target > total - 1) target = total - 1;
          }
          scrollX.value = withSpring(target, SNAP_SPRING, (finished) => {
            if (finished && target !== Math.round(panStart.value)) {
              runOnJS(fireHaptic)();
            }
          });
        })
        // onFinalize fire khi gesture END / CANCEL / FAIL → clear flag chắc
        // chắn dù user kết thúc cách nào (nhả tay, kéo dọc fail, app interrupt).
        .onFinalize(() => {
          'worklet';
          runOnJS(setCarouselTouching)(false);
        }),
    [panStart, scrollX, slot, allowLoop, total, fireHaptic, setCarouselTouching],
  );

  const gestureHeight = cardHeight + VERTICAL_PADDING * 2;

  return (
    <View style={[styles.wrap, { height: gestureHeight + 56 }]}>
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
              { width: cardWidth, height: cardHeight },
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
                allowLoop={allowLoop}
                scrollX={scrollX}
                slot={slot}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                onPressActive={() => handlePressActive(g.id)}
                onSnapTo={() => handleSnapToJS(i)}
              />
            ))}
          </View>
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
    paddingTop: 8,
    paddingBottom: 8,
  },
  gestureLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    marginTop: 14,
  },
});
