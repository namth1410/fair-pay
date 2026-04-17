import { ChevronRight } from 'lucide-react-native';
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
  memberCount: number;
  balance: number;
  onPress: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const GroupRow = memo(function GroupRow({
  id,
  name,
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
      {/* Left accent strip tinted by balance tone (inside the card) */}
      <View style={[styles.sideStrip, { backgroundColor: toneSoft }]} />

      {/* Avatar with tone dot */}
      <View style={styles.avatarWrap}>
        <Avatar seed={id} label={name} size={48} />
        <View
          style={[
            styles.statusDot,
            { backgroundColor: toneColor, borderColor: c.surface },
          ]}
        />
      </View>

      {/* Title + metadata chip-line */}
      <View style={styles.content}>
        <AppText variant="body" weight="semibold" numberOfLines={1}>
          {name}
        </AppText>
        <View style={styles.metaRow}>
          <View style={[styles.metaDot, { backgroundColor: c.primarySoft }]} />
          <AppText
            variant="meta"
            style={{ color: c.muted, fontFamily: fonts.medium }}
          >
            {memberCount} thành viên
          </AppText>
          <View style={[styles.metaSep, { backgroundColor: c.divider }]} />
          <AppText
            variant="meta"
            style={{
              color: toneColor,
              fontFamily: fonts.semibold,
              letterSpacing: 0.4,
              fontSize: 11,
            }}
          >
            {directionLabel}
          </AppText>
        </View>
      </View>

      {/* Trailing: stacked balance */}
      <View style={styles.trailing}>
        {isSettled ? (
          <View style={styles.settledBadge}>
            <View style={[styles.settledBar, { backgroundColor: c.muted }]} />
            <View style={[styles.settledBar, { backgroundColor: c.muted }]} />
          </View>
        ) : (
          <Money
            value={Math.abs(balance)}
            variant="default"
            tone={isPositive ? 'success' : 'danger'}
            showSign
          />
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
    paddingLeft: 18,
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  sideStrip: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  avatarWrap: {
    marginRight: 12,
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  metaDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  metaSep: {
    width: 1,
    height: 10,
    marginHorizontal: 2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    gap: 4,
  },
  chev: {
    marginLeft: 2,
    opacity: 0.6,
  },
  settledBadge: {
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  settledBar: {
    width: 10,
    height: 2,
    borderRadius: 1,
    opacity: 0.6,
  },
});
