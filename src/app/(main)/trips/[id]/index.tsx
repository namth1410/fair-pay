import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import Info from 'lucide-react-native/dist/esm/icons/info';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ExpenseDetailSheet } from '../../../../components/trip/ExpenseDetailSheet';
import { MyBalanceExplanationSheet } from '../../../../components/trip/MyBalanceExplanationSheet';
import { ExpenseBubble } from '../../../../components/trip/thread/ExpenseBubble';
import { PaymentBubble } from '../../../../components/trip/thread/PaymentBubble';
import {
  DragonMessage,
  ThreadDaySeparator,
  ThreadSystemNotice,
} from '../../../../components/trip/thread/ThreadNotices';
import { TripBalanceBanner } from '../../../../components/trip/thread/TripBalanceBanner';
import { TripComposer } from '../../../../components/trip/thread/TripComposer';
import { TripThreadSkeleton } from '../../../../components/trip/thread/TripThreadSkeleton';
import { AppText, BouncyDialog } from '../../../../components/ui';
import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { ExpenseWithSplits } from '../../../../services/expense.service';
import type { Payment } from '../../../../services/payment.service';
import { useAuthStore } from '../../../../stores/auth.store';
import { useGroupStore } from '../../../../stores/group.store';
import { useTripStore } from '../../../../stores/trip.store';
import * as syncBus from '../../../../sync/syncBus';
import { explainMyTripBalance } from '../../../../utils/explainBalance';
import { formatDateVN, formatVND } from '../../../../utils/format';
import { hapticLight } from '../../../../utils/haptics';
import { pickImage } from '../../../../utils/imageProcessing';
import { showError } from '../../../../utils/toast';
import { buildTripThread, type ThreadItem } from '../../../../utils/tripThread';

type Item = ThreadItem<ExpenseWithSplits, Payment>;

const SPLIT_LABEL: Record<string, string> = {
  equal: 'Chia đều',
  ratio: 'Chia theo tỷ lệ',
  custom: 'Chia tùy chỉnh',
};

/** Người "gửi" của 1 tin (người trả / người chuyển) — null với vạch ngày, tin hệ thống. */
function senderKeyOf(item: Item | undefined): string | null {
  if (!item) return null;
  if (item.kind === 'expense') return item.expense.paid_by;
  if (item.kind === 'payment') return item.payment.from_member_id;
  return null;
}

