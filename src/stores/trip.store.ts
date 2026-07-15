import { create } from 'zustand';

import { type AuditLog, fetchAuditLogs } from '../services/audit.service';
import {
  computeTripBalances,
  createExpense,
  deleteExpense,
  editExpense,
  type ExpenseWithSplits,
  fetchExpenses,
  fetchTripBalanceData,
  type TripBalanceMember,
} from '../services/expense.service';
import {
  calculateSettlements,
  createPayment,
  deletePayment,
  fetchPayments,
  type Payment,
} from '../services/payment.service';
import {
  clearTrip,
  closeTrip,
  createTrip,
  deleteTrip,
  fetchAllUserTripsWithGroup,
  fetchPinnedTrips,
  fetchTripById,
  fetchTrips,
  pinTrip,
  reopenTrip,
  reorderPinnedTrips,
  type Trip,
  unpinTrip,
  updateTripName,
} from '../services/trip.service';
import type { TripWithGroup } from '../types/database.types';
import type { SplitResult } from '../utils/split';
import { useGroupStore } from './group.store';
import { findTripContext, type TripContext } from './tripSelectors';

interface BalanceEntry {
  memberId: string;
  memberName: string;
  balance: number;
}

interface SettlementEntry {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

interface TripState {
  trips: Trip[];
  /**
   * Trip metadata của trip đang xem (detail screen). Populate qua loadBalances —
   * fix cho entry-point bypass group detail (pinned card, deep link, notification)
   * vì `trips` array chỉ load qua loadTrips(groupId) ở group detail screen.
   */
  currentTrip: Trip | null;
  currentExpenses: ExpenseWithSplits[];
  currentPayments: Payment[];
  /**
   * Cache TẤT CẢ members của group hiện tại (kể cả đã rời) — cho recomputeBalances
   * pure không phải re-fetch sau mỗi mutation. Populate qua loadBalances.
   */
  currentAllMembers: TripBalanceMember[];
  balances: BalanceEntry[];
  settlements: SettlementEntry[];
  auditLogs: AuditLog[];
  isLoadingTrips: boolean;
  isLoadingExpenses: boolean;
  /**
   * Id of the trip whose expenses/payments/balances are currently cached.
   * Used by the notification realtime router to skip refetch when a
   * realtime event references a different trip than the one the user
   * is actively viewing (so we don't clobber the visible trip's data).
   */
  currentTripId: string | null;
  /**
   * True khi loadBalances không mở được trip (id không hợp lệ / đã xóa / lỗi fetch).
   * Screen hiện trạng thái "không mở được" thay vì kẹt skeleton vĩnh viễn.
   */
  currentTripLoadError: boolean;
  /** Group id matching the currently loaded `trips` list. */
  currentTripsGroupId: string | null;

  loadTrips: (groupId: string, opts?: { quiet?: boolean }) => Promise<void>;
  addTrip: (groupId: string, name: string) => Promise<void>;
  toggleTripStatus: (trip: Trip) => Promise<void>;
  renameTrip: (tripId: string, name: string) => Promise<void>;
  clearCurrentTrip: (tripId: string) => Promise<void>;
  deleteCurrentTrip: (tripId: string, groupId: string) => Promise<void>;

  // Pinned trips (home shortcut)
  pinnedTrips: TripWithGroup[];
  pinnedTripIds: Set<string>;
  isLoadingPinnedTrips: boolean;
  allUserTrips: TripWithGroup[] | null;
  isLoadingAllUserTrips: boolean;
  loadPinnedTrips: () => Promise<void>;
  togglePin: (tripId: string) => Promise<void>;
  loadAllUserTrips: () => Promise<void>;
  reorderPinnedTripsLocal: (orderedTripIds: [string, string]) => Promise<void>;

  loadExpenses: (tripId: string) => Promise<void>;
  addExpense: (params: {
    id?: string;
    tripId: string;
    groupId: string;
    title: string;
    amount: number;
    paidByMemberId: string;
    splitType: 'equal' | 'ratio' | 'custom';
    splits: SplitResult[];
    note?: string;
    imageUrl?: string | null;
    date?: string;
  }) => Promise<void>;
  editExpense: (params: {
    expenseId: string;
    tripId: string;
    title: string;
    amount: number;
    paidByMemberId: string;
    splitType: 'equal' | 'ratio' | 'custom';
    splits: SplitResult[];
    note?: string | null;
    imageUrl?: string | null;
    date?: string;
  }) => Promise<void>;
  removeExpense: (expenseId: string, tripId: string) => Promise<void>;

