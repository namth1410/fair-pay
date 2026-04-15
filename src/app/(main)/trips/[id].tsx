import { Stack,useLocalSearchParams } from 'expo-router';
import { Button } from 'heroui-native';
import { Clock, Receipt, Scale, Wallet } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppCard, AppTextField, ChipPicker, EmptyState, FormReveal, ListSkeleton, SectionTabs } from '../../../components/ui';
import { fonts } from '../../../config/fonts';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { type AuditLog,fetchAuditLogs, getActionLabel } from '../../../services/audit.service';
import type { ExpenseWithSplits } from '../../../services/expense.service';
import type { Payment } from '../../../services/payment.service';
import { useGroupStore } from '../../../stores/group.store';
import { useTripStore } from '../../../stores/trip.store';
import { getErrorMessage } from '../../../utils/error';
import { exportToImage } from '../../../utils/export';
import { formatBalance,formatVND } from '../../../utils/format';
import { type RatioMember,splitByRatio, splitEqual, type SplitResult, validateAmount, validateSplits } from '../../../utils/split';

type Tab = 'expenses' | 'balances' | 'settle' | 'history';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'food', label: 'Ăn uống' },
  { key: 'transport', label: 'Di chuyển' },
  { key: 'accommodation', label: 'Chỗ ở' },
  { key: 'fun', label: 'Vui chơi' },
  { key: 'shopping', label: 'Mua sắm' },
  { key: 'other', label: 'Khác' },
];

const TAB_ITEMS = [
  { key: 'expenses', label: 'Chi phí' },
  { key: 'balances', label: 'Số dư' },
  { key: 'settle', label: 'Quyết toán' },
  { key: 'history', label: 'Lịch sử' },
];

const SPLIT_TYPE_OPTIONS = [
  { key: 'equal' as const, label: 'Đều' },
  { key: 'ratio' as const, label: 'Tỷ lệ' },
  { key: 'custom' as const, label: 'Tùy chỉnh' },
];

