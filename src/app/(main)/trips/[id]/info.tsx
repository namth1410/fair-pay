import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BalancesTab } from '../../../../components/trip/BalancesTab';
import { ExportScopeSheet } from '../../../../components/trip/ExportScopeSheet';
import { HistoryTab } from '../../../../components/trip/HistoryTab';
import { SettlementTab } from '../../../../components/trip/SettlementTab';
import { TripInfoSkeleton } from '../../../../components/trip/TripInfoSkeleton';
import { TripManagementTab } from '../../../../components/trip/TripManagementTab';
import { SectionTabs } from '../../../../components/ui';
import { useAppTheme } from '../../../../hooks/useAppTheme';
import { useAuthStore } from '../../../../stores/auth.store';
import { useGroupStore } from '../../../../stores/group.store';
import { useTripStore } from '../../../../stores/trip.store';
import { useUIStore } from '../../../../stores/ui.store';
import type { TripExportData } from '../../../../utils/exportHtml';

type Tab = 'balances' | 'settle' | 'history' | 'manage';

const TAB_ITEMS: { key: Tab; label: string }[] = [
  { key: 'balances', label: 'Số dư' },
  { key: 'settle', label: 'Quyết toán' },
  { key: 'history', label: 'Lịch sử' },
  { key: 'manage', label: 'Quản lý' },
];

function isTab(v: unknown): v is Tab {
  return v === 'balances' || v === 'settle' || v === 'history' || v === 'manage';
}

// "Thông tin chuyến" (giao diện "Hội thoại" 2026-10): gom các tab cũ của màn chuyến đi
// (Số dư / Quyết toán / Lịch sử / Quản lý) — mở từ nút ⓘ trên header luồng chuyến đi.
// `?tab=settle` để mở thẳng tab (vd từ thẻ gợi ý tất toán của rồng).
export default function TripInfoScreen() {
  const { id: tripId, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const c = useAppTheme();

  const {
    currentTrip, currentExpenses, currentPayments, balances, settlements, auditLogs,
    currentTripId,
    addPayment, addPayments, removePayment,
    loadBalances, loadAuditLogs,
  } = useTripStore();
  const { currentGroupMembers, loadMembers } = useGroupStore();
  const groups = useGroupStore((s) => s.groups);
  const profile = useAuthStore((s) => s.profile);
  const tripExportRequestSeq = useUIStore((s) => s.tripExportRequestSeq);

  const [tab, setTab] = useState<Tab>(isTab(tabParam) ? tabParam : 'balances');
  const [exportOpen, setExportOpen] = useState(false);

  const trip = currentTrip && currentTrip.id === tripId ? currentTrip : null;
  const groupName = useMemo(
    () => groups.find((g) => g.id === trip?.group_id)?.name ?? '',
    [groups, trip?.group_id],
  );

  // Vào thẳng màn này (deep link) mà store đang giữ trip khác → tự nạp.
  useEffect(() => {
    if (!tripId) return;
    if (useTripStore.getState().currentTripId !== tripId) {
      void loadBalances(tripId);
      void loadAuditLogs(tripId);
    }
  }, [tripId]);

  useEffect(() => {
    if (trip?.group_id) loadMembers(trip.group_id);
  }, [trip?.group_id]);

  // Nút xuất PDF trên header (useUIStore.requestTripExport) → mở sheet. Chỉ phản ứng với
  // yêu cầu MỚI sau khi màn mount (seq là bộ đếm toàn cục, không reset).
  const exportSeqAtMount = useRef(tripExportRequestSeq);
  useEffect(() => {
    if (tripExportRequestSeq === exportSeqAtMount.current) return;
    setExportOpen(true);
  }, [tripExportRequestSeq]);

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

  // Builder cho ExportScopeSheet — chỉ chạy khi user nhấn xuất.
  const getExportData = useCallback((): TripExportData => {
    return {
      tripName: trip?.name ?? 'Chuyến đi',
      groupName,
      generatedAt: new Date().toISOString(),
      status: trip?.status ?? 'open',
      closedAt: trip?.closed_at ?? null,
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
  }, [trip?.name, trip?.status, trip?.closed_at, groupName, currentGroupMembers, currentExpenses, currentPayments, balances, settlements]);

  if (!tripId) return null;

  if (currentTripId !== tripId || !trip) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ title: 'Thông tin chuyến' }} />
        <TripInfoSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: trip.name }} />

      <View style={[styles.tabsBar, { backgroundColor: c.surface }]}>
        <SectionTabs
          items={TAB_ITEMS}
          selected={tab}
          onSelect={(key) => setTab(key as Tab)}
        />
      </View>

      <View style={styles.body}>
        {tab === 'balances' ? <BalancesTab balances={balances} /> : null}
        {tab === 'settle' ? (
          <SettlementTab
            tripId={tripId}
            tripStatus={trip.status || 'open'}
            groupId={trip.group_id || ''}
            settlements={settlements}
            payments={currentPayments}
            balances={balances}
            members={currentGroupMembers}
            myMemberId={myMemberId}
            onAddPayment={addPayment}
            onAddPayments={addPayments}
            onDeletePayment={removePayment}
          />
        ) : null}
        {tab === 'history' ? (
          <HistoryTab auditLogs={auditLogs} members={currentGroupMembers} />
        ) : null}
        {tab === 'manage' ? (
          <TripManagementTab
            trip={trip}
            isAdmin={isAdmin}
            // Đã xoá chuyến → bỏ cả màn này lẫn luồng chuyến đi, về màn nhóm.
            onDeleted={() => router.dismissTo(`/groups/${trip.group_id}` as never)}
          />
        ) : null}
      </View>

      <ExportScopeSheet
        isOpen={exportOpen}
        onOpenChange={setExportOpen}
        getExportData={getExportData}
        members={currentGroupMembers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabsBar: { paddingTop: 6 },
  body: { flex: 1, paddingTop: 8 },
});
