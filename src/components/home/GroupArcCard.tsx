import Users from 'lucide-react-native/dist/esm/icons/users';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatVND } from '../../utils/format';
import { hapticLight } from '../../utils/haptics';
import { AppText, Avatar } from '../ui';

interface GroupArcCardProps {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  balance: number;
  /** Card's absolute index in the groups list. */
  absoluteIndex: number;
  /** Total number of cards — dùng cho modular wrap math. */
  total: number;
  /** False khi total < 3 → không loop. */
  allowLoop: boolean;
  /** Continuous offset (đơn vị: số slot). */
  scrollY: SharedValue<number>;
  /** Khoảng cách dọc giữa 2 tâm card liền kề (px). */
  slotY: number;
  /** Biên độ ngang của arc (px) — max translateX khi |p| ≥ ARC_CAP. */
  arcX: number;
  cardWidth: number;
  cardHeight: number;
  onPressActive: () => void;
  onSnapTo: () => void;
}

interface BalanceTone {
  toneColor: string;
  toneSoft: string;
  directionLabel: string;
  isSettled: boolean;
  isPositive: boolean;
}

function getBalanceTone(
  balance: number,
  c: ReturnType<typeof useAppTheme>,
): BalanceTone {
  if (balance === 0) {
    return {
      toneColor: c.muted,
      toneSoft: c.divider,
      directionLabel: 'cân bằng',
      isSettled: true,
      isPositive: false,
    };
  }
  if (balance > 0) {
    return {
      toneColor: c.success,
      toneSoft: c.successSoft,
      directionLabel: 'được nhận',
      isSettled: false,
      isPositive: true,
    };
  }
  return {
    toneColor: c.danger,
    toneSoft: c.dangerSoft,
    directionLabel: 'cần trả',
    isSettled: false,
    isPositive: false,
  };
}

const AVATAR_SIZE = 56;
const RING_WIDTH = 2;
// Hệ số giảm scale theo |p|: scale = 1 - SCALE_FALLOFF * |p|. Dùng chung cho cả
// công thức scale lẫn công thức bù trừ translateY (xem dưới) để gap thị giác
// giữa các cặp card liền kề đều nhau dù cards xa tâm bị scale nhỏ.
const SCALE_FALLOFF = 0.13;