export default function TripDetailScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const c = useAppTheme();

  const {
    trips, currentExpenses, currentPayments, balances, settlements,
    isLoading,
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
  const [splitType, setSplitType] = useState<'equal' | 'ratio' | 'custom'>('equal');
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Export ref
  const balanceRef = useRef<View>(null);

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
    fetchAuditLogs(tripId).then(setAuditLogs).catch(() => {});
  }, [tripId]);

  useEffect(() => {
    if (trip?.group_id) loadMembers(trip.group_id);
  }, [trip?.group_id]);

  useEffect(() => {
    if (!paidBy && currentGroupMembers.length > 0) setPaidBy(currentGroupMembers[0]!.id);
  }, [currentGroupMembers, paidBy]);

  const getMemberName = (id: string) =>
    currentGroupMembers.find((m) => m.id === id)?.display_name || '?';

  // ── Derived data for ChipPicker ──
  const memberOptions = currentGroupMembers.map((m) => ({ key: m.id, label: m.display_name }));

  // ── Handlers ──
  const handleAddExpense = async () => {
    if (!title.trim() || !amountStr.trim() || !paidBy || !trip) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Lỗi', 'Số tiền phải lớn hơn 0');
      return;
    }
    const amountErr = validateAmount(amount);
    if (amountErr) { Alert.alert('Lỗi', amountErr); return; }

    const memberIds = currentGroupMembers.map((m) => m.id);
    let splits: SplitResult[];

    if (splitType === 'ratio') {
      const ratioMembers: RatioMember[] = currentGroupMembers.map((m) => ({
        memberId: m.id,
        ratio: parseInt(ratios[m.id] || '1', 10) || 1,
      }));
      splits = splitByRatio(amount, ratioMembers);
    } else if (splitType === 'custom') {
      splits = currentGroupMembers.map((m) => ({
        memberId: m.id,
        amount: parseInt(customAmounts[m.id] || '0', 10) || 0,
      }));
    } else {
      splits = splitEqual(amount, memberIds);
    }

    const err = validateSplits(amount, splits);
    if (err) { Alert.alert('Lỗi', err); return; }
    try {
      await addExpense({
        tripId: trip.id, groupId: trip.group_id,
        title: title.trim(), amount, category, paidByMemberId: paidBy,
        splitType, splits, note: note.trim() || undefined,
      });
      setTitle(''); setAmountStr(''); setNote(''); setCategory('food');
      setSplitType('equal'); setRatios({}); setCustomAmounts({});
      setShowAddExpense(false);
    } catch (e: any) { Alert.alert('Lỗi', getErrorMessage(e)); }
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
    } catch (e: any) { Alert.alert('Lỗi', getErrorMessage(e)); }
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

  // ── Shared styles for ratio/custom split raw TextInputs ──
  const splitInputStyle = [styles.splitInput, {
    color: c.foreground,
    borderColor: c.divider,
    backgroundColor: c.background,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  }];

  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: trip?.name || 'Chuyến đi' }} />

      {/* Summary */}
      <View style={[styles.summary, { backgroundColor: c.surfaceAlt }]}>
        <Text style={[styles.summaryLabel, { color: c.muted }]}>Tổng chi</Text>
        <Text style={[styles.summaryAmount, { color: c.primary }]}>{formatVND(totalExpenses)}</Text>
        <Text style={[styles.summaryMeta, { color: c.muted }]}>
          {currentExpenses.length} khoản · {currentPayments.length} thanh toán · {currentGroupMembers.length} người
        </Text>
      </View>

      {/* Tabs */}
      <SectionTabs
        items={TAB_ITEMS}
        selected={tab}
        onSelect={(key) => setTab(key as Tab)}
      />

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

          <FormReveal isOpen={showAddExpense}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView>
                <View style={{ gap: 8 }}>
                  <AppTextField placeholder="Tên khoản chi" value={title} onChangeText={setTitle} autoFocus />
                  <AppTextField placeholder="Số tiền (VND)" value={amountStr} onChangeText={setAmountStr} keyboardType="number-pad" />
                  <ChipPicker options={CATEGORIES} selected={category} onSelect={setCategory} />
                  <Text style={[styles.fieldLabel, { color: c.muted }]}>Người trả:</Text>
                  <ChipPicker options={memberOptions} selected={paidBy} onSelect={setPaidBy} />
                  <AppTextField placeholder="Ghi chú (tùy chọn)" value={note} onChangeText={setNote} />

                  {/* Split type picker — F-07 */}
                  <Text style={[styles.fieldLabel, { color: c.muted }]}>Cách chia:</Text>
                  <ChipPicker options={SPLIT_TYPE_OPTIONS} selected={splitType} onSelect={setSplitType} />

                  {/* Split details per mode */}
                  {splitType === 'equal' && (
                    <Text style={[styles.splitInfo, { color: c.muted }]}>Chia đều cho {currentGroupMembers.length} người</Text>
                  )}

                  {splitType === 'ratio' && (
                    <View>
                      <Text style={[styles.splitInfo, { color: c.muted }]}>Nhập tỷ lệ cho mỗi người (VD: 2 = gấp đôi)</Text>
                      {currentGroupMembers.map((m) => (
                        <View key={m.id} style={styles.splitRow}>
                          <Text style={[styles.splitMemberName, { color: c.foreground }]}>{m.display_name}</Text>
                          <TextInput
                            style={splitInputStyle}
                            placeholder="1"
                            placeholderTextColor={c.muted}
                            value={ratios[m.id] || ''}
                            onChangeText={(v) => setRatios((prev) => ({ ...prev, [m.id]: v }))}
                            keyboardType="number-pad"
                          />
                          {amountStr && (
                            <Text style={[styles.splitPreview, { color: c.muted }]}>
                              {(() => {
                                const total = parseInt(amountStr, 10) || 0;
                                const members = currentGroupMembers.map((mm) => ({ memberId: mm.id, ratio: parseInt(ratios[mm.id] || '1', 10) || 1 }));
                                const splits = splitByRatio(total, members);
                                const split = splits.find((s) => s.memberId === m.id);
                                return split ? formatVND(split.amount) : '';
                              })()}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {splitType === 'custom' && (
                    <View>
                      <Text style={[styles.splitInfo, { color: c.muted }]}>Nhập số tiền cụ thể cho mỗi người</Text>
                      {currentGroupMembers.map((m) => (
                        <View key={m.id} style={styles.splitRow}>
                          <Text style={[styles.splitMemberName, { color: c.foreground }]}>{m.display_name}</Text>
                          <TextInput
                            style={splitInputStyle}
                            placeholder="0"
                            placeholderTextColor={c.muted}
                            value={customAmounts[m.id] || ''}
                            onChangeText={(v) => setCustomAmounts((prev) => ({ ...prev, [m.id]: v }))}
                            keyboardType="number-pad"
                          />
                        </View>
                      ))}
                      {amountStr && (
                        <Text style={[styles.splitInfo, { color: (() => {
                          const total = parseInt(amountStr, 10) || 0;
                          const sum = currentGroupMembers.reduce((s, m) => s + (parseInt(customAmounts[m.id] || '0', 10) || 0), 0);
                          return sum === total ? c.success : c.danger;
                        })() }]}>
                          Tổng chia: {formatVND(currentGroupMembers.reduce((s, m) => s + (parseInt(customAmounts[m.id] || '0', 10) || 0), 0))} / {formatVND(parseInt(amountStr, 10) || 0)}
                        </Text>
                      )}
                    </View>
                  )}

                  <Button variant="primary" size="md" onPress={handleAddExpense}>
                    <Button.Label>Thêm</Button.Label>
                  </Button>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </FormReveal>

          {isLoading && currentExpenses.length === 0 ? (
            <ListSkeleton count={3} />
          ) : (
            <FlatList
              data={currentExpenses}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <AppCard
                  title={item.title}
                  subtitle={`${getMemberName(item.paid_by)} đã trả · ${CATEGORIES.find((ct) => ct.key === item.category)?.label}`}
                  onLongPress={() => handleDeleteExpense(item)}
                  trailing={<Text style={[styles.amountText, { color: c.primary }]}>{formatVND(item.amount)}</Text>}
                />
              )}
              contentContainerStyle={currentExpenses.length === 0 ? styles.emptyContainer : styles.list}
              ListEmptyComponent={<EmptyState icon={Receipt} title="Chưa có khoản chi nào" />}
            />
          )}
        </View>
      )}

      {/* ══════ Tab: Balances ══════ */}
      {tab === 'balances' && (
        <View style={styles.tabContent}>
          <View style={styles.sectionActions}>
            <Button variant="outline" size="sm" onPress={() => exportToImage(balanceRef)}>
              <Button.Label>Lưu ảnh số dư</Button.Label>
            </Button>
          </View>
          <FlatList
            data={balances}
            keyExtractor={(item) => item.memberId}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View ref={balanceRef} collapsable={false} style={{ backgroundColor: c.background }}>
                <View style={[styles.summary, { backgroundColor: c.surfaceAlt, marginHorizontal: 0, marginBottom: 8 }]}>
                  <Text style={[styles.summaryAmount, { color: c.primary, fontSize: 20 }]}>{trip?.name}</Text>
                  <Text style={[styles.summaryMeta, { color: c.muted }]}>Tổng chi: {formatVND(totalExpenses)}</Text>
                </View>
                {balances.map((item) => (
                  <AppCard
                    key={item.memberId}
                    title={item.memberName}
                    trailing={
                      <Text style={[styles.balanceText, { color: item.balance >= 0 ? c.success : c.danger }]}>
                        {formatBalance(item.balance)}
                      </Text>
                    }
                  />
                ))}
              </View>
            }
            renderItem={() => null}
            ListEmptyComponent={<EmptyState icon={Scale} title="Thêm khoản chi để xem số dư" />}
          />
        </View>
      )}

      {/* ══════ Tab: Settlement ══════ */}
      {tab === 'settle' && (
        <ScrollView contentContainerStyle={styles.list}>
          {/* Suggested settlements (BR-07: suggestions only) */}
          {settlements.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>Đề xuất quyết toán</Text>
              <Text style={[styles.sectionHint, { color: c.muted }]}>Gợi ý tối ưu — chỉ tham khảo</Text>
              {settlements.map((s, i) => (
                <AppCard
                  key={i}
                  title={`${s.fromName} → ${s.toName}`}
                  trailing={<Text style={[styles.amountText, { color: c.danger }]}>{formatVND(s.amount)}</Text>}
                />
              ))}
            </View>
          )}

          {/* Record payment */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>Thanh toán thực tế</Text>
            <Button variant="primary" size="sm" onPress={() => setShowAddPayment(!showAddPayment)}>
              <Button.Label>{showAddPayment ? 'Hủy' : 'Ghi nhận thanh toán'}</Button.Label>
            </Button>

            <FormReveal isOpen={showAddPayment}>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>Người trả tiền:</Text>
              <ChipPicker options={memberOptions} selected={payFrom} onSelect={setPayFrom} />

              <Text style={[styles.fieldLabel, { color: c.muted }]}>Người nhận tiền:</Text>
              <ChipPicker options={memberOptions} selected={payTo} onSelect={setPayTo} activeColor={c.success} />

              <AppTextField placeholder="Số tiền (VND)" value={payAmountStr} onChangeText={setPayAmountStr} keyboardType="number-pad" />
              <AppTextField placeholder="Ghi chú (VD: Chuyển khoản Momo)" value={payNote} onChangeText={setPayNote} />

              {/* Balance preview */}
              {payFrom && payTo && payFrom !== payTo && (
                <View style={[styles.previewBox, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.previewLabel, { color: c.muted }]}>Số dư hiện tại:</Text>
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
            </FormReveal>

            {/* Payment history */}
            {currentPayments.map((pay) => (
              <AppCard
                key={pay.id}
                title={`${getMemberName(pay.from_member_id)} → ${getMemberName(pay.to_member_id)}`}
                subtitle={pay.note || undefined}
                onLongPress={() => handleDeletePayment(pay)}
                trailing={<Text style={[styles.amountText, { color: c.success }]}>{formatVND(pay.amount)}</Text>}
              />
            ))}

            {currentPayments.length === 0 && !showAddPayment && (
              <EmptyState icon={Wallet} title="Chưa có thanh toán nào" />
            )}
          </View>
        </ScrollView>
      )}

      {/* ══════ Tab: History (Audit Log) ══════ */}
      {tab === 'history' && (
        <FlatList
          data={auditLogs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={auditLogs.length === 0 ? styles.emptyContainer : styles.list}
          renderItem={({ item }) => {
            const time = new Date(item.created_at);
            const timeStr = `${time.getDate()}/${time.getMonth() + 1} ${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
            return (
              <AppCard
                title={`${item.actor_name} — ${getActionLabel(item.action)}`}
                subtitle={timeStr}
              />
            );
          }}
          ListEmptyComponent={<EmptyState icon={Clock} title="Chưa có lịch sử thay đổi" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summary: { alignItems: 'center', paddingVertical: 16, marginHorizontal: 16, borderRadius: 12, marginTop: 8 },
  summaryLabel: { fontSize: 13 },
  summaryAmount: { fontSize: 28, fontWeight: '700', fontFamily: fonts.bold, marginVertical: 2 },
  summaryMeta: { fontSize: 13 },
  tabContent: { flex: 1 },
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semibold, marginBottom: 4 },
  sectionHint: { fontSize: 13, marginBottom: 8 },
  fieldLabel: { fontSize: 13, marginTop: 4 },
  splitInfo: { fontSize: 13, textAlign: 'center' },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  splitMemberName: { flex: 1, fontSize: 14 },
  splitInput: { width: 70, textAlign: 'center' },
  splitPreview: { fontSize: 12, width: 80, textAlign: 'right' },
  previewBox: { padding: 10, borderRadius: 8, gap: 2 },
  previewLabel: { fontSize: 12, marginBottom: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  amountText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semibold },
  balanceText: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bold },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
