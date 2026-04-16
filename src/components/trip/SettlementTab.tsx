import { LinearGradient } from 'expo-linear-gradient';
import { Button, ScrollShadow, useToast } from 'heroui-native';
import { Wallet } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupMember } from '../../services/group.service';
import { hapticSuccess } from '../../utils/haptics';
import type { Payment } from '../../services/payment.service';
import { getErrorMessage } from '../../utils/error';
import { AppCard, AppText, AppTextField, ChipPicker, ConfirmDialog, EmptyState, FormReveal, Money, SwipeableCard } from '../ui';

interface SettlementEntry {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

interface BalanceEntry {
  memberId: string;
  memberName: string;
  balance: number;
}

interface SettlementTabProps {
  tripId: string;
  groupId: string;
  settlements: SettlementEntry[];
  payments: Payment[];
  balances: BalanceEntry[];
  members: GroupMember[];
  onAddPayment: (params: {
    tripId: string;
    groupId: string;
    fromMemberId: string;
    toMemberId: string;
    amount: number;
    note?: string;
  }) => Promise<void>;
  onDeletePayment: (paymentId: string, tripId: string) => Promise<void>;
}

export const SettlementTab = React.memo(function SettlementTab({
  tripId, groupId, settlements, payments, balances, members,
  onAddPayment, onDeletePayment,
}: SettlementTabProps) {
  const c = useAppTheme();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payNote, setPayNote] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const memberOptions = members.map((m) => ({ key: m.id, label: m.display_name }));
  const getMemberName = (id: string) => members.find((m) => m.id === id)?.display_name || '?';

  const handleSubmit = useCallback(async () => {
    if (!payFrom || !payTo || !payAmountStr.trim()) return;
    const amount = parseInt(payAmountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: 'Số tiền phải lớn hơn 0' });
      return;
    }
    if (payFrom === payTo) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: 'Người trả và người nhận không được giống nhau' });
      return;
    }
    try {
      await onAddPayment({
        tripId, groupId,
        fromMemberId: payFrom, toMemberId: payTo,
        amount, note: payNote.trim() || undefined,
      });
      hapticSuccess();
      toast.show({ variant: 'success', label: 'Đã ghi nhận thanh toán' });
      setPayAmountStr(''); setPayNote('');
      setShowForm(false);
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    }
  }, [payFrom, payTo, payAmountStr, payNote, tripId, groupId, onAddPayment]);

  return (
    <ScrollShadow LinearGradientComponent={LinearGradient}>
    <ScrollView contentContainerStyle={styles.list}>
      {settlements.length > 0 && (
        <View style={styles.section}>
          <AppText variant="subtitle" weight="semibold">Đề xuất quyết toán</AppText>
          <AppText variant="caption" tone="muted" style={styles.suggestionHint}>
            Gợi ý tối ưu — chỉ tham khảo
          </AppText>
          {settlements.map((s) => (
            <AppCard
              key={`${s.from}-${s.to}`}
              title={`${s.fromName} → ${s.toName}`}
              trailing={<Money value={s.amount} variant="default" tone="danger" />}
            />
          ))}
        </View>
      )}

      <View style={styles.section}>
        <AppText variant="subtitle" weight="semibold" style={styles.sectionTitle}>
          Thanh toán thực tế
        </AppText>
        <Button variant="primary" size="sm" onPress={() => setShowForm(!showForm)}>
          <Button.Label>{showForm ? 'Hủy' : 'Ghi nhận thanh toán'}</Button.Label>
        </Button>

        <FormReveal isOpen={showForm}>
          <AppText variant="meta" tone="muted" style={styles.fieldLabel}>Người trả tiền</AppText>
          <ChipPicker options={memberOptions} selected={payFrom} onSelect={setPayFrom} />

          <AppText variant="meta" tone="muted" style={styles.fieldLabel}>Người nhận tiền</AppText>
          <ChipPicker options={memberOptions} selected={payTo} onSelect={setPayTo} activeColor={c.success} activeSoft={c.successSoft} />

          <AppTextField placeholder="Số tiền (VND)" value={payAmountStr} onChangeText={setPayAmountStr} keyboardType="number-pad" accessibilityLabel="Số tiền thanh toán" />
          <AppTextField placeholder="Ghi chú (VD: Chuyển khoản Momo)" value={payNote} onChangeText={setPayNote} accessibilityLabel="Ghi chú thanh toán" />

          {payFrom && payTo && payFrom !== payTo && (
            <View style={[styles.previewBox, { backgroundColor: c.surfaceAlt }]}>
              <AppText variant="meta" tone="muted" style={styles.previewLabel}>Số dư hiện tại</AppText>
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

          <Button variant="primary" size="md" onPress={handleSubmit}>
            <Button.Label>Ghi nhận</Button.Label>
          </Button>
        </FormReveal>

        {payments.map((pay) => (
          <SwipeableCard
            key={pay.id}
            title={`${getMemberName(pay.from_member_id)} → ${getMemberName(pay.to_member_id)}`}
            subtitle={pay.note || undefined}
            onDelete={() => setDeleteTarget(pay)}
            onLongPress={() => setDeleteTarget(pay)}
            trailing={<Money value={pay.amount} variant="default" tone="success" />}
          />
        ))}

        {payments.length === 0 && !showForm && (
          <EmptyState icon={Wallet} title="Chưa có thanh toán nào" />
        )}
      </View>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa thanh toán"
        description="Xóa ghi nhận thanh toán này?"
        confirmLabel="Xóa"
        destructive
        onConfirm={async () => {
          if (deleteTarget) {
            try {
              await onDeletePayment(deleteTarget.id, tripId);
            } catch (e: unknown) {
              toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
            }
          }
        }}
      />
    </ScrollView>
    </ScrollShadow>
  );
});

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { marginBottom: 8 },
  suggestionHint: { marginBottom: 8 },
  fieldLabel: { marginTop: 8, marginBottom: 2 },
  previewBox: { padding: 10, borderRadius: 10, gap: 2 },
  previewLabel: { marginBottom: 4 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
});
