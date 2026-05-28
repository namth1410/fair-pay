import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right';
import Users from 'lucide-react-native/dist/esm/icons/users';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { hapticLight } from '../../utils/haptics';
import { AppText, Avatar, Money } from '../ui';

interface GroupRowProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  memberCount: number;
  balance: number;
  onPress: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AVATAR_SIZE = 48;
const RING_WIDTH = 2;

export const GroupRow = memo(function GroupRow({
  id,
  name,
  avatarUrl,
  memberCount,
  balance,
  onPress,
}: GroupRowProps) {
  const c = useAppTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    hapticLight();
    scale.value = withSpring(0.975, { damping: 18, stiffness: 320 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
  };

  const isSettled = balance === 0;
  const isPositive = balance > 0;

  let toneColor: string;
  let toneSoft: string;
  let directionLabel: string;
  if (isSettled) {
    toneColor = c.muted;
    toneSoft = c.divider;
    directionLabel = 'cân bằng';
  } else if (isPositive) {
    toneColor = c.success;
    toneSoft = c.successSoft;
    directionLabel = 'được nhận';
  } else {
    toneColor = c.danger;
    toneSoft = c.dangerSoft;
    directionLabel = 'cần trả';
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${memberCount} thành viên, ${directionLabel}`}
      style={[
        styles.card,
        { backgroundColor: c.surface, shadowColor: c.foreground },
        animatedStyle,
      ]}
    >
      {/* Avatar with tone-colored ring (replaces left strip + status dot) */}
      <View
        style={[
          styles.avatarRing,
          {
            borderColor: toneColor,
            backgroundColor: toneSoft,
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

      {/* Title + member-count meta */}
      <View style={styles.content}>
        <AppText variant="body" weight="semibold" numberOfLines={1}>
          {name}
        </AppText>
        <View style={styles.metaRow}>
          <Users size={12} color={c.muted} strokeWidth={2.2} />
          <AppText
            variant="meta"
            style={{ color: c.muted, fontFamily: fonts.medium }}
          >
            {memberCount} thành viên
          </AppText>
        </View>
      </View>

      {/* Trailing: balance pill in tone-soft background */}
      <View style={styles.trailing}>
        {isSettled ? (
          <View
            style={[styles.balancePill, { backgroundColor: toneSoft }]}
          >
            <AppText
              variant="meta"
              style={{
                color: toneColor,
                fontFamily: fonts.semibold,
                letterSpacing: 0.3,
              }}
            >
              cân bằng
            </AppText>
          </View>
        ) : (
          <View
            style={[styles.balancePill, { backgroundColor: toneSoft }]}
          >
            {/* Pass RAW signed balance — Money tự gắn dấu đúng convention
                ('-' khi nợ, '+' khi được nợ). Xem CLAUDE.md §Quy ước dấu. */}
            <Money
              value={balance}
              variant="default"
              tone={isPositive ? 'success' : 'danger'}
              showSign
            />
          </View>
        )}
        <ChevronRight
          size={14}
          color={c.muted}
          strokeWidth={2}
          style={styles.chev}
        />
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
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
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 5,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 2,
  },
  balancePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chev: {
    marginLeft: 2,
    opacity: 0.6,
  },
});