// Màn chuyến đi giao diện "Hội thoại" (2026-10): 1 luồng tin gộp khoản chi + thanh toán theo
// thời gian (mới nhất sát ô soạn ở đáy). Số dư / Quyết toán / Lịch sử / Quản lý nằm ở màn
// "Thông tin chuyến" (nút ⓘ trên header → trips/[id]/info).
export default function TripDetailScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useAppTheme();

  const {
    currentTrip, currentExpenses, currentPayments, settlements,
    currentTripId, currentTripLoadError,
    removeExpense, removePayment, toggleTripStatus,
    loadBalances, loadAuditLogs,
  } = useTripStore();
  const { currentGroupMembers, loadMembers } = useGroupStore();
  const profile = useAuthStore((s) => s.profile);

  const [explainOpen, setExplainOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithSplits | null>(null);
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<ExpenseWithSplits | null>(null);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<Payment | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  // currentTrip populate qua loadBalances → support entry-point bypass group detail
  // (pinned story, deep link, notification).
  const trip = currentTrip && currentTrip.id === tripId ? currentTrip : null;
  const isOpen = trip?.status !== 'closed';
  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

  const memberById = useMemo(() => {
    const map = new Map<string, (typeof currentGroupMembers)[number]>();
    for (const m of currentGroupMembers) map.set(m.id, m);
    return map;
  }, [currentGroupMembers]);

  // created_by / recorded_by là users.id → map sang member để hiện "do X ghi".
  const memberByUserId = useMemo(() => {
    const map = new Map<string, (typeof currentGroupMembers)[number]>();
    for (const m of currentGroupMembers) if (m.user_id) map.set(m.user_id, m);
    return map;
  }, [currentGroupMembers]);

  const nameOf = useCallback(
    (memberId: string) => memberById.get(memberId)?.display_name || '?',
    [memberById],
  );

  const myMemberId = useMemo(() => {
    if (!profile) return null;
    const m = currentGroupMembers.find((mb) => mb.user_id === profile.id && !mb.left_at);
    return m?.id ?? null;
  }, [profile, currentGroupMembers]);

  const isAdmin = useMemo(() => {
    if (!profile) return false;
    const me = currentGroupMembers.find((mb) => mb.user_id === profile.id && !mb.left_at);
    return me?.role === 'admin';
  }, [profile, currentGroupMembers]);

  const explanation = useMemo(() => {
    if (!myMemberId) return null;
    return explainMyTripBalance(
      myMemberId,
      currentGroupMembers.map((m) => ({ id: m.id, displayName: m.display_name })),
      currentExpenses.map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        paidBy: e.paid_by,
        date: e.date,
        splits: e.expense_splits.map((s) => ({ memberId: s.member_id, amount: s.amount })),
      })),
      currentPayments.map((p) => ({
        id: p.id,
        fromMemberId: p.from_member_id,
        toMemberId: p.to_member_id,
        amount: p.amount,
        date: p.date,
      })),
    );
  }, [myMemberId, currentGroupMembers, currentExpenses, currentPayments]);

  const thread = useMemo(
    () =>
      buildTripThread<ExpenseWithSplits, Payment>({
        expenses: currentExpenses,
        payments: currentPayments,
        closedAt: trip?.status === 'closed' ? trip.closed_at ?? null : null,
        showSuggest: trip?.status === 'open' && settlements.length > 0,
      }),
    [currentExpenses, currentPayments, trip?.status, trip?.closed_at, settlements.length],
  );

  // Gợi ý tất toán của rồng: ưu tiên lượt chuyển liên quan tới chính user.
  const suggestText = useMemo(() => {
    const toMe = settlements.find((s) => s.to === myMemberId);
    if (toMe) return `${toMe.fromName} nên trả bạn ${formatVND(toMe.amount)} để cân sổ.`;
    const fromMe = settlements.find((s) => s.from === myMemberId);
    if (fromMe) return `Bạn nên trả ${fromMe.toName} ${formatVND(fromMe.amount)} để cân sổ.`;
    return `Còn ${settlements.length} lượt chuyển để cả nhóm cân sổ.`;
  }, [settlements, myMemberId]);

  const expenseDetail = useCallback(
    (e: ExpenseWithSplits): string => {
      const n = e.expense_splits.length;
      const isMine = e.paid_by === myMemberId;
      let mode = `${SPLIT_LABEL[e.split_type] ?? 'Chia'} ${n} người`;
      const parts: string[] = [];
      if (isMine) {
        parts.push('Bạn trả');
        mode = mode.charAt(0).toLowerCase() + mode.slice(1);
      }
      parts.push(mode);
      if (myMemberId) {
        const mySplit = e.expense_splits.find((s) => s.member_id === myMemberId);
        if (mySplit && mySplit.amount > 0) parts.push(`phần bạn ${formatVND(mySplit.amount)}`);
        else if (!isMine) parts.push('bạn không tham gia');
      }
      // Người ghi khác người trả → nói rõ (vd Nam ghi hộ khoản Hà trả).
      const recorder = memberByUserId.get(e.created_by);
      const payerUserId = memberById.get(e.paid_by)?.user_id ?? null;
      if (recorder && e.created_by !== payerUserId) {
        parts.push(`do ${recorder.id === myMemberId ? 'bạn' : recorder.display_name} ghi`);
      }
      return parts.join(' · ');
    },
    [myMemberId, memberById, memberByUserId],
  );

  const paymentHeadline = useCallback(
    (p: Payment): string => {
      if (p.to_member_id === myMemberId) return 'Đã chuyển cho bạn';
      if (p.from_member_id === myMemberId) return `Bạn đã chuyển cho ${nameOf(p.to_member_id)}`;
      return `Đã chuyển cho ${nameOf(p.to_member_id)}`;
    },
    [myMemberId, nameOf],
  );

  useEffect(() => {
    if (!tripId) return;
    // loadBalances populate expenses + payments + members + balances + settlements
    // trong 1 lượt → không gọi loadExpenses/loadPayments riêng (race + flicker).
    loadBalances(tripId);
    loadAuditLogs(tripId);
  }, [tripId]);

  // Sau khi sync nền hoàn tất (vd createExpense local-first đã push), refresh ÊM luồng +
  // số dư của trip đang xem. Cũng cover offline→online và thay đổi từ thiết bị khác.
  useEffect(() => {
    if (!tripId) return;
    return syncBus.subscribe(() => {
      if (useTripStore.getState().currentTripId !== tripId) return;
      void useTripStore.getState().loadAuditLogs(tripId);
      void useTripStore.getState().loadBalances(tripId, { quiet: true });
    });
  }, [tripId]);

  useEffect(() => {
    if (trip?.group_id) loadMembers(trip.group_id);
  }, [trip?.group_id]);

  const handleCompose = useCallback(() => {
    hapticLight();
    router.push(`/trips/${tripId}/expenses/new`);
  }, [router, tripId]);

  const handleCamera = useCallback(async () => {
    hapticLight();
    setIsPicking(true);
    try {
      const picked = await pickImage('camera');
      if (!picked) return;
      const params = new URLSearchParams();
      params.set('expenseId', Crypto.randomUUID());
      params.set('imageUri', picked.uri);
      params.set('imageSizeBytes', String(picked.sizeBytes));
      params.set('imageWidth', String(picked.width));
      params.set('imageHeight', String(picked.height));
      router.push(`/trips/${tripId}/expenses/new?${params.toString()}` as never);
    } catch (err) {
      showError(err);
    } finally {
      setIsPicking(false);
    }
  }, [router, tripId]);

  const confirmReopen = useCallback(async () => {
    if (!trip) return;
    setReopenBusy(true);
    try {
      await toggleTripStatus(trip);
      setReopenOpen(false);
    } catch (err) {
      showError(err);
    } finally {
      setReopenBusy(false);
    }
  }, [trip, toggleTripStatus]);

  const renderItem = useCallback(
    ({ item, index }: { item: Item; index: number }) => {
      // Gom tin liên tiếp cùng người gửi như app nhắn tin: tên chỉ ở tin đầu (trên cùng),
      // avatar chỉ ở tin cuối (dưới cùng). Mảng inverted: index+1 = tin cũ hơn (phía trên),
      // index-1 = tin mới hơn (phía dưới).
      const key = senderKeyOf(item);
      const showSender = senderKeyOf(thread[index + 1]) !== key;
      const showAvatar = senderKeyOf(thread[index - 1]) !== key;
      switch (item.kind) {
        case 'day':
          return <ThreadDaySeparator title={item.title} />;
        case 'expense':
          return (
            <ExpenseBubble
              expense={item.expense}
              isMine={item.expense.paid_by === myMemberId}
              senderName={nameOf(item.expense.paid_by)}
              detail={expenseDetail(item.expense)}
              onPress={setSelectedExpense}
              onLongPress={isOpen ? setDeleteExpenseTarget : undefined}
              showSender={showSender}
              showAvatar={showAvatar}
            />
          );
        case 'payment':
          return (
            <PaymentBubble
              payment={item.payment}
              isMine={item.payment.from_member_id === myMemberId}
              senderName={nameOf(item.payment.from_member_id)}
              headline={paymentHeadline(item.payment)}
              onLongPress={isOpen ? setDeletePaymentTarget : undefined}
              showSender={showSender}
              showAvatar={showAvatar}
            />
          );
        case 'closed':
          return (
            <ThreadSystemNotice
              text={`Chuyến đi đã đóng · ${formatDateVN(new Date(item.closedAt))}`}
            />
          );
        case 'suggest':
          return (
            <DragonMessage
              title="Gợi ý tất toán"
              text={suggestText}
              actionLabel="Xem cách tất toán"
              onAction={() => router.push(`/trips/${tripId}/info?tab=settle` as never)}
            />
          );
        default:
          return null;
      }
    },
    [thread, myMemberId, nameOf, expenseDetail, paymentHeadline, isOpen, suggestText, router, tripId],
  );

  if (!tripId) return null;

  // Guard: cache trong store có thể là data của trip vừa unmount trước → render
  // loading cho tới khi loadBalances populate xong cho tripId này.
  const isHydrating =
    (currentTripId !== tripId || !trip) && !currentTripLoadError;
  if (isHydrating) {
    return (
      <View style={[styles.container, { backgroundColor: c.surface }]}>
        <Stack.Screen options={{ title: trip?.name || 'Chuyến đi' }} />
        <TripThreadSkeleton />
      </View>
    );
  }

  // Trip không mở được (đã xóa / id không hợp lệ — vd widget trỏ trip đã xóa).
  if (currentTripLoadError && !trip) {
    return (
      <View style={[styles.container, styles.errorFill, { backgroundColor: c.surface }]}>
        <Stack.Screen options={{ title: 'Chuyến đi' }} />
        <Info size={36} color={c.muted} strokeWidth={1.6} />
        <AppText variant="subtitle" weight="semibold" center style={styles.errorTitle}>
          Không mở được chuyến đi
        </AppText>
        <AppText variant="body" tone="muted" center style={styles.errorBody}>
          Chuyến đi có thể đã bị xóa hoặc không còn khả dụng.
        </AppText>
        <Pressable
          onPress={() => router.replace('/(main)')}
          hitSlop={10}
          style={styles.errorBtn}
        >
          <AppText variant="body" weight="semibold" tone="primary">
            Về trang chủ
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <Stack.Screen options={{ title: trip?.name || 'Chuyến đi' }} />

      <TripBalanceBanner
        myBalance={explanation ? explanation.totalBalance : null}
        totalExpenses={totalExpenses}
        expenseCount={currentExpenses.length}
        memberCount={currentGroupMembers.length}
        onPress={() => {
          hapticLight();
          setExplainOpen(true);
        }}
      />

      {thread.length === 0 ? (
        <View style={styles.emptyThread}>
          <DragonMessage
            title="Rồng Fair Pay"
            text={
              isOpen
                ? 'Chưa có khoản chi nào. Bấm “Thêm khoản chi…” bên dưới để ghi khoản đầu tiên.'
                : 'Chuyến đi này chưa có khoản chi nào.'
            }
          />
        </View>
      ) : (
        <FlatList
          inverted
          data={thread}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <TripComposer
        isClosed={!isOpen}
        isPicking={isPicking}
        onCompose={handleCompose}
        onCamera={handleCamera}
        closedActionLabel={isAdmin ? 'Mở lại' : 'Thông tin'}
        onClosedAction={
          isAdmin
            ? () => setReopenOpen(true)
            : () => router.push(`/trips/${tripId}/info` as never)
        }
      />

      <MyBalanceExplanationSheet
        isOpen={explainOpen}
        onOpenChange={setExplainOpen}
        tripName={trip?.name || ''}
        explanation={explanation}
      />

      <ExpenseDetailSheet
        isOpen={!!selectedExpense}
        onOpenChange={(open) => { if (!open) setSelectedExpense(null); }}
        expense={selectedExpense}
        members={currentGroupMembers}
        canEdit={isOpen}
      />

      <BouncyDialog
        isOpen={!!deleteExpenseTarget}
        onClose={() => setDeleteExpenseTarget(null)}
      >
        <BouncyDialog.Title>Xóa khoản chi</BouncyDialog.Title>
        <BouncyDialog.Description>{`Xóa "${deleteExpenseTarget?.title}"?`}</BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={() => setDeleteExpenseTarget(null)}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button
            variant="danger"
            size="sm"
            onPress={() => {
              const target = deleteExpenseTarget;
              setDeleteExpenseTarget(null);
              if (target) void removeExpense(target.id, tripId).catch((e: unknown) => showError(e));
            }}
          >
            <Button.Label>Xóa</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

      <BouncyDialog
        isOpen={!!deletePaymentTarget}
        onClose={() => setDeletePaymentTarget(null)}
      >
        <BouncyDialog.Title>Xóa thanh toán</BouncyDialog.Title>
        <BouncyDialog.Description>
          {deletePaymentTarget
            ? `Xóa lượt ${nameOf(deletePaymentTarget.from_member_id)} chuyển ${formatVND(deletePaymentTarget.amount)} cho ${nameOf(deletePaymentTarget.to_member_id)}?`
            : ''}
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={() => setDeletePaymentTarget(null)}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button
            variant="danger"
            size="sm"
            onPress={() => {
              const target = deletePaymentTarget;
              setDeletePaymentTarget(null);
              if (target) void removePayment(target.id, tripId).catch((e: unknown) => showError(e));
            }}
          >
            <Button.Label>Xóa</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

      <BouncyDialog
        isOpen={reopenOpen}
        onClose={() => { if (!reopenBusy) setReopenOpen(false); }}
        dismissOnBackdrop={!reopenBusy}
      >
        <BouncyDialog.Title>Mở lại chuyến đi?</BouncyDialog.Title>
        <BouncyDialog.Description>
          {`Mở lại chuyến "${trip?.name ?? ''}" để tiếp tục ghi chi phí.`}
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={() => setReopenOpen(false)} isDisabled={reopenBusy}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button variant="primary" size="sm" onPress={confirmReopen} isDisabled={reopenBusy}>
            <Button.Label>{reopenBusy ? 'Đang xử lý...' : 'Mở lại'}</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  errorFill: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errorTitle: { marginTop: 12 },
  errorBody: { marginTop: 4 },
  errorBtn: { marginTop: 20, paddingVertical: 10, paddingHorizontal: 20 },
  threadContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyThread: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
});
