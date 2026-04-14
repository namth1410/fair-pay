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
import { splitEqual, validateSplits } from '../../../utils/split';
import type { ExpenseWithSplits } from '../../../services/expense.service';
import type { Payment } from '../../../services/payment.service';

type Tab = 'expenses' | 'balances' | 'settle';

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
    trips, currentExpenses, currentPayments, balances, settlements, isLoading,
    loadExpenses, addExpense, removeExpense,
    loadPayments, addPayment, removePayment,
    loadBalances,
  } = useTripStore();
  const { currentGroupMembers, loadMembers } = useGroupStore();

  const [tab, setTab] = useState<Tab>('expenses');

  // Add expense form
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('food');
  const [paidBy, setPaidBy] = useState('');
  const [note, setNote] = useState('');

  // Add payment form
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payNote, setPayNote] = useState('');

  const trip = trips.find((t) => t.id === tripId);

  useEffect(() => {
    if (!tripId) return;
    loadExpenses(tripId);
    loadPayments(tripId);
    loadBalances(tripId);
  }, [tripId]);

  useEffect(() => {
    if (trip?.group_id) loadMembers(trip.group_id);
  }, [trip?.group_id]);

  useEffect(() => {
    if (!paidBy && currentGroupMembers.length > 0) setPaidBy(currentGroupMembers[0].id);
  }, [currentGroupMembers, paidBy]);

  const getMemberName = (id: string) =>
    currentGroupMembers.find((m) => m.id === id)?.display_name || '?';

  // ── Handlers ──
  const handleAddExpense = async () => {
    if (!title.trim() || !amountStr.trim() || !paidBy || !trip) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Lỗi', 'Số tiền phải lớn hơn 0');
      return;
    }
    const memberIds = currentGroupMembers.map((m) => m.id);
    const splits = splitEqual(amount, memberIds);
    const err = validateSplits(amount, splits);
    if (err) { Alert.alert('Lỗi', err); return; }
    try {
      await addExpense({
        tripId: trip.id, groupId: trip.group_id,
        title: title.trim(), amount, category, paidByMemberId: paidBy,
        splitType: 'equal', splits, note: note.trim() || undefined,
      });
      setTitle(''); setAmountStr(''); setNote(''); setCategory('food');
      setShowAddExpense(false);
    } catch (e: any) { Alert.alert('Lỗi', e.message); }
  };

  const handleAddPayment = async () => {
    if (!payFrom || !payTo || !payAmountStr.trim() || !trip) return;
    const amount = parseInt(payAmountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Lỗi', 'Số tiền phải lớn hơn 0');
      return;
    }
    if (payFrom === payTo) {
      Alert.alert('Lỗi', 'Người trả và người nhận không được giống nhau');
      return;
    }
    try {
      await addPayment({
        tripId: trip.id, groupId: trip.group_id,
        fromMemberId: payFrom, toMemberId: payTo,
        amount, note: payNote.trim() || undefined,
      });
      setPayAmountStr(''); setPayNote('');
      setShowAddPayment(false);
    } catch (e: any) { Alert.alert('Lỗi', e.message); }
  };

  const handleDeleteExpense = (expense: ExpenseWithSplits) => {
    Alert.alert('Xóa khoản chi', `Xóa "${expense.title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => removeExpense(expense.id, tripId!) },
    ]);
  };

  const handleDeletePayment = (payment: Payment) => {
    Alert.alert('Xóa thanh toán', `Xóa ghi nhận ${formatVND(payment.amount)}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => removePayment(payment.id, tripId!) },
    ]);
  };

  // ── Shared styles ──
  const inputStyle = [styles.input, {
    color: c.foreground,
    borderColor: isDark ? '#334155' : '#E2E8F0',
    backgroundColor: isDark ? '#0F172A' : '#FFF',
  }];
  const phColor = isDark ? '#94A3B8' : '#64748B';
  const cardBg = isDark ? '#1E293B' : '#F8FAFC';

  const tabStyle = (t: Tab) => [styles.tab, {
    backgroundColor: tab === t ? c.primary : 'transparent',
    borderColor: tab === t ? c.primary : isDark ? '#334155' : '#E2E8F0',
  }];
  const tabText = (t: Tab) => ({
    color: tab === t ? '#FFFFFF' : phColor, fontSize: 14, fontWeight: '500' as const,
  });

  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: trip?.name || 'Chuyến đi' }} />

      {/* Summary */}
      <View style={[styles.summary, { backgroundColor: isDark ? '#1E293B' : '#F0F9FF' }]}>
        <Text style={[styles.summaryLabel, { color: phColor }]}>Tổng chi</Text>
        <Text style={[styles.summaryAmount, { color: c.primary }]}>{formatVND(totalExpenses)}</Text>
        <Text style={[styles.summaryMeta, { color: phColor }]}>
          {currentExpenses.length} khoản · {currentPayments.length} thanh toán · {currentGroupMembers.length} người
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable style={tabStyle('expenses')} onPress={() => setTab('expenses')}>
          <Text style={tabText('expenses')}>Chi phí</Text>
        </Pressable>
        <Pressable style={tabStyle('balances')} onPress={() => setTab('balances')}>
          <Text style={tabText('balances')}>Số dư</Text>
        </Pressable>
        <Pressable style={tabStyle('settle')} onPress={() => setTab('settle')}>
          <Text style={tabText('settle')}>Quyết toán</Text>
        </Pressable>
      </View>

      {/* ══════ Tab: Expenses ══════ */}
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
              <ScrollView style={[styles.formCard, { backgroundColor: cardBg }]}>
                <TextInput style={inputStyle} placeholder="Tên khoản chi" placeholderTextColor={phColor} value={title} onChangeText={setTitle} autoFocus />
                <TextInput style={inputStyle} placeholder="Số tiền (VND)" placeholderTextColor={phColor} value={amountStr} onChangeText={setAmountStr} keyboardType="number-pad" />
                <View style={styles.chipRow}>
                  {CATEGORIES.map((cat) => (
                    <Pressable key={cat.key} onPress={() => setCategory(cat.key)}
                      style={[styles.chip, { backgroundColor: category === cat.key ? c.primary : 'transparent', borderColor: category === cat.key ? c.primary : isDark ? '#334155' : '#E2E8F0' }]}>
                      <Text style={{ color: category === cat.key ? '#FFF' : phColor, fontSize: 12 }}>{cat.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.fieldLabel, { color: phColor }]}>Người trả:</Text>
                <View style={styles.chipRow}>
                  {currentGroupMembers.map((m) => (
                    <Pressable key={m.id} onPress={() => setPaidBy(m.id)}
                      style={[styles.chip, { backgroundColor: paidBy === m.id ? c.primary : 'transparent', borderColor: paidBy === m.id ? c.primary : isDark ? '#334155' : '#E2E8F0' }]}>
                      <Text style={{ color: paidBy === m.id ? '#FFF' : phColor, fontSize: 12 }}>{m.display_name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput style={inputStyle} placeholder="Ghi chú (tùy chọn)" placeholderTextColor={phColor} value={note} onChangeText={setNote} />
                <Text style={[styles.splitInfo, { color: phColor }]}>Chia đều cho {currentGroupMembers.length} người</Text>
                <Button variant="primary" size="md" onPress={handleAddExpense}>
                  <Button.Label>Thêm</Button.Label>
                </Button>
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          <FlatList
            data={currentExpenses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable onLongPress={() => handleDeleteExpense(item)} style={[styles.card, { backgroundColor: cardBg }]}>
                <View style={styles.cardContent}>
                  <Text style={[styles.cardTitle, { color: c.foreground }]}>{item.title}</Text>
                  <Text style={[styles.cardMeta, { color: phColor }]}>
                    {getMemberName(item.paid_by)} đã trả · {CATEGORIES.find((ct) => ct.key === item.category)?.label}
                  </Text>
                </View>
                <Text style={[styles.amountText, { color: c.primary }]}>{formatVND(item.amount)}</Text>
              </Pressable>
            )}
            contentContainerStyle={currentExpenses.length === 0 ? styles.emptyContainer : styles.list}
            ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyText, { color: c.foreground, opacity: 0.4 }]}>Chưa có khoản chi nào</Text></View>}
          />
        </View>
      )}

      {/* ══════ Tab: Balances ══════ */}
      {tab === 'balances' && (
        <FlatList
          data={balances}
          keyExtractor={(item) => item.memberId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardTitle, { color: c.foreground, flex: 1 }]}>{item.memberName}</Text>
              <Text style={[styles.balanceText, { color: item.balance >= 0 ? c.success : c.danger }]}>
                {formatBalance(item.balance)}
              </Text>
            </View>
          )}
          ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyText, { color: c.foreground, opacity: 0.4 }]}>Thêm khoản chi để xem số dư</Text></View>}
        />
      )}

      {/* ══════ Tab: Settlement ══════ */}
      {tab === 'settle' && (
        <ScrollView contentContainerStyle={styles.list}>
          {/* Suggested settlements (BR-07: suggestions only) */}
          {settlements.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>Đề xuất quyết toán</Text>
              <Text style={[styles.sectionHint, { color: phColor }]}>Gợi ý tối ưu — chỉ tham khảo</Text>
              {settlements.map((s, i) => (
                <View key={i} style={[styles.card, { backgroundColor: cardBg }]}>
                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: c.foreground }]}>
                      {s.fromName} → {s.toName}
                    </Text>
                  </View>
                  <Text style={[styles.amountText, { color: c.danger }]}>{formatVND(s.amount)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Record payment */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>Thanh toán thực tế</Text>
            <Button variant="primary" size="sm" onPress={() => setShowAddPayment(!showAddPayment)}>
              <Button.Label>{showAddPayment ? 'Hủy' : 'Ghi nhận thanh toán'}</Button.Label>
            </Button>

            {showAddPayment && (
              <View style={[styles.formCard, { backgroundColor: cardBg, marginHorizontal: 0 }]}>
                <Text style={[styles.fieldLabel, { color: phColor }]}>Người trả tiền:</Text>
                <View style={styles.chipRow}>
                  {currentGroupMembers.map((m) => (
                    <Pressable key={m.id} onPress={() => setPayFrom(m.id)}
                      style={[styles.chip, { backgroundColor: payFrom === m.id ? c.primary : 'transparent', borderColor: payFrom === m.id ? c.primary : isDark ? '#334155' : '#E2E8F0' }]}>
                      <Text style={{ color: payFrom === m.id ? '#FFF' : phColor, fontSize: 12 }}>{m.display_name}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { color: phColor }]}>Người nhận tiền:</Text>
                <View style={styles.chipRow}>
                  {currentGroupMembers.map((m) => (
                    <Pressable key={m.id} onPress={() => setPayTo(m.id)}
                      style={[styles.chip, { backgroundColor: payTo === m.id ? c.success : 'transparent', borderColor: payTo === m.id ? c.success : isDark ? '#334155' : '#E2E8F0' }]}>
                      <Text style={{ color: payTo === m.id ? '#FFF' : phColor, fontSize: 12 }}>{m.display_name}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput style={inputStyle} placeholder="Số tiền (VND)" placeholderTextColor={phColor} value={payAmountStr} onChangeText={setPayAmountStr} keyboardType="number-pad" />
                <TextInput style={inputStyle} placeholder="Ghi chú (VD: Chuyển khoản Momo)" placeholderTextColor={phColor} value={payNote} onChangeText={setPayNote} />

                {/* Balance preview */}
                {payFrom && payTo && payFrom !== payTo && (
                  <View style={[styles.previewBox, { backgroundColor: isDark ? '#0F172A' : '#F0F9FF' }]}>
                    <Text style={[styles.previewLabel, { color: phColor }]}>Số dư hiện tại:</Text>
                    <Text style={{ color: c.foreground, fontSize: 13 }}>
                      {getMemberName(payFrom)}: {formatBalance(balances.find((b) => b.memberId === payFrom)?.balance || 0)}
                    </Text>
                    <Text style={{ color: c.foreground, fontSize: 13 }}>
                      {getMemberName(payTo)}: {formatBalance(balances.find((b) => b.memberId === payTo)?.balance || 0)}
                    </Text>
                  </View>
                )}

                <Button variant="primary" size="md" onPress={handleAddPayment}>
                  <Button.Label>Ghi nhận</Button.Label>
                </Button>
              </View>
            )}

            {/* Payment history */}
            {currentPayments.map((pay) => (
              <Pressable key={pay.id} onLongPress={() => handleDeletePayment(pay)}
                style={[styles.card, { backgroundColor: cardBg }]}>
                <View style={styles.cardContent}>
                  <Text style={[styles.cardTitle, { color: c.foreground }]}>
                    {getMemberName(pay.from_member_id)} → {getMemberName(pay.to_member_id)}
                  </Text>
                  {pay.note && <Text style={[styles.cardMeta, { color: phColor }]}>{pay.note}</Text>}
                </View>
                <Text style={[styles.amountText, { color: c.success }]}>{formatVND(pay.amount)}</Text>
              </Pressable>
            ))}

            {currentPayments.length === 0 && !showAddPayment && (
              <Text style={[styles.emptyText, { color: c.foreground, opacity: 0.4, marginTop: 12 }]}>
                Chưa có thanh toán nào
              </Text>
            )}
          </View>
        </ScrollView>
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
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  sectionHint: { fontSize: 13, marginBottom: 8 },
  formCard: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, gap: 8 },
  input: { height: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  fieldLabel: { fontSize: 13, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  splitInfo: { fontSize: 13, textAlign: 'center' },
  previewBox: { padding: 10, borderRadius: 8, gap: 2 },
  previewLabel: { fontSize: 12, marginBottom: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 6 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '500' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  amountText: { fontSize: 15, fontWeight: '600' },
  balanceText: { fontSize: 16, fontWeight: '700' },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, textAlign: 'center' },
});
