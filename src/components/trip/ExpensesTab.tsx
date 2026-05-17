import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { Receipt } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import type { ExpenseWithSplits } from '../../services/expense.service';
import type { GroupMember } from '../../services/group.service';
import { groupExpensesByDay } from '../../utils/expenseGrouping';
import { ConfirmDialog, EmptyState, ListSkeleton } from '../ui';
import { ExpenseDetailSheet } from './ExpenseDetailSheet';
import { ExpenseTimelineRow } from './ExpenseTimelineRow';
import { ExpenseTimelineSectionHeader } from './ExpenseTimelineSectionHeader';

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
  const [deleteTarget, setDeleteTarget] = useState<ExpenseWithSplits | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithSplits | null>(null);
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
            <ExpenseTimelineRow
              expense={item}
              payerName={getMemberName(item.paid_by)}
              onPress={() => setSelectedExpense(item)}
              onDelete={isOpen ? () => handleDelete(item) : undefined}
              onLongPress={isOpen ? () => handleDelete(item) : undefined}
            />
          )}
          renderSectionHeader={({ section }) => (
            <ExpenseTimelineSectionHeader
              title={section.title}
              isFirst={section === sections[0]}
            />
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

      <ExpenseDetailSheet
        isOpen={!!selectedExpense}
        onOpenChange={(open) => { if (!open) setSelectedExpense(null); }}
        expense={selectedExpense}
        members={members}
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