export const GroupArcCard = memo(function GroupArcCard({
  id,
  name,
  avatarUrl,
  memberCount,
  balance,
  absoluteIndex,
  total,
  allowLoop,
  scrollY,
  slotY,
  arcX,
  cardWidth,
  cardHeight,
  onPressActive,
  onSnapTo,
}: GroupArcCardProps) {
  const c = useAppTheme();
  const tone = getBalanceTone(balance, c);
  const pressed = useSharedValue(0);

  // Continuous position: 0 = center, ±k = k slots away.
  // Khi allowLoop, mỗi card lấy "instance" gần tâm nhất → vô tận.
  const position = useDerivedValue(() => {
    const N = total;
    if (N <= 1) return 0;
    const raw = absoluteIndex - scrollY.value;
    if (!allowLoop) return raw;
    return ((raw + N / 2) % N + N) % N - N / 2;
  });

  const wrapperStyle = useAnimatedStyle(() => {
    const p = position.value;
    const absP = Math.abs(p);
    const press = 1 - 0.025 * pressed.value;

    // Arc bend trái ĐỐI XỨNG dùng SIN curve. Trên 1 cung tròn parameterized
    // bởi góc đều, X = R*sin(angle) → gap X DECREASING khi rời tâm: cards gần
    // center cách nhau xa, cards rìa "tụ lại". Đây mới là hình arc cong tròn
    // (cards "ôm" cung tròn) — KHÔNG phải (1-cos) cho gap tăng dần (V-curve)
    // hay linear (chevron thẳng).
    const ARC_CAP = 2.5;
    const ARC_THETA = Math.PI / 5; // 36° per slot, |p|=2.5 → 90° (max sin = 1)
    const pEff = Math.min(absP, ARC_CAP);
    const tx = arcX * Math.sin(pEff * ARC_THETA);
    // translateY có bù trừ scale: card xa bị scale nhỏ nên nếu dùng p*slotY
    // thuần thì gap thị giác giữa chúng càng xa tâm càng rộng (kích thước card
    // co lại trong slot cố định). Trừ `cardHeight * SCALE_FALLOFF/2 * |p|` đưa
    // edges gần lại đúng tỉ lệ → các cặp card liền kề có gap visual đều nhau.
    const ty = p * (slotY - (cardHeight * SCALE_FALLOFF * absP) / 2);
    // Cards xa hơn nhỏ dần. Min 0.55 — KHÔNG dùng opacity 0 (Android quirk).
    const scale = Math.max(0.55, 1 - SCALE_FALLOFF * absP) * press;
    // Tilt nhẹ theo p để gợi cảm giác xoay quanh tâm arc bên TRÁI:
    // - card trên center (p<0) → top tilts right (clockwise, rotZ>0)
    // - card dưới center (p>0) → top tilts left (counter-clockwise, rotZ<0)
    const rotZ = -p * 4;
    let zIndex = 10;
    if (absP < 0.5) zIndex = 30;
    else if (absP < 1.5) zIndex = 20;

    return {
      zIndex,
      transform: [
        { translateY: ty },
        { translateX: tx },
        { rotate: `${rotZ}deg` },
        { scale },
      ],
    };
  });

  const handlePressIn = () => {
    pressed.value = withTiming(1, { duration: 90 });
  };
  const handlePressOut = () => {
    pressed.value = withTiming(0, { duration: 140 });
  };

  const handlePress = () => {
    const p = position.value;
    if (Math.abs(p) < 0.3) {
      hapticLight();
      onPressActive();
      return;
    }
    if (Math.abs(p) > 2.2) {
      // Card nằm ngoài VISIBLE_SLOTS (~2.1 mỗi phía) — clipped, không xử lý.
      return;
    }
    hapticLight();
    onSnapTo();
  };

  const a11y = `${name}, ${memberCount} thành viên, ${tone.directionLabel}`;

  return (
    <Animated.View
      style={[
        styles.shadowWrap,
        {
          width: cardWidth,
          height: cardHeight,
          shadowColor: c.foreground,
        },
        wrapperStyle,
      ]}
      pointerEvents="box-none"
      // Cache content thành bitmap GPU — tránh re-composite shadow/clip mỗi frame
      // khi transform đổi → đỡ flicker 1 frame trắng trên Android (xem ghi chú
      // tương tự ở GroupCarouselCard).
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      <View
        style={[
          styles.card,
          { backgroundColor: c.surface },
        ]}
        collapsable={false}
      >
        {/* Avatar with tone-colored ring (giống GroupRow) */}
        <View
          style={[
            styles.avatarRing,
            {
              borderColor: tone.toneColor,
              backgroundColor: tone.toneSoft,
            },
          ]}
        >
          <Avatar
            seed={id}
            label={name}
            photoUrl={avatarUrl ?? null}
            size={AVATAR_SIZE}
          />
        </View>

        {/* 3 rows phải avatar: name / member count / sign-badge.
            Sign convention dự án: '-' = bạn nợ (balance < 0), '+' = được nợ
            (balance > 0). Settled (=0) → ẩn badge hoàn toàn. Xem CLAUDE.md
            §Tiền VND. */}
        <View style={styles.content}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>
            {name}
          </AppText>
          <View style={styles.metaRow}>
            <Users size={10} color={c.muted} strokeWidth={2.2} />
            <AppText
              style={{
                fontSize: 10,
                lineHeight: 13,
                color: c.muted,
                fontFamily: fonts.medium,
              }}
            >
              {memberCount} thành viên
            </AppText>
          </View>
          {!tone.isSettled && (
            <View
              style={[styles.signBadge, { backgroundColor: tone.toneSoft }]}
            >
              {/* Render trực tiếp thay vì <Money> để fontSize nhỏ hơn variant
                  "compact" (14px) nhưng vẫn > số thành viên (10px). Convention
                  dấu: '+' khi được nợ, '-' khi đang nợ. */}
              <AppText
                style={{
                  fontSize: 13,
                  lineHeight: 16,
                  color: tone.toneColor,
                  fontFamily: fonts.semibold,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {tone.isPositive ? '+' : '-'}
                {formatVND(Math.abs(balance))}
              </AppText>
            </View>
          )}
        </View>

        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  shadowWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatarRing: {
    width: AVATAR_SIZE + RING_WIDTH * 2 + 4,
    height: AVATAR_SIZE + RING_WIDTH * 2 + 4,
    borderRadius: (AVATAR_SIZE + RING_WIDTH * 2 + 4) / 2,
    borderWidth: RING_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  signBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 2,
  },
});
