import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Button, ScrollShadow } from 'heroui-native';
import { Receipt } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { EXPENSE_CATEGORIES as CATEGORIES } from '../../config/constants';
import { useMorphTransition } from '../../contexts/MorphTransition';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpenseWithSplits } from '../../services/expense.service';
import type { GroupMember } from '../../services/group.service';
import { hapticLight } from '../../utils/haptics';
import {
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  ListSkeleton,
  Money,
  SwipeableCard,
} from '../ui';

interface ExpensesTabProps {
  tripId: string;
  tripStatus: string;
  expenses: ExpenseWithSplits[];
  members: GroupMember[];
  isLoading: boolean;
  onDeleteExpense: (expenseId: string, tripId: string) => Promise<void>;
}

export const ExpensesTab = React.memo(function ExpensesTab({
  tripId, tripStatus, expenses, members, isLoading,
  onDeleteExpense,
}: ExpensesTabProps) {
  const c = useAppTheme();
  const morph = useMorphTransition();
  const addBtnRef = useRef<View>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseWithSplits | null>(null);

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.display_name || '?';

  const handleDelete = useCallback((expense: ExpenseWithSplits) => {
    setDeleteTarget(expense);
  }, []);

  const handleAddExpense = useCallback(() => {
    const navigate = () => router.push(`/trips/${tripId}/expenses/new`);
    const node = addBtnRef.current;
    if (!node) {
      navigate();
      return;
    }
    hapticLight();
    morph.runFrom(node, {
      color: c.primary,
      gradientColors: [c.primary, c.primarySoft, c.warmAccent],
      text: 'Thêm khoản chi',
      textColor: c.inverseForeground,
      destBg: c.background,
      onCovered: navigate,
    });
  }, [c, morph, tripId]);

  return (
    <View style={styles.tabContent}>
      {tripStatus === 'open' && (
        <View style={styles.sectionActions}>
          <View ref={addBtnRef} collapsable={false} style={styles.addBtnWrap}>
            <Button variant="primary" size="sm" onPress={handleAddExpense}>
              <Button.Label>Thêm khoản chi</Button.Label>
            </Button>
          </View>
        </View>
      )}

      {isLoading && expenses.length === 0 ? (
        <ListSkeleton count={3} />
      ) : (
        <ScrollShadow LinearGradientComponent={LinearGradient}>
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <SwipeableCard
                title={item.title}
                subtitle={`${getMemberName(item.paid_by)} đã trả · ${CATEGORIES.find((ct) => ct.key === item.category)?.label}`}
                leading={<CategoryIcon kind="expense" value={item.category} size={40} />}
                onDelete={() => handleDelete(item)}
                onLongPress={() => handleDelete(item)}
                trailing={<Money value={item.amount} variant="default" tone="primary" />}
              />
            )}
            contentContainerStyle={expenses.length === 0 ? styles.emptyContainer : styles.list}
            ListEmptyComponent={<EmptyState icon={Receipt} title="Chưa có khoản chi nào" />}
          />
        </ScrollShadow>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa khoản chi"
        description={`Xóa "${deleteTarget?.title}"?`}
        confirmLabel="Xóa"
        destructive
        onConfirm={() => {
          if (deleteTarget) onDeleteExpense(deleteTarget.id, tripId);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  tabContent: { flex: 1 },
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8, alignItems: 'flex-start' },
  addBtnWrap: { alignSelf: 'flex-start' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