  loadPayments: (tripId: string) => Promise<void>;
  addPayment: (params: {
    tripId: string;
    groupId: string;
    fromMemberId: string;
    toMemberId: string;
    amount: number;
    note?: string;
  }) => Promise<void>;
  /** Ghi nhận nhiều thanh toán song song (batch "Quyết toán tất cả") — reload + recompute 1 lần. */
  addPayments: (paramsList: {
    tripId: string;
    groupId: string;
    fromMemberId: string;
    toMemberId: string;
    amount: number;
    note?: string;
  }[]) => Promise<{ ok: number; failed: number }>;
  removePayment: (paymentId: string, tripId: string) => Promise<void>;

  loadBalances: (tripId: string, opts?: { quiet?: boolean }) => Promise<void>;
  loadAuditLogs: (tripId: string) => Promise<void>;
  recomputeBalances: () => void;
  /** Sync best-effort resolve trip context từ collection đang có (null nếu chưa cache). */
  getTripContext: (tripId: string) => TripContext | null;
  /**
   * Async resolve: sync lookup trước; miss → fetchTripById (offline-safe).
   * RETURN-ONLY — KHÔNG mutate currentTrip (detail screen là owner duy nhất qua loadBalances).
   */
  resolveTripContext: (tripId: string) => Promise<TripContext | null>;
  reset: () => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  currentTrip: null,
  currentExpenses: [],
  currentPayments: [],
  currentAllMembers: [],
  balances: [],
  settlements: [],
  auditLogs: [],
  isLoadingTrips: false,
  isLoadingExpenses: false,
  currentTripId: null,
  currentTripLoadError: false,
  currentTripsGroupId: null,
  pinnedTrips: [],
  pinnedTripIds: new Set<string>(),
  isLoadingPinnedTrips: false,
  allUserTrips: null,
  isLoadingAllUserTrips: false,

  loadTrips: async (groupId, opts) => {
    // quiet=true (revalidate nền sau sync / resume): KHÔNG bật isLoadingTrips →
    // không nháy skeleton, chỉ âm thầm cập nhật list khi data về.
    const quiet = opts?.quiet ?? false;
    const isSwitchingGroup = get().currentTripsGroupId !== groupId;
    set({
      ...(!quiet && { isLoadingTrips: true }),
      currentTripsGroupId: groupId,
      ...(isSwitchingGroup && { trips: [] }),
    });
    try {
      const trips = await fetchTrips(groupId);
      if (get().currentTripsGroupId !== groupId) return;
      set({ trips });
    } finally {
      if (!quiet && get().currentTripsGroupId === groupId) {
        set({ isLoadingTrips: false });
      }
    }
  },

  addTrip: async (groupId, name) => {
    await createTrip(groupId, name);
    await get().loadTrips(groupId);
  },

  toggleTripStatus: async (trip) => {
    if (trip.status === 'open') {
      await closeTrip(trip.id);
    } else {
      await reopenTrip(trip.id);
    }

    if (get().currentTrip?.id === trip.id) {
      set((state) => ({
        currentTrip: {
          ...state.currentTrip!,
          status: trip.status === 'open' ? 'closed' : 'open',
          closed_at: trip.status === 'open' ? new Date().toISOString() : null,
        },
      }));
    }

    await Promise.all([
      get().loadTrips(trip.group_id),
      get().loadAuditLogs(trip.id),
    ]);
  },

  renameTrip: async (tripId, name) => {
    await updateTripName(tripId, name);

    if (get().currentTrip?.id === tripId) {
      set((state) => ({
        currentTrip: { ...state.currentTrip!, name },
      }));
    }

    // Resolve group_id qua mọi collection + offline fallback — tránh bỏ qua refresh
    // trips list khi vào trip bypass group detail (trips array rỗng).
    const ctx = await get().resolveTripContext(tripId);
    await Promise.all([
      ctx ? get().loadTrips(ctx.groupId) : Promise.resolve(),
      get().loadAuditLogs(tripId),
    ]);
  },

