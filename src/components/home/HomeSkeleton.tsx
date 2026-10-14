import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { Bone, RowsSkeleton, SkeletonPulse } from '../ui/Skeleton';

// Skeleton màn Nhóm (Home) lúc chưa có nhóm nào trong cache: hàng story chuyến ghim +
// bong bóng tổng kết của rồng + danh sách nhóm kiểu đoạn chat. Kích thước khớp
// TripStoriesRow / DragonSummaryBubble / GroupChatRow để data về không nhảy layout.
export function HomeSkeleton() {
  const c = useAppTheme();
  return (
    <SkeletonPulse style={styles.root}>
      <View style={styles.stories}>
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={styles.story}>
            <Bone width={64} height={64} radius={32} />
            <Bone width={46} height={10} radius={5} style={styles.storyLabel} />
          </View>
        ))}
      </View>

      <View style={styles.dragonRow}>
        <Bone width={40} height={40} radius={20} />
        <View style={[styles.bubble, { backgroundColor: c.bubbleOther }]}>
          <Bone width="32%" height={10} radius={5} />
          <Bone width="92%" height={13} style={styles.bubbleLine} />
          <Bone width="64%" height={13} style={styles.bubbleLine} />
          <Bone width="48%" height={22} radius={8} style={styles.bubbleTotal} />
        </View>
      </View>

      <View style={styles.rows}>
        <RowsSkeleton count={5} leading="circle" leadingSize={54} minHeight={76} />
      </View>
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 2 },
  stories: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  story: {
    width: 74,
    alignItems: 'center',
    gap: 6,
  },
  storyLabel: { marginTop: 3 },
  dragonRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  bubble: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 15,
  },
  bubbleLine: { marginTop: 10 },
  bubbleTotal: { marginTop: 14 },
  rows: { marginTop: 4 },
});
