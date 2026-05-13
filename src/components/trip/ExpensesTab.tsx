import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { Receipt } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpenseWithSplits } from '../../services/expense.service';
import type { GroupMember } from '../../services/group.service';
import { groupExpensesByDay } from '../../utils/expenseGrouping';
import {
  AppText,
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
  const [deleteTarget, setDeleteTarget] = useState<ExpenseWithSplits | null>(null);
  const isOpen = tripStatus === 'open';

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.display_name || '?';

  const handleDelete = useCallback((expense: ExpenseWithSplits) => {
    setDeleteTarget(expense);
  }, []);

  const handleAddExpense = useCallback(() => {
    router.push(`/trips/${tripId}/expenses/new`);
  }, [tripId]);

  const sections = useMemo(() => groupExpensesByDay(expenses), [expenses]);

  return (
    <View style={styles.tabContent}>
      {isOpen && (
        <View style={styles.sectionActions}>
          <View style={styles.addBtnWrap}>
            <Button variant="primary" size="sm" onPress={handleAddExpense}>
              <Button.Label>Thêm khoản chi</Button.Label>
            </Button>
          </View>
        </View>
      )}

      {isLoading && expenses.length === 0 ? (
        <ListSkeleton count={3} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SwipeableCard
              title={item.title}
              subtitle={`${getMemberName(item.paid_by)} đã trả`}
              onDelete={isOpen ? () => handleDelete(item) : undefined}
              onLongPress={isOpen ? () => handleDelete(item) : undefined}
              trailing={<Money value={item.amount} variant="default" tone="primary" />}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: c.background }]}>
              <AppText variant="meta" tone="muted" weight="semibold">
                {section.title}
              </AppText>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={expenses.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={<EmptyState icon={Receipt} title="Chưa có khoản chi nào" />}
        />
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
  sectionHeader: {
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
});
