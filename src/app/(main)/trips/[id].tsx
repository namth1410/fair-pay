import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  useColorScheme,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Button } from 'heroui-native';
import { useTripStore } from '../../../stores/trip.store';
import { useGroupStore } from '../../../stores/group.store';
import { colors } from '../../../config/theme';
import { formatVND, formatBalance } from '../../../utils/format';
import { splitEqual, validateSplits, type SplitResult } from '../../../utils/split';
import type { ExpenseWithSplits } from '../../../services/expense.service';

type Tab = 'expenses' | 'balances';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'food', label: 'Ăn uống' },
  { key: 'transport', label: 'Di chuyển' },
  { key: 'accommodation', label: 'Chỗ ở' },
  { key: 'fun', label: 'Vui chơi' },
  { key: 'shopping', label: 'Mua sắm' },
  { key: 'other', label: 'Khác' },
];

export default function TripDetailScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  const {
    trips, currentExpenses, balances, isLoading,
    loadExpenses, addExpense, removeExpense, loadBalances,
  } = useTripStore();
  const { currentGroupMembers, loadMembers } = useGroupStore();

  const [tab, setTab] = useState<Tab>('expenses');
  const [showAddExpense, setShowAddExpense] = useState(false);

  // Add expense form
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('food');
  const [paidBy, setPaidBy] = useState('');
  const [note, setNote] = useState('');

  const trip = trips.find((t) => t.id === tripId);

  useEffect(() => {
    if (!tripId) return;
    loadExpenses(tripId);
    loadBalances(tripId);
  }, [tripId]);

  // Load members when trip is available
  useEffect(() => {
    if (trip?.group_id) {
      loadMembers(trip.group_id);
    }
  }, [trip?.group_id]);

  // Default payer to first member
  useEffect(() => {
    if (!paidBy && currentGroupMembers.length > 0) {
      setPaidBy(currentGroupMembers[0].id);
    }
  }, [currentGroupMembers, paidBy]);

  const handleAddExpense = async () => {
    if (!title.trim() || !amountStr.trim() || !paidBy || !trip) return;

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Lỗi', 'Số tiền phải lớn hơn 0');
      return;
    }

    // Equal split among all members
    const memberIds = currentGroupMembers.map((m) => m.id);
    const splits = splitEqual(amount, memberIds);

    // BR-02 validate
    const err = validateSplits(amount, splits);
    if (err) {
      Alert.alert('Lỗi', err);
      return;
    }

    try {
      await addExpense({
        tripId: trip.id,
        groupId: trip.group_id,
        title: title.trim(),
        amount,
        category,
        paidByMemberId: paidBy,
        splitType: 'equal',
        splits,
        note: note.trim() || undefined,
      });
      // Reset form
      setTitle('');
      setAmountStr('');
      setNote('');
      setCategory('food');
      setShowAddExpense(false);
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
    }
  };

  const handleDeleteExpense = (expense: ExpenseWithSplits) => {
    Alert.alert('Xóa khoản chi', `Xóa "${expense.title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => removeExpense(expense.id, tripId!),
      },
    ]);
  };

  const getPayerName = (memberId: string) => {
    return currentGroupMembers.find((m) => m.id === memberId)?.display_name || '?';
  };

  // ── Renders ──
  const renderExpense = ({ item }: { item: ExpenseWithSplits }) => (
    <Pressable
      onLongPress={() => handleDeleteExpense(item)}
      style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}
    >
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: c.foreground }]}>{item.title}</Text>
        <Text style={[styles.cardMeta, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          {getPayerName(item.paid_by)} đã trả · {CATEGORIES.find((ct) => ct.key === item.category)?.label || item.category}
        </Text>
      </View>
      <Text style={[styles.amountText, { color: c.primary }]}>
        {formatVND(item.amount)}
      </Text>
    </Pressable>
  );

  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

  const tabStyle = (t: Tab) => [
    styles.tab,
    {
      backgroundColor: tab === t ? c.primary : 'transparent',
      borderColor: tab === t ? c.primary : isDark ? '#334155' : '#E2E8F0',
    },
  ];
  const tabText = (t: Tab) => ({
    color: tab === t ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
    fontSize: 14,
    fontWeight: '500' as const,
  });

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: trip?.name || 'Chuyến đi' }} />

      {/* Summary */}
      <View style={[styles.summary, { backgroundColor: isDark ? '#1E293B' : '#F0F9FF' }]}>
        <Text style={[styles.summaryLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Tổng chi</Text>
        <Text style={[styles.summaryAmount, { color: c.primary }]}>{formatVND(totalExpenses)}</Text>
        <Text style={[styles.summaryMeta, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          {currentExpenses.length} khoản · {currentGroupMembers.length} người
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable style={tabStyle('expenses')} onPress={() => setTab('expenses')}>
          <Text style={tabText('expenses')}>Chi phí ({currentExpenses.length})</Text>
        </Pressable>
        <Pressable style={tabStyle('balances')} onPress={() => setTab('balances')}>
          <Text style={tabText('balances')}>Số dư</Text>
        </Pressable>
      </View>

      {/* ── Tab: Expenses ── */}
      {tab === 'expenses' && (
        <View style={styles.tabContent}>
          {trip?.status === 'open' && (
            <View style={styles.sectionActions}>
              <Button variant="primary" size="sm" onPress={() => setShowAddExpense(!showAddExpense)}>
                <Button.Label>{showAddExpense ? 'Hủy' : 'Thêm khoản chi'}</Button.Label>
              </Button>
            </View>
          )}

          {showAddExpense && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView style={[styles.formCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
                <TextInput
                  style={[styles.input, { color: c.foreground, borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#FFF' }]}
                  placeholder="Tên khoản chi (VD: Cà phê)"
                  placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                  value={title}
                  onChangeText={setTitle}
                  autoFocus
                />
                <TextInput
                  style={[styles.input, { color: c.foreground, borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#FFF' }]}
                  placeholder="Số tiền (VND)"
                  placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                  value={amountStr}
                  onChangeText={setAmountStr}
                  keyboardType="number-pad"
                />

                {/* Category picker */}
                <View style={styles.chipRow}>
                  {CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat.key}
                      onPress={() => setCategory(cat.key)}
                      style={[styles.chip, {
                        backgroundColor: category === cat.key ? c.primary : 'transparent',
                        borderColor: category === cat.key ? c.primary : isDark ? '#334155' : '#E2E8F0',
                      }]}
                    >
                      <Text style={{ color: category === cat.key ? '#FFF' : isDark ? '#94A3B8' : '#64748B', fontSize: 12 }}>
                        {cat.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Payer picker */}
                <Text style={[styles.fieldLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Người trả:</Text>
                <View style={styles.chipRow}>
                  {currentGroupMembers.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setPaidBy(m.id)}
                      style={[styles.chip, {
                        backgroundColor: paidBy === m.id ? c.primary : 'transparent',
                        borderColor: paidBy === m.id ? c.primary : isDark ? '#334155' : '#E2E8F0',
                      }]}
                    >
                      <Text style={{ color: paidBy === m.id ? '#FFF' : isDark ? '#94A3B8' : '#64748B', fontSize: 12 }}>
                        {m.display_name}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  style={[styles.input, { color: c.foreground, borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#FFF' }]}
                  placeholder="Ghi chú (tùy chọn)"
                  placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                  value={note}
                  onChangeText={setNote}
                />

                <Text style={[styles.splitInfo, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Chia đều cho {currentGroupMembers.length} người
                </Text>

                <Button variant="primary" size="md" onPress={handleAddExpense}>
                  <Button.Label>Thêm khoản chi</Button.Label>
                </Button>
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          <FlatList
            data={currentExpenses}
            keyExtractor={(item) => item.id}
            renderItem={renderExpense}
            contentContainerStyle={currentExpenses.length === 0 ? styles.emptyContainer : styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: c.foreground, opacity: 0.4 }]}>Chưa có khoản chi nào</Text>
              </View>
            }
          />
        </View>
      )}

      {/* ── Tab: Balances ── */}
      {tab === 'balances' && (
        <FlatList
          data={balances}
          keyExtractor={(item) => item.memberId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={[styles.cardTitle, { color: c.foreground, flex: 1 }]}>
                {item.memberName}
              </Text>
              <Text
                style={[
                  styles.balanceText,
                  { color: item.balance >= 0 ? c.success : c.danger },
                ]}
              >
                {formatBalance(item.balance)}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: c.foreground, opacity: 0.4 }]}>Thêm khoản chi để xem số dư</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summary: { alignItems: 'center', paddingVertical: 16, marginHorizontal: 16, borderRadius: 12, marginTop: 8 },
  summaryLabel: { fontSize: 13 },
  summaryAmount: { fontSize: 28, fontWeight: '700', marginVertical: 2 },
  summaryMeta: { fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabContent: { flex: 1 },
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  formCard: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, gap: 8 },
  input: { height: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  fieldLabel: { fontSize: 13, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  splitInfo: { fontSize: 13, textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 6 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '500' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  amountText: { fontSize: 15, fontWeight: '600' },
  balanceText: { fontSize: 16, fontWeight: '700' },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16 },
});
