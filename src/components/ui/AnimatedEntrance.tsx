import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useAnimationsEnabled } from '../../utils/userPreferences';

interface AnimatedEntranceProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down';
}

// Hiệu ứng "fade + trượt nhẹ" khi item xuất hiện.
//
// CỐ Ý dùng PROPERTY animation (useAnimatedStyle trên opacity/translateY của một
// view ĐÃ mount) thay vì LAYOUT animation (`entering={FadeInDown}`). Lý do: layout
// animations (entering/exiting) khiến Reanimated add/remove view trong cây native
// một cách đồng bộ; nếu việc đó rơi đúng vào lúc react-native-screens đang vẽ
// transition chuyển trang (đặc biệt trên thiết bị Oppo/Realme/ColorOS + New Arch),
// Android traverse display list gặp child = null →
// `IllegalStateException: ... contains null child ... dispatchGetDisplayList` → crash.
// Property animation chỉ cập nhật thuộc tính của view sẵn có, KHÔNG đổi cây view nên
// không thể gây lỗi đó. Xem CLAUDE.md / memory feedback_reanimated_layout_anim_crash.
export function AnimatedEntrance({
  children,
  delay = 0,
  direction = 'down',
}: AnimatedEntranceProps) {
  const animationsEnabled = useAnimationsEnabled();
  const progress = useSharedValue(animationsEnabled ? 0 : 1);

  useEffect(() => {
    if (animationsEnabled) {
      progress.value = withDelay(delay, withTiming(1, { duration: 350 }));
    } else {
      progress.value = 1;
    }
    // Chỉ chạy 1 lần lúc mount — entrance animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offset = direction === 'down' ? 16 : -16;

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offset }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