  clearCurrentTrip: async (tripId) => {
    await clearTrip(tripId);
    // Resolve group_id qua mọi collection + offline fallback (xem renameTrip).
    const ctx = await get().resolveTripContext(tripId);
    // Sau RPC mass-soft-delete: cache cũ stale → loadBalances full fetch
    // (populate cả expenses + payments + members lại).
    // loadBalanceSummary: home group card đọc balanceSummary.groupBalances[groupId];
    // realtime notification trip.cleared cũng gọi, nhưng async best-effort →
    // gọi đồng bộ ở đây để tránh stale khi user navigate home ngay.
    await Promise.all([
      get().loadBalances(tripId),
      get().loadAuditLogs(tripId),
      ctx ? get().loadTrips(ctx.groupId) : Promise.resolve(),
      useGroupStore.getState().loadBalanceSummary(),
    ]);
  },

  deleteCurrentTrip: async (tripId, groupId) => {
    await deleteTrip(tripId);
    await get().loadTrips(groupId);
  },

  loadExpenses: async (tripId) => {
    set({ isLoadingExpenses: true });
    try {
      const expenses = await fetchExpenses(tripId);
      set({ currentExpenses: expenses });
    } finally {
      set({ isLoadingExpenses: false });
    }
  },

  addExpense: async (params) => {
    // Local-first: createExpense ghi SQLite local + enqueue + trigger sync ngầm.
    // UI append optimistic vào currentExpenses để hiện expense ngay sau khi
    // user navigate back, không phải đợi server round-trip.
    const expense = await createExpense({
      id: params.id,
      tripId: params.tripId,
      groupId: params.groupId,
      title: params.title,
      amount: params.amount,
      paidByMemberId: params.paidByMemberId,
      splitType: params.splitType,
      splits: params.splits,
      note: params.note,
      imageUrl: params.imageUrl,
      date: params.date,
    });
    const payer = get().currentAllMembers.find((m) => m.id === params.paidByMemberId);
    const optimistic: ExpenseWithSplits = {
      ...expense,
      expense_splits: params.splits.map((s) => ({
        id: globalThis.crypto.randomUUID(),
        expense_id: expense.id,
        member_id: s.memberId,
        amount: s.amount,
      })),
      payer_name: payer?.displayName,
    };
    set((state) => ({
      currentExpenses: [optimistic, ...state.currentExpenses],
    }));
    get().recomputeBalances();
  },

  editExpense: async (params) => {
    // Local-first P3: editExpense ghi SQLite + enqueue/RPC + trigger sync ngầm.
    // Optimistic replace item theo id trong currentExpenses để UI cập nhật ngay.
    const expense = await editExpense({
      expenseId: params.expenseId,
      title: params.title,
      amount: params.amount,
      paidByMemberId: params.paidByMemberId,
      splitType: params.splitType,
      splits: params.splits,
      note: params.note,
      imageUrl: params.imageUrl,
      date: params.date,
    });
    const payer = get().currentAllMembers.find((m) => m.id === params.paidByMemberId);
    const optimistic: ExpenseWithSplits = {
      ...expense,
      expense_splits: params.splits.map((s) => ({
        id: globalThis.crypto.randomUUID(),
        expense_id: expense.id,
        member_id: s.memberId,
        amount: s.amount,
      })),
      payer_name: payer?.displayName,
    };
    set((state) => ({
      currentExpenses: state.currentExpenses.map((e) =>
        e.id === expense.id ? optimistic : e,
      ),
    }));
    get().recomputeBalances();
  },

  removeExpense: async (expenseId, tripId) => {
    await deleteExpense(expenseId);
    await Promise.all([
      get().loadExpenses(tripId),
      get().loadAuditLogs(tripId),
    ]);
    get().recomputeBalances();
  },

  loadPayments: async (tripId) => {
    const payments = await fetchPayments(tripId);
    set({ currentPayments: payments });
  },

  addPayment: async (params) => {
    await createPayment(params);
    await Promise.all([
      get().loadPayments(params.tripId),
      get().loadAuditLogs(params.tripId),
    ]);
    get().recomputeBalances();
  },

  addPayments: async (paramsList) => {
    if (paramsList.length === 0) return { ok: 0, failed: 0 };
    const tripId = paramsList[0]!.tripId;
    // Song song: payment là P1 append-only idempotent (UUID + client_request_id),
    // không phụ thuộc thứ tự. createPayment tự offline-first (online→RPC; offline/fail→enqueue local).
    const results = await Promise.allSettled(paramsList.map((p) => createPayment(p)));
    // Reload-from-truth: online→server (đã có cái thành công); offline→SQLite (đã enqueue).
    // Chạy bất kể có item fail → UI luôn phản ánh đúng phần đã ghi.
    await Promise.all([
      get().loadPayments(tripId),
      get().loadAuditLogs(tripId),
    ]);
    get().recomputeBalances();
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { ok: results.length - failed, failed };
  },

