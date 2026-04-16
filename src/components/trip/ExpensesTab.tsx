import { LinearGradient } from 'expo-linear-gradient';
import { Button, ScrollShadow } from 'heroui-native';
import { Receipt } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { ExpenseWithSplits } from '../../services/expense.service';
import type { GroupMember } from '../../services/group.service';
import type { SplitResult } from '../../utils/split';
import {
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  ListSkeleton,
  Money,
  SwipeableCard,
} from '../ui';
import { ExpenseFormSheet } from './ExpenseFormSheet';

const CATEGORIES = [
  { key: 'food', label: 'Ăn uống' },
  { key: 'transport', label: 'Di chuyển' },
  { key: 'accommodation', label: 'Chỗ ở' },
  { key: 'fun', label: 'Vui chơi' },
  { key: 'shopping', label: 'Mua sắm' },
  { key: 'other', label: 'Khác' },
];

interface ExpensesTabProps {
  tripId: string;
  groupId: string;
  tripStatus: string;
  expenses: ExpenseWithSplits[];
  members: GroupMember[];
  isLoading: boolean;
  onAddExpense: (params: {
    tripId: string;
    groupId: string;
    title: string;
    amount: number;
    category: string;
    paidByMemberId: string;
    splitType: 'equal' | 'ratio' | 'custom';
    splits: SplitResult[];
    note?: string;
  }) => Promise<void>;
  onDeleteExpense: (expenseId: string, tripId: string) => Promise<void>;
}

export const ExpensesTab = React.memo(function ExpensesTab({
  tripId, groupId, tripStatus, expenses, members, isLoading,
  onAddExpense, onDeleteExpense,
}: ExpensesTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseWithSplits | null>(null);

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.display_name || '?';

  const handleDelete = useCallback((expense: ExpenseWithSplits) => {
    setDeleteTarget(expense);
  }, []);

  return (
    <View style={styles.tabContent}>
      {tripStatus === 'open' && (
        <View style={styles.sectionActions}>
          <Button variant="primary" size="sm" onPress={() => setFormOpen(true)}>
            <Button.Label>Thêm khoản chi</Button.Label>
          </Button>
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

      <ExpenseFormSheet
        isOpen={formOpen}
        onOpenChange={setFormOpen}
        tripId={tripId}
        groupId={groupId}
        members={members}
        onSubmit={onAddExpense}
      />

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
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
