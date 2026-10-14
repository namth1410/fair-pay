import { StyleSheet, View } from 'react-native';

import { Bone, RowsSkeleton, SkeletonPulse } from '../ui/Skeleton';

// Skeleton màn chi tiết nhóm lúc đang nạp: avatar lớn + tên + dòng phụ, thanh tab
// (Chuyến đi / Thành viên / Cài đặt) rồi danh sách chuyến kiểu luồng. Khớp hero +
// SectionTabs + TripsTab của groups/[id].
const TAB_WIDTHS = [118, 134, 76];

export function GroupDetailSkeleton() {
  return (
    <SkeletonPulse style={styles.root}>
      <View style={styles.hero}>
        <Bone width={84} height={84} radius={42} />
        <View style={styles.heroTexts}>
          <Bone width={160} height={22} radius={8} />
          <Bone width={210} height={12} />
        </View>
      </View>

      <View style={styles.tabs}>
        {TAB_WIDTHS.map((w) => (
          <Bone key={w} width={w} height={36} radius={18} />
        ))}
      </View>

      <RowsSkeleton count={4} leading="tile" leadingSize={52} minHeight={74} />
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  heroTexts: { alignItems: 'center', gap: 8 },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
});
