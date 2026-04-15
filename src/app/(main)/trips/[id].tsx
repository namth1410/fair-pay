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
  TextInput,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import {
  AppCard,
  AppText,
  AppTextField,
  CategoryIcon,
  ChipPicker,
  EmptyState,
  FormReveal,
  ListSkeleton,
  Money,
  SectionTabs,
} from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { type AuditLog,fetchAuditLogs, getActionLabel } from '../../../services/audit.service';
import type { ExpenseWithSplits } from '../../../services/expense.service';
import type { Payment } from '../../../services/payment.service';
import { useGroupStore } from '../../../stores/group.store';
import { useTripStore } from '../../../stores/trip.store';
import { getErrorMessage } from '../../../utils/error';
import { exportToImage } from '../../../utils/export';
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

  const memberOptions = currentGroupMembers.map((m) => ({ key: m.id, label: m.display_name }));

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
    Alert.alert('Xóa thanh toán', `Xóa ghi nhận thanh toán này?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => removePayment(payment.id, tripId!) },
    ]);
  };

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

      {/* Summary hero */}
      <View style={styles.heroWrap}>
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <Defs>
            <LinearGradient id="tripHeroGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={c.accentSoft} />
              <Stop offset="100%" stopColor={c.tint} />
            </LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#tripHeroGrad)" />
        </Svg>
        <View style={styles.heroInner}>
          <AppText variant="label" tone="muted">TỔNG CHI</AppText>
          <Money value={totalExpenses} variant="hero" tone="primary" animate />
          <AppText variant="meta" tone="muted" style={{ marginTop: 2 }}>
            {currentExpenses.length} khoản · {currentPayments.length} thanh toán · {currentGroupMembers.length} người
          </AppText>
        </View>
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
                  <AppText variant="meta" tone="muted" style={styles.fieldLabel}>Người trả</AppText>
                  <ChipPicker options={memberOptions} selected={paidBy} onSelect={setPaidBy} />
                  <AppTextField placeholder="Ghi chú (tùy chọn)" value={note} onChangeText={setNote} />

                  <AppText variant="meta" tone="muted" style={styles.fieldLabel}>Cách chia</AppText>
                  <ChipPicker options={SPLIT_TYPE_OPTIONS} selected={splitType} onSelect={setSplitType} />

                  {splitType === 'equal' && (
                    <AppText variant="caption" tone="muted" center>
                      Chia đều cho {currentGroupMembers.length} người
                    </AppText>
                  )}

                  {splitType === 'ratio' && (
                    <View>
                      <AppText variant="caption" tone="muted" center>
                        Nhập tỷ lệ cho mỗi người (VD: 2 = gấp đôi)
                      </AppText>
                      {currentGroupMembers.map((m) => (
                        <View key={m.id} style={styles.splitRow}>
                          <AppText variant="body" style={{ flex: 1 }}>
                            {m.display_name}
                          </AppText>
                          <TextInput
                            style={splitInputStyle}
                            placeholder="1"
                            placeholderTextColor={c.muted}
                            value={ratios[m.id] || ''}
                            onChangeText={(v) => setRatios((prev) => ({ ...prev, [m.id]: v }))}
                            keyboardType="number-pad"
                          />
                          {amountStr && (
                            <View style={{ width: 80, alignItems: 'flex-end' }}>
                              <Money
                                value={
                                  splitByRatio(
                                    parseInt(amountStr, 10) || 0,
                                    currentGroupMembers.map((mm) => ({
                                      memberId: mm.id,
                                      ratio: parseInt(ratios[mm.id] || '1', 10) || 1,
                                    })),
                                  ).find((s) => s.memberId === m.id)?.amount ?? 0
                                }
                                variant="compact"
                                tone="muted"
                              />
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {splitType === 'custom' && (
                    <View>
                      <AppText variant="caption" tone="muted" center>
                        Nhập số tiền cụ thể cho mỗi người
                      </AppText>
                      {currentGroupMembers.map((m) => (
                        <View key={m.id} style={styles.splitRow}>
                          <AppText variant="body" style={{ flex: 1 }}>
                            {m.display_name}
                          </AppText>
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
                      {amountStr && (() => {
                        const total = parseInt(amountStr, 10) || 0;
                        const sum = currentGroupMembers.reduce((s, m) => s + (parseInt(customAmounts[m.id] || '0', 10) || 0), 0);
                        const balanced = sum === total;
                        return (
                          <View style={styles.customTotal}>
                            <AppText variant="caption" tone={balanced ? 'success' : 'danger'} weight="medium" center>
                              Tổng chia: {sum.toLocaleString('vi-VN')}₫ / {total.toLocaleString('vi-VN')}₫
                            </AppText>
                          </View>
                        );
                      })()}
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
                  leading={<CategoryIcon kind="expense" value={item.category} size={40} />}
                  onLongPress={() => handleDeleteExpense(item)}
                  trailing={<Money value={item.amount} variant="default" tone="primary" />}
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
                <View style={[styles.exportSummary, { backgroundColor: c.surfaceAlt }]}>
                  <AppText variant="title" weight="bold" tone="primary">{trip?.name}</AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <AppText variant="caption" tone="muted">Tổng chi:</AppText>
                    <Money value={totalExpenses} variant="default" tone="primary" />
                  </View>
                </View>
                {balances.map((item) => {
                  const positive = item.balance >= 0;
                  return (
                    <AppCard
                      key={item.memberId}
                      title={item.memberName}
                      subtitle={positive ? 'Được nợ' : 'Đang nợ'}
                      borderLeft={{ width: 3, color: positive ? c.success : c.danger }}
                      trailing={
                        <Money
                          value={Math.abs(item.balance)}
                          variant="default"
                          tone={positive ? 'success' : 'danger'}
                          showSign
                        />
                      }
                    />
                  );
                })}
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
          {settlements.length > 0 && (
            <View style={styles.section}>
              <AppText variant="subtitle" weight="semibold">Đề xuất quyết toán</AppText>
              <AppText variant="caption" tone="muted" style={{ marginBottom: 8 }}>
                Gợi ý tối ưu — chỉ tham khảo
              </AppText>
              {settlements.map((s, i) => (
                <AppCard
                  key={i}
                  title={`${s.fromName} → ${s.toName}`}
                  trailing={<Money value={s.amount} variant="default" tone="danger" />}
                />
              ))}
            </View>
          )}

          <View style={styles.section}>
            <AppText variant="subtitle" weight="semibold" style={{ marginBottom: 8 }}>
              Thanh toán thực tế
            </AppText>
            <Button variant="primary" size="sm" onPress={() => setShowAddPayment(!showAddPayment)}>
              <Button.Label>{showAddPayment ? 'Hủy' : 'Ghi nhận thanh toán'}</Button.Label>
            </Button>

            <FormReveal isOpen={showAddPayment}>
              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>Người trả tiền</AppText>
              <ChipPicker options={memberOptions} selected={payFrom} onSelect={setPayFrom} />

              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>Người nhận tiền</AppText>
              <ChipPicker options={memberOptions} selected={payTo} onSelect={setPayTo} activeColor={c.success} activeSoft={c.successSoft} />

              <AppTextField placeholder="Số tiền (VND)" value={payAmountStr} onChangeText={setPayAmountStr} keyboardType="number-pad" />
              <AppTextField placeholder="Ghi chú (VD: Chuyển khoản Momo)" value={payNote} onChangeText={setPayNote} />

              {payFrom && payTo && payFrom !== payTo && (
                <View style={[styles.previewBox, { backgroundColor: c.surfaceAlt }]}>
                  <AppText variant="meta" tone="muted" style={{ marginBottom: 4 }}>Số dư hiện tại</AppText>
                  {[payFrom, payTo].map((memberId) => {
                    const bal = balances.find((b) => b.memberId === memberId)?.balance || 0;
                    return (
                      <View key={memberId} style={styles.previewRow}>
                        <AppText variant="caption">{getMemberName(memberId)}</AppText>
                        <Money
                          value={Math.abs(bal)}
                          variant="compact"
                          tone={bal >= 0 ? 'success' : 'danger'}
                          showSign
                        />
                      </View>
                    );
                  })}
                </View>
              )}

              <Button variant="primary" size="md" onPress={handleAddPayment}>
                <Button.Label>Ghi nhận</Button.Label>
              </Button>
            </FormReveal>

            {currentPayments.map((pay) => (
              <AppCard
                key={pay.id}
                title={`${getMemberName(pay.from_member_id)} → ${getMemberName(pay.to_member_id)}`}
                subtitle={pay.note || undefined}
                onLongPress={() => handleDeletePayment(pay)}
                trailing={<Money value={pay.amount} variant="default" tone="success" />}
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
  heroWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  heroInner: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 2,
  },
  tabContent: { flex: 1 },
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  section: { marginBottom: 24 },
  fieldLabel: { marginTop: 8, marginBottom: 2 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  splitInput: { width: 70, textAlign: 'center' },
  customTotal: { marginTop: 8, paddingVertical: 6 },
  previewBox: { padding: 10, borderRadius: 10, gap: 2 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },

  exportSummary: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
});
