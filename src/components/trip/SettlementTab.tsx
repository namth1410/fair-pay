import { Button } from 'heroui-native';
import Wallet from 'lucide-react-native/dist/esm/icons/wallet';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { GroupMember } from '../../services/group.service';
import type { Payment } from '../../services/payment.service';
import { showError } from '../../utils/toast';
import { AppCard, AppText, BouncyDialog, EmptyState, Money, SwipeableCard } from '../ui';
import { RecordPaymentSheet } from './RecordPaymentSheet';

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
  tripStatus: string;
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
  tripId, tripStatus, groupId, settlements, payments, balances, members,
  onAddPayment, onDeletePayment,
}: SettlementTabProps) {
  const isOpen = tripStatus === 'open';

  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const getMemberName = useCallback(
    (id: string) => members.find((m) => m.id === id)?.display_name || '?',
    [members],
  );

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
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
          {isOpen ? (
            <View style={styles.recordBtnWrap}>
              <Button variant="primary" size="sm" onPress={() => setSheetOpen(true)}>
                <Button.Label>Ghi nhận thanh toán</Button.Label>
              </Button>
            </View>
          ) : null}

          {payments.map((pay) => (
            <SwipeableCard
              key={pay.id}
              title={`${getMemberName(pay.from_member_id)} → ${getMemberName(pay.to_member_id)}`}
              subtitle={pay.note || undefined}
              onDelete={isOpen ? () => setDeleteTarget(pay) : undefined}
              onLongPress={isOpen ? () => setDeleteTarget(pay) : undefined}
              trailing={<Money value={pay.amount} variant="default" tone="success" />}
            />
          ))}

          {payments.length === 0 && (
            <EmptyState icon={Wallet} title="Chưa có thanh toán nào" />
          )}
        </View>

        <BouncyDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
        >
          <BouncyDialog.Title>Xóa thanh toán</BouncyDialog.Title>
          <BouncyDialog.Description>Xóa ghi nhận thanh toán này?</BouncyDialog.Description>
          <BouncyDialog.Actions>
            <Button variant="ghost" size="sm" onPress={() => setDeleteTarget(null)}>
              <Button.Label>Hủy</Button.Label>
            </Button>
            <Button
              variant="danger"
              size="sm"
              onPress={async () => {
                const target = deleteTarget;
                setDeleteTarget(null);
                if (target) {
                  try {
                    await onDeletePayment(target.id, tripId);
                  } catch (e: unknown) {
                    showError(e);
                  }
                }
              }}
            >
              <Button.Label>Xóa</Button.Label>
            </Button>
          </BouncyDialog.Actions>
        </BouncyDialog>
      </ScrollView>

      <RecordPaymentSheet
        isOpen={sheetOpen}
        onOpenChange={setSheetOpen}
        tripId={tripId}
        groupId={groupId}
        members={members}
        balances={balances}
        onAddPayment={onAddPayment}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { marginBottom: 8 },
  suggestionHint: { marginBottom: 8 },
  recordBtnWrap: { marginBottom: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
});
