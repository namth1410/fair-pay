import { Button } from 'heroui-native';
import Wallet from 'lucide-react-native/dist/esm/icons/wallet';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupMember } from '../../services/group.service';
import type { Payment } from '../../services/payment.service';
import { formatVND } from '../../utils/format';
import { hapticSuccess } from '../../utils/haptics';
import { showError, showSuccess, showWarning } from '../../utils/toast';
import { AppText, BouncyDialog, EmptyState, Money, SwipeableCard } from '../ui';
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

type AddPaymentParams = {
  tripId: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  note?: string;
};

interface SettlementTabProps {
  tripId: string;
  tripStatus: string;
  groupId: string;
  settlements: SettlementEntry[];
  payments: Payment[];
  balances: BalanceEntry[];
  members: GroupMember[];
  /** Member id của user hiện tại trong nhóm (null nếu không map được) — cho góc nhìn "tôi". */
  myMemberId: string | null;
  onAddPayment: (params: AddPaymentParams) => Promise<void>;
  onAddPayments: (list: AddPaymentParams[]) => Promise<{ ok: number; failed: number }>;
  onDeletePayment: (paymentId: string, tripId: string) => Promise<void>;
}

/** Một dòng đề xuất quyết toán — nhãn + tiền + 2 nút (Sửa / Ghi nhận). */
const SettlementSuggestionRow = React.memo(function SettlementSuggestionRow({
  label, amount, interactive, busy, onRecord, onEdit,
}: {
  label: string;
  amount: number;
  interactive: boolean;
  busy: boolean;
  onRecord: () => void;
  onEdit: () => void;
}) {
  const c = useAppTheme();
  return (
    <View style={[styles.suggestCard, { backgroundColor: c.surface, shadowColor: c.foreground }]}>
      <View style={styles.suggestTop}>
        <AppText variant="body" weight="semibold" numberOfLines={1} style={styles.suggestLabel}>
          {label}
        </AppText>
        <Money value={amount} variant="default" tone="danger" />
      </View>
      {interactive ? (
        <View style={styles.suggestBtnRow}>
          <Button variant="ghost" size="sm" onPress={onEdit} isDisabled={busy}>
            <Button.Label>Sửa</Button.Label>
          </Button>
          <Button variant="primary" size="sm" onPress={onRecord} isDisabled={busy}>
            <Button.Label>Ghi nhận</Button.Label>
          </Button>
        </View>
      ) : null}
    </View>
  );
});

