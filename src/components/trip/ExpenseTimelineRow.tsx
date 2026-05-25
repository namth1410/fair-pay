import { Trash2 } from 'lucide-react-native';
import React, { memo, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpenseWithSplits } from '../../services/expense.service';
import { hapticMedium } from '../../utils/haptics';
import { AppText, Money } from '../ui';
import { ExpenseImageThumb } from './ExpenseImageThumb';

interface Props {
  expense: ExpenseWithSplits;
  payerName: string;
  zigIdx: number;
  onPress: (expense: ExpenseWithSplits) => void;
  onDelete?: (expense: ExpenseWithSplits) => void;
  onLongPress?: (expense: ExpenseWithSplits) => void;
}

function RightAction({
  progress,
  onDelete,
  label,
}: {
  progress: SharedValue<number>;
  onDelete: () => void;
  label: string;
}) {
  const c = useAppTheme();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(progress.value, 1),
  }));

  return (
    <Animated.View style={[styles.rightAction, animatedStyle]}>
      <Pressable
        onPress={onDelete}
        style={[styles.deleteButton, { backgroundColor: c.danger }]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Trash2 size={18} color={c.inverseForeground} strokeWidth={2} />
        <AppText variant="meta" weight="semibold" tone="inverse">
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function TextColumn({
  expense,
  payerName,
  align,
}: {
  expense: ExpenseWithSplits;
  payerName: string;
  align: 'left' | 'right';
}) {
  const alignItems = align === 'right' ? 'flex-end' : 'flex-start';
  return (
    <View style={[styles.textCol, { alignItems }]}>
      <AppText
        variant="subtitle"
        weight="semibold"
        numberOfLines={2}
        style={align === 'right' ? styles.textRight : undefined}
      >
        {expense.title}
      </AppText>
      <AppText
        variant="meta"
        tone="muted"
        numberOfLines={1}
        style={[styles.caption, align === 'right' ? styles.textRight : undefined]}
      >
        {payerName} đã trả
      </AppText>
      <View style={styles.amountWrap}>
        <Money value={expense.amount} variant="display" tone="primary" />
      </View>
    </View>
  );
}

function ExpenseTimelineRowInner({
  expense,
  payerName,
  zigIdx,
  onPress,
  onDelete,
  onLongPress,
}: Props) {
  const c = useAppTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const isLeft = zigIdx % 2 === 0;

  const handlePress = useCallback(() => {
    onPress(expense);
  }, [onPress, expense]);

  const handleDelete = useCallback(() => {
    hapticMedium();
    swipeableRef.current?.close();
    onDelete?.(expense);
  }, [onDelete, expense]);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    hapticMedium();
    onLongPress(expense);
  }, [onLongPress, expense]);

  const renderRightActions = useCallback(
    (progress: SharedValue<number>) => (
      <RightAction progress={progress} onDelete={handleDelete} label="Xóa" />
    ),
    [handleDelete],
  );

  const innerContent = (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      style={({ pressed }) => [
        styles.contentRow,
        { backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${expense.title}, ${payerName} đã trả`}
    >
      {isLeft ? (
        <>
          <ExpenseImageThumb
            imageUrl={expense.image_url}
            titleForFallback={expense.title}
            side="left"
          />
          <TextColumn expense={expense} payerName={payerName} align="left" />
        </>
      ) : (
        <>
          <TextColumn expense={expense} payerName={payerName} align="right" />
          <ExpenseImageThumb
            imageUrl={expense.image_url}
            titleForFallback={expense.title}
            side="right"
          />
        </>
      )}
    </Pressable>
  );

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
        {onDelete ? (
          <ReanimatedSwipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            rightThreshold={40}
            overshootRight={false}
            friction={2}
            containerStyle={styles.swipeContainer}
          >
            {innerContent}
          </ReanimatedSwipeable>
        ) : (
          <View style={styles.swipeContainer}>{innerContent}</View>
        )}
      </View>
    </View>
  );
}

export const ExpenseTimelineRow = memo(ExpenseTimelineRowInner);

const AXIS_WIDTH = 32;
const LINE_LEFT = 15;
const LINE_WIDTH = 2;
const DOT_SIZE = 10;
const DOT_TOP = 54;

const styles = StyleSheet.create({
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
  textCol: {
    flex: 1,
    gap: 2,
  },
  textRight: { textAlign: 'right' },
  caption: { marginTop: 2 },
  amountWrap: { marginTop: 6 },
  rightAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 16,
    gap: 4,
  },
});
