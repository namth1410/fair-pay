import { router } from 'expo-router';
import { Button } from 'heroui-native';
import Receipt from 'lucide-react-native/dist/esm/icons/receipt';
import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import type { ExpenseWithSplits } from '../../services/expense.service';
import type { GroupMember } from '../../services/group.service';
import { groupExpensesByDay } from '../../utils/expenseGrouping';
import { BouncyDialog, EmptyState } from '../ui';
import { ExpenseDetailSheet } from './ExpenseDetailSheet';
import { ExpenseTimelineRow } from './ExpenseTimelineRow';
import { ExpenseTimelineSectionHeader } from './ExpenseTimelineSectionHeader';
import { ExpenseTimelineSkeleton } from './ExpenseTimelineSkeleton';

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

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.id, m.display_name || '?');
    return map;
  }, [members]);

  const handlePress = useCallback((expense: ExpenseWithSplits) => {
    setSelectedExpense(expense);
  }, []);

  const handleDelete = useCallback((expense: ExpenseWithSplits) => {
    setDeleteTarget(expense);
  }, []);

  const handleAddExpense = useCallback(() => {
    router.push(`/trips/${tripId}/expenses/new`);
  }, [tripId]);

  const sections = useMemo(() => {
    const raw = groupExpensesByDay(expenses);
    let idx = 0;
    return raw.map((s) => ({
      ...s,
      data: s.data.map((item) => ({ item, zigIdx: idx++ })),
    }));
  }, [expenses]);

  const firstSection = sections[0];

  const renderItem = useCallback(
    ({ item: { item, zigIdx } }: { item: { item: ExpenseWithSplits; zigIdx: number } }) => (
      <ExpenseTimelineRow
        expense={item}
        payerName={memberNameById.get(item.paid_by) || '?'}
        zigIdx={zigIdx}
        onPress={handlePress}
        onDelete={isOpen ? handleDelete : undefined}
        onLongPress={isOpen ? handleDelete : undefined}
      />
    ),
    [memberNameById, handlePress, handleDelete, isOpen],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <ExpenseTimelineSectionHeader
        title={section.title}
        isFirst={section === firstSection}
      />
    ),
    [firstSection],
  );

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
        <ExpenseTimelineSkeleton count={3} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={({ item }) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={expenses.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={<EmptyState icon={Receipt} title="Chưa có khoản chi nào" />}
        />
      )}

      <BouncyDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
      >
        <BouncyDialog.Title>Xóa khoản chi</BouncyDialog.Title>
        <BouncyDialog.Description>{`Xóa "${deleteTarget?.title}"?`}</BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={() => setDeleteTarget(null)}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button
            variant="danger"
            size="sm"
            onPress={() => {
              const target = deleteTarget;
              setDeleteTarget(null);
              if (target) onDeleteExpense(target.id, tripId);
            }}
          >
            <Button.Label>Xóa</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

      <ExpenseDetailSheet
        isOpen={!!selectedExpense}
        onOpenChange={(open) => { if (!open) setSelectedExpense(null); }}
        expense={selectedExpense}
        members={members}
        canEdit={isOpen}
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