export const SettlementTab = React.memo(function SettlementTab({
  tripId, tripStatus, groupId, settlements, payments, balances, members, myMemberId,
  onAddPayment, onAddPayments, onDeletePayment,
}: SettlementTabProps) {
  const isOpen = tripStatus === 'open';

  const [sheetOpen, setSheetOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [confirm, setConfirm] = useState<SettlementEntry | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const busy = confirmBusy || batchBusy;

  const getMemberName = useCallback(
    (id: string) => members.find((m) => m.id === id)?.display_name || '?',
    [members],
  );

  // Góc nhìn "tôi": đề xuất liên quan user hiện tại lên đầu, giữ thứ tự gốc bên trong.
  const sortedSettlements = useMemo(() => {
    if (!myMemberId) return settlements;
    const mine = settlements.filter((s) => s.from === myMemberId || s.to === myMemberId);
    const others = settlements.filter((s) => s.from !== myMemberId && s.to !== myMemberId);
    return mine.length === 0 ? settlements : [...mine, ...others];
  }, [settlements, myMemberId]);

  const labelFor = useCallback(
    (s: SettlementEntry) => {
      if (myMemberId && s.from === myMemberId) return `Bạn cần trả ${s.toName}`;
      if (myMemberId && s.to === myMemberId) return `${s.fromName} cần trả bạn`;
      return `${s.fromName} → ${s.toName}`;
    },
    [myMemberId],
  );

  const batchTotal = useMemo(
    () => settlements.reduce((sum, s) => sum + s.amount, 0),
    [settlements],
  );

  const openRecordGeneric = useCallback(() => {
    setPrefill(null);
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback((s: SettlementEntry) => {
    setPrefill({ from: s.from, to: s.to, amount: s.amount });
    setSheetOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await onAddPayment({
        tripId, groupId,
        fromMemberId: confirm.from,
        toMemberId: confirm.to,
        amount: confirm.amount,
      });
      hapticSuccess();
      showSuccess('Đã ghi nhận thanh toán');
      setConfirm(null);
    } catch (e: unknown) {
      showError(e);
    } finally {
      setConfirmBusy(false);
    }
  }, [confirm, confirmBusy, onAddPayment, tripId, groupId]);

  const handleBatch = useCallback(async () => {
    if (batchBusy) return;
    setBatchBusy(true);
    try {
      const list: AddPaymentParams[] = settlements.map((s) => ({
        tripId, groupId,
        fromMemberId: s.from,
        toMemberId: s.to,
        amount: s.amount,
      }));
      const { ok, failed } = await onAddPayments(list);
      hapticSuccess();
      if (failed === 0) {
        showSuccess(`Đã ghi nhận ${ok} thanh toán`);
      } else {
        showWarning(`Đã ghi ${ok}/${ok + failed} thanh toán`, {
          description: `${failed} giao dịch lỗi, thử lại sau`,
        });
      }
      setBatchOpen(false);
    } catch (e: unknown) {
      showError(e);
    } finally {
      setBatchBusy(false);
    }
  }, [batchBusy, settlements, onAddPayments, tripId, groupId]);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {settlements.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <AppText variant="subtitle" weight="semibold">Đề xuất quyết toán</AppText>
              {isOpen && settlements.length > 1 ? (
                <Button variant="ghost" size="sm" onPress={() => setBatchOpen(true)} isDisabled={busy}>
                  <Button.Label>Quyết toán tất cả</Button.Label>
                </Button>
              ) : null}
            </View>
            <AppText variant="caption" tone="muted" style={styles.suggestionHint}>
              {isOpen
                ? "Nhấn 'Ghi nhận' để xác nhận nhanh • 'Sửa' để đổi số tiền"
                : 'Gợi ý tối ưu — chỉ tham khảo'}
            </AppText>
            {sortedSettlements.map((s) => (
              <SettlementSuggestionRow
                key={`${s.from}-${s.to}`}
                label={labelFor(s)}
                amount={s.amount}
                interactive={isOpen}
                busy={busy}
                onRecord={() => setConfirm(s)}
                onEdit={() => openEdit(s)}
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
              <Button variant="primary" size="sm" onPress={openRecordGeneric}>
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

        {/* Xác nhận ghi nhận nhanh từ một đề xuất */}
        <BouncyDialog isOpen={!!confirm} onClose={() => { if (!confirmBusy) setConfirm(null); }}>
          <BouncyDialog.Title>Ghi nhận thanh toán</BouncyDialog.Title>
          <BouncyDialog.Description>
            {confirm ? `${labelFor(confirm)} — ${formatVND(confirm.amount)}` : ''}
          </BouncyDialog.Description>
          <BouncyDialog.Actions>
            <Button variant="ghost" size="sm" onPress={() => setConfirm(null)} isDisabled={confirmBusy}>
              <Button.Label>Hủy</Button.Label>
            </Button>
            <Button variant="primary" size="sm" onPress={handleConfirm} isDisabled={confirmBusy}>
              <Button.Label>{confirmBusy ? 'Đang ghi...' : 'Ghi nhận'}</Button.Label>
            </Button>
          </BouncyDialog.Actions>
        </BouncyDialog>

        {/* Quyết toán tất cả */}
        <BouncyDialog isOpen={batchOpen} onClose={() => { if (!batchBusy) setBatchOpen(false); }}>
          <BouncyDialog.Title>Quyết toán tất cả</BouncyDialog.Title>
          <BouncyDialog.Description>
            {`Ghi nhận tất cả ${settlements.length} giao dịch (${formatVND(batchTotal)})? Số dư mọi người sẽ về 0.`}
          </BouncyDialog.Description>
          <BouncyDialog.Actions>
            <Button variant="ghost" size="sm" onPress={() => setBatchOpen(false)} isDisabled={batchBusy}>
              <Button.Label>Hủy</Button.Label>
            </Button>
            <Button variant="primary" size="sm" onPress={handleBatch} isDisabled={batchBusy}>
              <Button.Label>{batchBusy ? 'Đang ghi...' : 'Ghi nhận tất cả'}</Button.Label>
            </Button>
          </BouncyDialog.Actions>
        </BouncyDialog>

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
        initialFromMemberId={prefill?.from}
        initialToMemberId={prefill?.to}
        initialAmount={prefill?.amount}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { marginBottom: 8 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestionHint: { marginTop: 2, marginBottom: 8 },
  recordBtnWrap: { marginBottom: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  suggestCard: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  suggestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestLabel: { flex: 1, minWidth: 0, marginRight: 10 },
  suggestBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
});
