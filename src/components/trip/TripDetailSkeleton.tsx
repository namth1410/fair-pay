import { SkeletonGroup } from 'heroui-native';
import { StyleSheet, View } from 'react-native';

import { ExpenseTimelineSkeleton } from './ExpenseTimelineSkeleton';

// Mimic geometry của trip detail screen: hero block (label + Money + meta) +
// section tabs strip (5 pill chips) + list body. Match padding/margin/border-radius
// để khi data về transition mượt, không nhảy layout.
export function TripDetailSkeleton() {
  return (
    <SkeletonGroup isLoading variant="shimmer">
      <View style={styles.heroWrap}>
        <View style={styles.heroInner}>
          <SkeletonGroup.Item style={styles.heroLabel} />
          <SkeletonGroup.Item style={styles.heroMoney} />
          <SkeletonGroup.Item style={styles.heroMeta} />
        </View>
      </View>

      <View style={styles.tabsWrap}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonGroup.Item key={i} style={styles.tabChip} />
        ))}
      </View>

      <ExpenseTimelineSkeleton count={3} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroInner: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 8,
  },
  heroLabel: {
    width: 80,
    height: 12,
    borderRadius: 4,
  },
  heroMoney: {
    width: 180,
    height: 36,
    borderRadius: 6,
    marginTop: 2,
  },
  heroMeta: {
    width: 220,
    height: 10,
    borderRadius: 4,
    marginTop: 4,
  },
  tabsWrap: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabChip: {
    width: 64,
    height: 32,
    borderRadius: 999,
  },
});
