import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BalancesTab } from '../../../components/trip/BalancesTab';
import { ExpensesTab } from '../../../components/trip/ExpensesTab';
import { HistoryTab } from '../../../components/trip/HistoryTab';
import { SettlementTab } from '../../../components/trip/SettlementTab';
import { AppText, GradientHero, Money, SectionTabs } from '../../../components/ui';
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
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const trip = trips.find((t) => t.id === tripId);
  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

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

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: trip?.name || 'Chuyến đi' }} />

      {/* Summary hero */}
      <GradientHero fromColor={c.accentSoft} toColor={c.tint} style={styles.heroWrap}>
        <View style={styles.heroInner}>
          <AppText variant="label" tone="muted">TỔNG CHI</AppText>
          <Money value={totalExpenses} variant="hero" tone="primary" animate />
          <AppText variant="meta" tone="muted" style={styles.heroMeta}>
            {currentExpenses.length} khoản · {currentPayments.length} thanh toán · {currentGroupMembers.length} người
          </AppText>
        </View>
      </GradientHero>

      <SectionTabs items={TAB_ITEMS} selected={tab} onSelect={(key) => setTab(key as Tab)} />

      <Animated.View key={tab} entering={FadeIn.duration(150)} style={styles.tabContent}>
        {tab === 'expenses' && (
          <ExpensesTab
            tripId={tripId!}
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
            tripId={tripId!}
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
