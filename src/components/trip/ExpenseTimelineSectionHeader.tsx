import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui';

interface Props {
  title: string;
  isFirst?: boolean;
}

const AXIS_WIDTH = 32;
const LINE_LEFT = 15;
const LINE_WIDTH = 2;
const NODE_SIZE = 16;
const NODE_TOP = 18;

export function ExpenseTimelineSectionHeader({ title, isFirst }: Props) {
  const c = useAppTheme();

  return (
    <View style={[styles.row, { backgroundColor: c.background }]}>
      <View
        style={styles.axisCol}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {!isFirst ? (
          <View style={[styles.lineTop, { backgroundColor: c.divider }]} />
        ) : null}
        <View style={[styles.lineBottom, { backgroundColor: c.divider }]} />
        <View
          style={[
            styles.node,
            {
              backgroundColor: c.background,
              borderColor: c.primary,
            },
          ]}
        />
      </View>
      <View style={styles.content}>
        <AppText variant="body" weight="bold">
          {title}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginTop: 10 },
  axisCol: { width: AXIS_WIDTH, position: 'relative' },
  lineTop: {
    position: 'absolute',
    left: LINE_LEFT,
    top: 0,
    height: NODE_TOP,
    width: LINE_WIDTH,
  },
  lineBottom: {
    position: 'absolute',
    left: LINE_LEFT,
    top: NODE_TOP + NODE_SIZE,
    bottom: 0,
    width: LINE_WIDTH,
  },
  node: {
    position: 'absolute',
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 2,
    left: LINE_LEFT - (NODE_SIZE - LINE_WIDTH) / 2,
    top: NODE_TOP,
  },
  content: {
    flex: 1,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
});
