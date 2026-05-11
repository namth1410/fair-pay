import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { BalancesTab } from '../../../../components/trip/BalancesTab';
import { ExpensesTab } from '../../../../components/trip/ExpensesTab';
import { ExportScopeSheet } from '../../../../components/trip/ExportScopeSheet';
import { HistoryTab } from '../../../../components/trip/HistoryTab';
import { MyBalanceExplanationSheet } from '../../../../components/trip/MyBalanceExplanationSheet';
import { SettlementTab } from '../../../../components/trip/SettlementTab';
import { TripManagementTab } from '../../../../components/trip/TripManagementTab';
import { AppText, Money, SectionTabs, SkiaMeshGradient } from '../../../../components/ui';
import { useAppTheme } from '../../../../hooks/useAppTheme';
import { type AuditLog, fetchAuditLogs } from '../../../../services/audit.service';
import { useAuthStore } from '../../../../stores/auth.store';
import { useGroupStore } from '../../../../stores/group.store';
import { useTripStore } from '../../../../stores/trip.store';
import { useUIStore } from '../../../../stores/ui.store';
import { explainMyTripBalance } from '../../../../utils/explainBalance';
import type { TripExportData } from '../../../../utils/exportHtml';
import { hapticLight } from '../../../../utils/haptics';

type Tab = 'expenses' | 'balances' | 'settle' | 'history' | 'manage';

const TAB_KEYS: Tab[] = ['expenses', 'balances', 'settle', 'history', 'manage'];

const TAB_ITEMS = [
  { key: 'expenses', label: 'Chi phí' },
  { key: 'balances', label: 'Số dư' },
  { key: 'settle', label: 'Quyết toán' },
  { key: 'history', label: 'Lịch sử' },
  { key: 'manage', label: 'Quản lý' },
];

const TAB_ANIM = { duration: 280, easing: Easing.out(Easing.cubic) } as const;
const SWIPE_VELOCITY_THRESHOLD = 500;

