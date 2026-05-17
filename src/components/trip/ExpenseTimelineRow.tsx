import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpenseWithSplits } from '../../services/expense.service';
import { Money, SwipeableCard } from '../ui';

interface Props {
  expense: ExpenseWithSplits;
  payerName: string;
  onPress: () => void;
  onDelete?: () => void;
  onLongPress?: () => void;
}

export function ExpenseTimelineRow({
  expense,
  payerName,
  onPress,
  onDelete,
  onLongPress,
}: Props) {
  const c = useAppTheme();

  return (
    <View style={styles.row}>
      <View
        style={styles.axisCol}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.line, { backgroundColor: c.divider }]} />
        <View
          style={[
            styles.dot,
            { backgroundColor: c.muted, borderColor: c.background },
          ]}
        />
      </View>
      <View style={styles.content}>
        <SwipeableCard
          title={expense.title}
          subtitle={`${payerName} đã trả`}
          onPress={onPress}
          onDelete={onDelete}
          onLongPress={onLongPress}
          trailing={<Money value={expense.amount} variant="default" tone="primary" />}
        />
      </View>
    </View>
  );
}

const AXIS_WIDTH = 32;
const LINE_LEFT = 15;
const LINE_WIDTH = 2;
const DOT_SIZE = 10;

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  axisCol: { width: AXIS_WIDTH, position: 'relative' },
  line: {
    position: 'absolute',
    left: LINE_LEFT,
    top: 0,
    bottom: -10,
    width: LINE_WIDTH,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    left: LINE_LEFT - (DOT_SIZE - LINE_WIDTH) / 2,
    top: 23,
  },
  content: { flex: 1 },
});
