import { type DimensionValue, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { Bone, SkeletonPulse } from '../ui/Skeleton';

// Skeleton màn "Thông tin chuyến" lúc đang nạp: thanh tab (Số dư / Quyết toán / Lịch sử /
// Quản lý) + thẻ danh sách số dư. Khớp SectionTabs + BalancesTab.
const TAB_WIDTHS = [70, 102, 80, 84];
const NAME_WIDTHS: DimensionValue[] = ['44%', '30%', '38%'];

export function TripInfoSkeleton() {
  const c = useAppTheme();
  return (
    <SkeletonPulse style={styles.root}>
      <View style={[styles.tabsBar, { backgroundColor: c.surface }]}>
        {TAB_WIDTHS.map((w) => (
          <Bone key={w} width={w} height={36} radius={18} />
        ))}
      </View>

      <View style={styles.body}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
          {NAME_WIDTHS.map((w, i) => (
            <View key={i} style={styles.row}>
              <Bone width={36} height={36} radius={18} />
              <View style={styles.texts}>
                <Bone width={w} height={13} />
                <Bone width="28%" height={10} radius={5} />
              </View>
              <Bone width={86} height={16} />
            </View>
          ))}
        </View>
      </View>
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsBar: {
    flexDirection: 'row',
    gap: 4,
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  body: { paddingTop: 8, paddingHorizontal: 16 },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
  },
  texts: { flex: 1, gap: 7 },
});
