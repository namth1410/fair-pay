import { SkeletonGroup } from 'heroui-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

interface Props {
  count?: number;
}

const AXIS_WIDTH = 32;
const LINE_LEFT = 15;
const LINE_WIDTH = 2;
const DOT_SIZE = 10;
const DOT_TOP = 54;
const THUMB_SIZE = 88;
const THUMB_RADIUS = 18;

// Mimic ExpenseTimelineRow geometry: 32px axis (line+dot), 88x88 thumb với 3D tilt
// (rotateY ±18deg, perspective 800), zigzag alternate side, title + caption + amount.
export function ExpenseTimelineSkeleton({ count = 3 }: Props) {
  const c = useAppTheme();

  return (
    <SkeletonGroup isLoading variant="shimmer">
      <View style={styles.list}>
        {Array.from({ length: count }).map((_, i) => {
          const isLeft = i % 2 === 0;
          const rotateY = isLeft ? '18deg' : '-18deg';
          const align = isLeft ? 'flex-start' : 'flex-end';
          return (
            <View key={i} style={styles.row}>
              <View style={styles.axisCol}>
                <View style={[styles.line, { backgroundColor: c.divider }]} />
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: c.muted, borderColor: c.background },
                  ]}
                />
              </View>
              <View style={styles.content}>
                <View style={styles.swipeContainer}>
                  <View style={styles.contentRow}>
                    {isLeft ? (
                      <>
                        <View
                          style={[
                            styles.thumbWrap,
                            { transform: [{ perspective: 800 }, { rotateY }] },
                          ]}
                        >
                          <SkeletonGroup.Item style={styles.thumb} />
                        </View>
                        <View style={[styles.textCol, { alignItems: align }]}>
                          <SkeletonGroup.Item style={styles.lineTitle} />
                          <SkeletonGroup.Item style={styles.lineCaption} />
                          <SkeletonGroup.Item style={styles.lineMoney} />
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={[styles.textCol, { alignItems: align }]}>
                          <SkeletonGroup.Item style={styles.lineTitle} />
                          <SkeletonGroup.Item style={styles.lineCaption} />
                          <SkeletonGroup.Item style={styles.lineMoney} />
                        </View>
                        <View
                          style={[
                            styles.thumbWrap,
                            { transform: [{ perspective: 800 }, { rotateY }] },
                          ]}
                        >
                          <SkeletonGroup.Item style={styles.thumb} />
                        </View>
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row' },
  axisCol: { width: AXIS_WIDTH, position: 'relative' },
  line: {
    position: 'absolute',
    left: LINE_LEFT,
    top: 0,
    bottom: -12,
    width: LINE_WIDTH,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    left: LINE_LEFT - (DOT_SIZE - LINE_WIDTH) / 2,
    top: DOT_TOP,
  },
  content: { flex: 1 },
  swipeContainer: { marginBottom: 12 },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    gap: 14,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_RADIUS,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_RADIUS,
  },
  textCol: { flex: 1, gap: 2 },
  lineTitle: {
    height: 16,
    width: '70%',
    borderRadius: 4,
  },
  lineCaption: {
    height: 10,
    width: '45%',
    borderRadius: 4,
    marginTop: 2,
  },
  lineMoney: {
    height: 24,
    width: '50%',
    borderRadius: 6,
    marginTop: 6,
  },
});
