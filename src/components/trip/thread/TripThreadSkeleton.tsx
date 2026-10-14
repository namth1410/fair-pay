import { type DimensionValue, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { Bone, SkeletonPulse } from '../../ui/Skeleton';

// Skeleton màn chuyến đi (luồng chat) lúc đang nạp: banner số dư + vài bong bóng hai phía
// neo ở đáy (luồng inverted, tin mới nhất dưới cùng) + ô soạn. Hình học khớp
// TripBalanceBanner / ExpenseBubble / ThreadDaySeparator / TripComposer.

type SkeletonBubble = { mine: boolean; width: DimensionValue; height: number };

// Trên → dưới (cũ → mới), như luồng thật.
const BUBBLES: SkeletonBubble[] = [
  { mine: false, width: '64%', height: 84 },
  { mine: true, width: '58%', height: 84 },
  { mine: true, width: '50%', height: 84 },
  { mine: false, width: '60%', height: 84 },
];

export function TripThreadSkeleton() {
  const c = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <SkeletonPulse style={styles.root}>
      <View style={[styles.banner, { backgroundColor: c.brandSoft }]}>
        <View style={styles.bannerTexts}>
          <Bone width="56%" height={14} color={c.brandBorder} />
          <Bone width="74%" height={10} radius={5} color={c.brandBorder} />
        </View>
        <Bone width={70} height={12} color={c.brandBorder} />
      </View>

      <View style={styles.thread}>
        <View style={styles.dayRow}>
          <Bone width={112} height={24} radius={12} />
        </View>
        {BUBBLES.map((b, i) =>
          b.mine ? (
            <View key={i} style={styles.mineRow}>
              <Bone
                width={b.width}
                height={b.height}
                radius={20}
                color={c.primarySoft}
                style={styles.tailRight}
              />
            </View>
          ) : (
            <View key={i} style={styles.otherRow}>
              <Bone width={28} height={28} radius={14} />
              <Bone
                width={b.width}
                height={b.height}
                radius={20}
                color={c.bubbleOther}
                style={styles.tailLeft}
              />
            </View>
          )
        )}
      </View>

      <View
        style={[
          styles.composer,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            backgroundColor: c.surface,
            borderTopColor: c.divider,
          },
        ]}
      >
        <Bone width={44} height={44} radius={22} color={c.surfaceAlt} />
        <View style={styles.flex}>
          <Bone height={44} radius={22} color={c.surfaceAlt} />
        </View>
        <Bone width={44} height={44} radius={22} color={c.primarySoft} />
      </View>
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerTexts: { flex: 1, gap: 8 },
  thread: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dayRow: { alignItems: 'center', marginVertical: 10 },
  mineRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 4,
    paddingLeft: 56,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 4,
    paddingRight: 48,
  },
  tailRight: { borderBottomRightRadius: 6 },
  tailLeft: { borderBottomLeftRadius: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
