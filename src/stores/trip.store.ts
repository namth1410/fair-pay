import { create } from 'zustand';

import { type AuditLog, fetchAuditLogs } from '../services/audit.service';
import {
  computeTripBalances,
  createExpense,
  deleteExpense,
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
  fetchTrips,
  reopenTrip,
  type Trip,
  updateTripName,
} from '../services/trip.service';
import type { SplitResult } from '../utils/split';

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

  loadTrips: (groupId: string) => Promise<void>;
  addTrip: (groupId: string, name: string, type?: Trip['type']) => Promise<void>;
  toggleTripStatus: (trip: Trip) => Promise<void>;
  renameTrip: (tripId: string, name: string) => Promise<void>;
  clearCurrentTrip: (tripId: string) => Promise<void>;
  deleteCurrentTrip: (tripId: string, groupId: string) => Promise<void>;

  loadExpenses: (tripId: string) => Promise<void>;
  addExpense: (params: {
    id?: string;
    tripId: string;
    groupId: string;
    title: string;
    amount: number;
    category: string;
    paidByMemberId: string;
    splitType: 'equal' | 'ratio' | 'custom';
    splits: SplitResult[];
    note?: string;
    imageUrl?: string | null;
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
  removePayment: (paymentId: string, tripId: string) => Promise<void>;

  loadBalances: (tripId: string) => Promise<void>;
  loadAuditLogs: (tripId: string) => Promise<void>;
  recomputeBalances: () => void;
  reset: () => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  currentExpenses: [],
  currentPayments: [],
  currentAllMembers: [],
  balances: [],
  settlements: [],
  auditLogs: [],
  isLoadingTrips: false,
  isLoadingExpenses: false,

  loadTrips: async (groupId) => {
    set({ isLoadingTrips: true });
    try {
      const trips = await fetchTrips(groupId);
      set({ trips });
    } finally {
      set({ isLoadingTrips: false });
    }
  },

  addTrip: async (groupId, name, type) => {
    await createTrip(groupId, name, type);
    await get().loadTrips(groupId);
  },

  toggleTripStatus: async (trip) => {
    if (trip.status === 'open') {
      await closeTrip(trip.id);
    } else {
      await reopenTrip(trip.id);
    }
    await Promise.all([
      get().loadTrips(trip.group_id),
      get().loadAuditLogs(trip.id),
    ]);
  },

  renameTrip: async (tripId, name) => {
    await updateTripName(tripId, name);
    const trip = get().trips.find((t) => t.id === tripId);
    await Promise.all([
      trip ? get().loadTrips(trip.group_id) : Promise.resolve(),
      get().loadAuditLogs(tripId),
    ]);
  },

  clearCurrentTrip: async (tripId) => {
    await clearTrip(tripId);
    const trip = get().trips.find((t) => t.id === tripId);
    // Sau RPC mass-soft-delete: cache cũ stale → loadBalances full fetch
    // (populate cả expenses + payments + members lại).
    await Promise.all([
      get().loadBalances(tripId),
      get().loadAuditLogs(tripId),
      trip ? get().loadTrips(trip.group_id) : Promise.resolve(),
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
    // Audit + notify được service `createExpense` xử lý nội bộ (CLAUDE.md §Notifications).
    await createExpense({
      id: params.id,
      tripId: params.tripId,
      groupId: params.groupId,
      title: params.title,
      amount: params.amount,
      category: params.category,
      paidByMemberId: params.paidByMemberId,
      splitType: params.splitType,
      splits: params.splits,
      note: params.note,
      imageUrl: params.imageUrl,
    });
    await Promise.all([
      get().loadExpenses(params.tripId),
      get().loadAuditLogs(params.tripId),
    ]);
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

  removePayment: async (paymentId, tripId) => {
    await deletePayment(paymentId);
    await Promise.all([
      get().loadPayments(tripId),
      get().loadAuditLogs(tripId),
    ]);
    get().recomputeBalances();
  },

  loadBalances: async (tripId) => {
    // Initial fetch (mount trip detail) hoặc post-RPC mass-delete: populate cache đầy đủ.
    // Toggle isLoadingExpenses để ExpensesTab hiện skeleton — tránh phải gọi
    // loadExpenses/loadPayments riêng (sẽ trùng query + race ordering, gây flicker).
    set({ isLoadingExpenses: true });
    try {
      const data = await fetchTripBalanceData(tripId);
      if (!data) {
        set({ currentExpenses: [], currentPayments: [], currentAllMembers: [], balances: [], settlements: [] });
        return;
      }
      const balances = computeTripBalances(data.members, data.expenses, data.payments);
      const settlements = calculateSettlements(balances);
      set({
        currentExpenses: data.expenses,
        currentPayments: data.payments,
        currentAllMembers: data.members,
        balances,
        settlements,
      });
    } finally {
      set({ isLoadingExpenses: false });
    }
  },

  loadAuditLogs: async (tripId) => {
    try {
      const logs = await fetchAuditLogs(tripId);
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

  reset: () =>
    set({
      trips: [],
      currentExpenses: [],
      currentPayments: [],
      currentAllMembers: [],
      balances: [],
      settlements: [],
      auditLogs: [],
      isLoadingTrips: false,
      isLoadingExpenses: false,
    }),
}));