export default function TripDetailScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useAppTheme();
  const { width: W } = useWindowDimensions();

  const {
    trips, currentExpenses, currentPayments, balances, settlements,
    isLoading,
    loadExpenses, removeExpense,
    loadPayments, addPayment, removePayment,
    loadBalances,
  } = useTripStore();
  const { currentGroupMembers, loadMembers } = useGroupStore();
  const groups = useGroupStore((s) => s.groups);
  const profile = useAuthStore((s) => s.profile);
  const tripExportRequestSeq = useUIStore((s) => s.tripExportRequestSeq);

  const [tab, setTab] = useState<Tab>('expenses');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [explainOpen, setExplainOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const targetIdx = TAB_KEYS.indexOf(tab);
  const progress = useSharedValue(targetIdx);
  const startProgress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(targetIdx, TAB_ANIM);
  }, [targetIdx, progress]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * W }],
  }));

  // Pan gesture: vuốt ngang để chuyển tab. activeOffsetX/failOffsetY chia
  // ranh với FlatList vertical scroll + SwipeableCard (RNGH leaf gesture).
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-20, 20])
        .onBegin(() => {
          'worklet';
          startProgress.value = progress.value;
        })
        .onUpdate((e) => {
          'worklet';
          const next = startProgress.value - e.translationX / W;
          progress.value = Math.max(0, Math.min(TAB_KEYS.length - 1, next));
        })
        .onEnd((e) => {
          'worklet';
          const v = e.velocityX;
          const settled =
            v < -SWIPE_VELOCITY_THRESHOLD
              ? Math.ceil(progress.value)
              : v > SWIPE_VELOCITY_THRESHOLD
                ? Math.floor(progress.value)
                : Math.round(progress.value);
          const clamped = Math.max(0, Math.min(TAB_KEYS.length - 1, settled));
          progress.value = withTiming(clamped, TAB_ANIM);
          const nextKey = TAB_KEYS[clamped] ?? TAB_KEYS[0]!;
          if (clamped !== targetIdx) {
            runOnJS(setTab)(nextKey);
          }
        }),
    [W, progress, startProgress, targetIdx],
  );

  const trip = trips.find((t) => t.id === tripId);
  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);
  const groupName = useMemo(
    () => groups.find((g) => g.id === trip?.group_id)?.name ?? '',
    [groups, trip?.group_id],
  );

  // Builder cho ExportScopeSheet — chỉ chạy khi user nhấn xuất.
  const getExportData = useCallback((): TripExportData => {
    return {
      tripName: trip?.name ?? 'Chuyến đi',
      groupName,
      generatedAt: new Date().toISOString(),
      members: currentGroupMembers.map((m) => ({
        id: m.id,
        displayName: m.display_name,
        isVirtual: !!m.is_virtual,
      })),
      expenses: currentExpenses.map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        paidBy: e.paid_by,
        category: e.category,
        date: e.date,
        note: e.note,
        splits: e.expense_splits.map((s) => ({
          memberId: s.member_id,
          amount: s.amount,
        })),
      })),
      payments: currentPayments.map((p) => ({
        id: p.id,
        fromMemberId: p.from_member_id,
        toMemberId: p.to_member_id,
        amount: p.amount,
        date: p.date,
        note: p.note,
      })),
      balances,
      settlements,
    };
  }, [trip?.name, groupName, currentGroupMembers, currentExpenses, currentPayments, balances, settlements]);

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

  const myBalance = explanation?.totalBalance ?? 0;
  const showMyRow = !!explanation && explanation.lines.length > 0;
  const { label: myLabel, tone: myTone } = describeBalance(myBalance);

  useEffect(() => {
    if (!tripId) return;
    loadExpenses(tripId);
    loadPayments(tripId);
    loadBalances(tripId);
    fetchAuditLogs(tripId).then(setAuditLogs).catch((e) => {
      if (__DEV__) console.warn('[AuditLogs] Fetch failed:', e);
    });
  }, [tripId]);

  useEffect(() => {
    if (trip?.group_id) loadMembers(trip.group_id);
  }, [trip?.group_id]);

  // Header share button (qua useUIStore.requestTripExport) → mở sheet.
  useEffect(() => {
    if (tripExportRequestSeq === 0) return;
    setExportOpen(true);
  }, [tripExportRequestSeq]);

  if (!tripId) return null;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: trip?.name || 'Chuyến đi' }} />

      {/* Summary hero — animated mesh gradient (Skia) */}
      <SkiaMeshGradient
        baseColor={c.tint}
        colors={[c.accentSoft, c.primarySoft, c.warmAccent]}
        speed={0.9}
        style={styles.heroWrap}
      >
        <View style={styles.heroInner}>
          <AppText variant="label" tone="muted">TỔNG CHI</AppText>
          <Money value={totalExpenses} variant="hero" tone="primary" animate />
          <AppText variant="meta" tone="muted" style={styles.heroMeta}>
            {currentExpenses.length} khoản · {currentPayments.length} thanh toán · {currentGroupMembers.length} người
          </AppText>
          {showMyRow ? (
            <View style={[styles.heroPersonalRow, { borderTopColor: c.divider }]}>
              <AppText variant="caption" tone="muted">{myLabel}</AppText>
              <Money value={Math.abs(myBalance)} variant="display" tone={myTone} />
              <Pressable
                onPress={() => {
                  hapticLight();
                  setExplainOpen(true);
                }}
                hitSlop={10}
                accessibilityLabel="Xem cách tính số dư của bạn"
                style={styles.infoBtn}
              >
                <Info size={16} color={c.muted} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </SkiaMeshGradient>

      <MyBalanceExplanationSheet
        isOpen={explainOpen}
        onOpenChange={setExplainOpen}
        tripName={trip?.name || ''}
        explanation={explanation}
      />

      <ExportScopeSheet
        isOpen={exportOpen}
        onOpenChange={setExportOpen}
        getExportData={getExportData}
        members={currentGroupMembers}
      />

      <SectionTabs items={TAB_ITEMS} selected={tab} onSelect={(key) => setTab(key as Tab)} />

      <View style={styles.tabViewport}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.tabRow, { width: W * TAB_KEYS.length }, rowStyle]}>
            <View style={{ width: W }}>
              <ExpensesTab
                tripId={tripId}
                tripStatus={trip?.status || 'open'}
                expenses={currentExpenses}
                members={currentGroupMembers}
                isLoading={isLoading}
                onDeleteExpense={removeExpense}
              />
            </View>
            <View style={{ width: W }}>
              <BalancesTab
                tripName={trip?.name || ''}
                balances={balances}
                totalExpenses={totalExpenses}
              />
            </View>
            <View style={{ width: W }}>
              <SettlementTab
                tripId={tripId}
                groupId={trip?.group_id || ''}
                settlements={settlements}
                payments={currentPayments}
                balances={balances}
                members={currentGroupMembers}
                onAddPayment={addPayment}
                onDeletePayment={removePayment}
              />
            </View>
            <View style={{ width: W }}>
              <HistoryTab auditLogs={auditLogs} members={currentGroupMembers} />
            </View>
            <View style={{ width: W }}>
              {trip ? (
                <TripManagementTab
                  trip={trip}
                  isAdmin={isAdmin}
                  onDeleted={() => router.back()}
                />
              ) : null}
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

function describeBalance(b: number): { label: string; tone: 'success' | 'danger' | 'muted' } {
  if (b > 0) return { label: 'Bạn được nợ', tone: 'success' };
  if (b < 0) return { label: 'Bạn đang nợ', tone: 'danger' };
  return { label: 'Bạn đã cân bằng', tone: 'muted' };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabViewport: { flex: 1, overflow: 'hidden' },
  tabRow: { flex: 1, flexDirection: 'row' },
  heroWrap: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  heroInner: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 2,
  },
  heroMeta: {
    marginTop: 2,
  },
  heroPersonalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  infoBtn: { padding: 4, borderRadius: 12 },
});