  removePayment: async (paymentId, tripId) => {
    await deletePayment(paymentId);
    await Promise.all([
      get().loadPayments(tripId),
      get().loadAuditLogs(tripId),
    ]);
    get().recomputeBalances();
  },

  loadBalances: async (tripId, opts) => {
    // Initial fetch (mount trip detail) hoặc post-RPC mass-delete: populate cache đầy đủ.
    // Toggle isLoadingExpenses để ExpensesTab hiện skeleton — tránh phải gọi
    // loadExpenses/loadPayments riêng (sẽ trùng query + race ordering, gây flicker).
    // Khi đổi trip: clear cache cũ TRƯỚC fetch để screen detail không render data trip
    // trước. Race-guard sau await tránh fetch chậm ghi đè data của trip mới.
    // Fetch trip metadata song song (fetchTripById) để hydrate currentTrip cho entry-point
    // bypass group detail (pinned card, deep link, notification) — `trips` array chỉ load
    // ở group detail nên detail screen sẽ kẹt loading nếu chỉ dựa vào nó.
    //
    // quiet=true (refresh nền sau sync / realtime): KHÔNG bật skeleton + KHÔNG clear cache
    // → reconcile êm dữ liệu trip ĐANG xem mà không gây nháy màn hình.
    const quiet = opts?.quiet ?? false;
    const isSwitchingTrip = get().currentTripId !== tripId;
    set({
      currentTripId: tripId,
      ...(!quiet && { isLoadingExpenses: true, currentTripLoadError: false }),
      ...(!quiet && isSwitchingTrip && {
        currentTrip: null,
        currentExpenses: [],
        currentPayments: [],
        currentAllMembers: [],
        balances: [],
        settlements: [],
        auditLogs: [],
      }),
    });
    try {
      const [data, trip] = await Promise.all([
        fetchTripBalanceData(tripId),
        fetchTripById(tripId),
      ]);
      if (get().currentTripId !== tripId) return;
      if (!trip) {
        // Trip không tồn tại (đã xóa / id không hợp lệ — vd widget trỏ trip đã xóa).
        // KHÔNG throw: đánh dấu lỗi để screen hiện "không mở được" thay vì kẹt skeleton.
        if (!quiet) set({ currentTripLoadError: true });
        return;
      }
      if (!data) {
        set({
          currentTrip: trip,
          currentExpenses: [],
          currentPayments: [],
          currentAllMembers: [],
          balances: [],
          settlements: [],
        });
        return;
      }
      const balances = computeTripBalances(data.members, data.expenses, data.payments);
      const settlements = calculateSettlements(balances);
      set({
        currentTrip: trip,
        currentExpenses: data.expenses,
        currentPayments: data.payments,
        currentAllMembers: data.members,
        balances,
        settlements,
      });
    } catch (e) {
      // Fetch reject (id sai → Postgres 22P02, network fail, RLS…). Nuốt như
      // loadAuditLogs — KHÔNG để unhandled promise rejection nổi lên (LogBox đỏ).
      // Non-quiet: đánh dấu lỗi để screen thoát skeleton.
      if (__DEV__) console.warn('[Balances] Load failed:', e);
      if (!quiet && get().currentTripId === tripId) {
        set({ currentTripLoadError: true });
      }
    } finally {
      if (!quiet && get().currentTripId === tripId) {
        set({ isLoadingExpenses: false });
      }
    }
  },

  loadAuditLogs: async (tripId) => {
    try {
      const logs = await fetchAuditLogs(tripId);
      if (get().currentTripId !== tripId) return;
      set({ auditLogs: logs });
    } catch (e) {
      if (__DEV__) console.warn('[AuditLogs] Fetch failed:', e);
    }
  },

