import { SkeletonGroup } from 'heroui-native';
import { StyleSheet, View } from 'react-native';

interface ListSkeletonProps {
  count?: number;
}

// Match exact AppCard geometry: padding 14, radius 14, avatar 40 leading, 2 text lines.
export function ListSkeleton({ count = 3 }: ListSkeletonProps) {
  return (
    <SkeletonGroup isLoading variant="shimmer">
      <View style={styles.wrap}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={styles.card}>
            <SkeletonGroup.Item style={styles.avatar} />
            <View style={styles.textCol}>
              <SkeletonGroup.Item style={styles.lineTitle} />
              <SkeletonGroup.Item style={styles.lineSub} />
            </View>
            <SkeletonGroup.Item style={styles.trailing} />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  textCol: {
    flex: 1,
    gap: 6,
  },
  lineTitle: {
    height: 14,
    width: '60%',
    borderRadius: 4,
  },
  lineSub: {
    height: 10,
    width: '40%',
    borderRadius: 4,
  },
  trailing: {
    width: 56,
    height: 14,
    borderRadius: 4,
    marginLeft: 10,
  },
});
