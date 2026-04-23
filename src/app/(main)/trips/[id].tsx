import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { EntryAnimationsValues } from 'react-native-reanimated';
import Animated, { withTiming } from 'react-native-reanimated';

import { BalancesTab } from '../../../components/trip/BalancesTab';
import { ExpensesTab } from '../../../components/trip/ExpensesTab';
import { HistoryTab } from '../../../components/trip/HistoryTab';
import { SettlementTab } from '../../../components/trip/SettlementTab';
import { AppText, Money, SectionTabs, SkiaMeshGradient } from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { type AuditLog, fetchAuditLogs } from '../../../services/audit.service';
import { useGroupStore } from '../../../stores/group.store';
import { useTripStore } from '../../../stores/trip.store';

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
    loadExpenses, addExpense, removeExpense,
    loadPayments, addPayment, removePayment,
    loadBalances,
  } = useTripStore();
  const { currentGroupMembers, loadMembers } = useGroupStore();

  const [tab, setTab] = useState<Tab>('expenses');
  const prevTabRef = useRef<Tab>(tab);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const trip = trips.find((t) => t.id === tripId);
  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

  useEffect(() => {
    if (!tripId) return;
    loadExpenses(tripId);
    loadPayments(tripId);
    loadBalances(tripId);
    fetchAuditLogs(tripId).then(setAuditLogs).catch((e) => {
      if (__DEV__) console.warn('[AuditLogs] Fetch failed:', e);
    });
  }, [tripId]);

  if (!tripId) return null;

  useEffect(() => {
    if (trip?.group_id) loadMembers(trip.group_id);
  }, [trip?.group_id]);

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
        </View>
      </SkiaMeshGradient>

      <SectionTabs items={TAB_ITEMS} selected={tab} onSelect={(key) => setTab(key as Tab)} />

      <Animated.View key={tab} entering={tabEntering} style={styles.tabContent}>
        {tab === 'expenses' && (
          <ExpensesTab
            tripId={tripId}
            groupId={trip?.group_id || ''}
            tripStatus={trip?.status || 'open'}
            expenses={currentExpenses}
            members={currentGroupMembers}
            isLoading={isLoading}
            onAddExpense={addExpense}
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
});