  recomputeBalances: () => {
    // Pure compute từ cache — gọi sau mutation đã refresh expenses/payments riêng lẻ.
    const { currentExpenses, currentPayments, currentAllMembers } = get();
    if (currentAllMembers.length === 0) return; // cache chưa populate; bỏ qua
    const expensesForCompute = currentExpenses.map((e) => ({
      paid_by: e.paid_by,
      amount: e.amount,
      expense_splits: e.expense_splits.map((s) => ({ member_id: s.member_id, amount: s.amount })),
    }));
    const paymentsForCompute = currentPayments.map((p) => ({
      from_member_id: p.from_member_id,
      to_member_id: p.to_member_id,
      amount: p.amount,
    }));
    const balances = computeTripBalances(currentAllMembers, expensesForCompute, paymentsForCompute);
    const settlements = calculateSettlements(balances);
    set({ balances, settlements });
  },

  getTripContext: (tripId) => {
    const { currentTrip, trips, pinnedTrips, allUserTrips } = get();
    return findTripContext({ currentTrip, trips, pinnedTrips, allUserTrips }, tripId);
  },

  resolveTripContext: async (tripId) => {
    const sync = get().getTripContext(tripId);
    if (sync) return sync;
    // Miss mọi collection (vào trip bypass group detail mà chưa hydrate) → fetch.
    // tryServerThenLocal → đọc SQLite mirror khi offline.
    const trip = await fetchTripById(tripId);
    if (!trip) return null;
    // RETURN-ONLY: KHÔNG set currentTrip ở đây — đó là state single-slot do trip detail
    // screen làm chủ (màn detail còn mounted dưới form được push). Ghi đè sẽ làm màn dưới
    // mis-render. Caller giữ giá trị resolve trong local state riêng.
    return {
      tripId: trip.id,
      groupId: trip.group_id,
      tripName: trip.name,
      status: trip.status,
    };
  },

  loadPinnedTrips: async () => {
    set({ isLoadingPinnedTrips: true });
    try {
      const pinned = await fetchPinnedTrips();
      set({
        pinnedTrips: pinned,
        pinnedTripIds: new Set(pinned.map((t) => t.id)),
      });
    } catch (e) {
      if (__DEV__) console.warn('[PinnedTrips] Fetch failed:', e);
    } finally {
      set({ isLoadingPinnedTrips: false });
    }
  },

  togglePin: async (tripId) => {
    const { pinnedTripIds, pinnedTrips } = get();
    const wasPinned = pinnedTripIds.has(tripId);
    // Optimistic update
    const nextIds = new Set(pinnedTripIds);
    if (wasPinned) {
      nextIds.delete(tripId);
      set({
        pinnedTripIds: nextIds,
        pinnedTrips: pinnedTrips.filter((t) => t.id !== tripId),
      });
    } else {
      nextIds.add(tripId);
      set({ pinnedTripIds: nextIds });
    }

    try {
      if (wasPinned) {
        await unpinTrip(tripId);
      } else {
        await pinTrip(tripId);
      }
      // Refetch để đồng bộ position (đặc biệt sau unpin có thể compact pos 1 → 0)
      await get().loadPinnedTrips();
    } catch (e) {
      // Rollback
      set({ pinnedTripIds: pinnedTripIds, pinnedTrips });
      throw e;
    }
  },

  loadAllUserTrips: async () => {
    set({ isLoadingAllUserTrips: true });
    try {
      const trips = await fetchAllUserTripsWithGroup();
      set({ allUserTrips: trips });
    } catch (e) {
      if (__DEV__) console.warn('[AllUserTrips] Fetch failed:', e);
    } finally {
      set({ isLoadingAllUserTrips: false });
    }
  },

  reorderPinnedTripsLocal: async (orderedTripIds) => {
    const { pinnedTrips } = get();
    const [idA, idB] = orderedTripIds;
    const tripA = pinnedTrips.find((t) => t.id === idA);
    const tripB = pinnedTrips.find((t) => t.id === idB);
    if (!tripA || !tripB) return;

    // Optimistic swap
    set({ pinnedTrips: [tripA, tripB] });

    try {
      await reorderPinnedTrips(orderedTripIds);
    } catch (e) {
      // Revert
      set({ pinnedTrips });
      throw e;
    }
  },

  reset: () =>
    set({
      trips: [],
      currentTrip: null,
      currentExpenses: [],
      currentPayments: [],
      currentAllMembers: [],
      balances: [],
      settlements: [],
      auditLogs: [],
      isLoadingTrips: false,
      isLoadingExpenses: false,
      currentTripId: null,
      currentTripsGroupId: null,
      pinnedTrips: [],
      pinnedTripIds: new Set<string>(),
      isLoadingPinnedTrips: false,
      allUserTrips: null,
      isLoadingAllUserTrips: false,
    }),
}));
