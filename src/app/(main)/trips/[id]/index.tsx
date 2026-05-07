import { Stack, useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { EntryAnimationsValues } from 'react-native-reanimated';
import Animated, { withTiming } from 'react-native-reanimated';

import { BalancesTab } from '../../../../components/trip/BalancesTab';
import { ExpensesTab } from '../../../../components/trip/ExpensesTab';
import { HistoryTab } from '../../../../components/trip/HistoryTab';
import { MyBalanceExplanationSheet } from '../../../../components/trip/MyBalanceExplanationSheet';
import { SettlementTab } from '../../../../components/trip/SettlementTab';
import { AppText, Money, SectionTabs, SkiaMeshGradient } from '../../../../components/ui';
import { useAppTheme } from '../../../../hooks/useAppTheme';
import { type AuditLog, fetchAuditLogs } from '../../../../services/audit.service';
import { useAuthStore } from '../../../../stores/auth.store';
import { useGroupStore } from '../../../../stores/group.store';
import { useTripStore } from '../../../../stores/trip.store';
import { explainMyTripBalance } from '../../../../utils/explainBalance';
import { hapticLight } from '../../../../utils/haptics';

type Tab = 'expenses' | 'balances' | 'settle' | 'history';

const TAB_ITEMS = [
  { key: 'expenses', label: 'Chi phí' },
  { key: 'balances', label: 'Số dư' },
  { key: 'settle', label: 'Quyết toán' },
  { key: 'history', label: 'Lịch sử' },
];

export default function TripDetailScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const c = useAppTheme();

  const {
    trips, currentExpenses, currentPayments, balances, settlements,
    isLoading,
    loadExpenses, removeExpense,
    loadPayments, addPayment, removePayment,
    loadBalances,
  } = useTripStore();
  const { currentGroupMembers, loadMembers } = useGroupStore();
  const profile = useAuthStore((s) => s.profile);

  const [tab, setTab] = useState<Tab>('expenses');
  const prevTabRef = useRef<Tab>(tab);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [explainOpen, setExplainOpen] = useState(false);

  const trip = trips.find((t) => t.id === tripId);
  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

  const myMemberId = useMemo(() => {
    if (!profile) return null;
    const m = currentGroupMembers.find((mb) => mb.user_id === profile.id && !mb.left_at);
    return m?.id ?? null;
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

  if (!tripId) return null;

  const TAB_KEYS: Tab[] = ['expenses', 'balances', 'settle', 'history'];
  const tabIdx = TAB_KEYS.indexOf(tab);
  const prevIdx = TAB_KEYS.indexOf(prevTabRef.current);
  const direction = tabIdx >= prevIdx ? 'right' : 'left';
  prevTabRef.current = tab;

  const tabEntering = (_values: EntryAnimationsValues) => {
    'worklet';
    const offset = direction === 'right' ? 40 : -40;
    return {
      initialValues: { opacity: 0, transform: [{ translateX: offset }] },
      animations: {
        opacity: withTiming(1, { duration: 200 }),
        transform: [{ translateX: withTiming(0, { duration: 200 }) }],
      },
    };
  };

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

      <SectionTabs items={TAB_ITEMS} selected={tab} onSelect={(key) => setTab(key as Tab)} />

      <Animated.View key={tab} entering={tabEntering} style={styles.tabContent}>
        {tab === 'expenses' && (
          <ExpensesTab
            tripId={tripId}
            tripStatus={trip?.status || 'open'}
            expenses={currentExpenses}
            members={currentGroupMembers}
            isLoading={isLoading}
            onDeleteExpense={removeExpense}
          />
        )}

        {tab === 'balances' && (
          <BalancesTab
            tripName={trip?.name || ''}
            balances={balances}
            totalExpenses={totalExpenses}
          />
        )}

        {tab === 'settle' && (
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
        )}

        {tab === 'history' && (
          <HistoryTab auditLogs={auditLogs} members={currentGroupMembers} />
        )}
      </Animated.View>
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
  tabContent: { flex: 1 },
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
