import { create } from 'zustand';

import { logAction } from '../services/audit.service';
import {
  calculateBalances,
  createExpense,
  deleteExpense,
  type ExpenseWithSplits,
  fetchExpenses,
} from '../services/expense.service';
import {
  calculateSettlements,
  createPayment,
  deletePayment,
  fetchPayments,
  type Payment,
} from '../services/payment.service';
import {
  closeTrip,
  createTrip,
  fetchTrips,
  reopenTrip,
  type Trip,
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
  balances: BalanceEntry[];
  settlements: SettlementEntry[];
  isLoading: boolean;

  loadTrips: (groupId: string) => Promise<void>;
  addTrip: (groupId: string, name: string, type?: Trip['type']) => Promise<void>;
  toggleTripStatus: (trip: Trip) => Promise<void>;

  loadExpenses: (tripId: string) => Promise<void>;
  addExpense: (params: {
    tripId: string;
    groupId: string;
    title: string;
    amount: number;
    category: string;
    paidByMemberId: string;
    splitType: 'equal' | 'ratio' | 'custom';
    splits: SplitResult[];
    note?: string;
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
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  currentExpenses: [],
  currentPayments: [],
  balances: [],
  settlements: [],
  isLoading: false,

  loadTrips: async (groupId) => {
    set({ isLoading: true });
    try {
      const trips = await fetchTrips(groupId);
      set({ trips });
    } finally {
      set({ isLoading: false });
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
    await get().loadTrips(trip.group_id);
  },

  loadExpenses: async (tripId) => {
    set({ isLoading: true });
    try {
      const expenses = await fetchExpenses(tripId);
      set({ currentExpenses: expenses });
    } finally {
      set({ isLoading: false });
    }
  },

  addExpense: async (params) => {
    const result = await createExpense(params);
    await logAction({
      groupId: params.groupId,
      tripId: params.tripId,
      action: 'expense.create',
      targetId: result?.id || 'unknown',
      afterData: { title: params.title, amount: params.amount, category: params.category, paidBy: params.paidByMemberId },
    });
    await get().loadExpenses(params.tripId);
    await get().loadBalances(params.tripId);
  },

  removeExpense: async (expenseId, tripId) => {
    // Get data before deleting for audit log
    const expense = get().currentExpenses.find((e) => e.id === expenseId);
    await deleteExpense(expenseId);
    if (expense) {
      await logAction({
        groupId: expense.group_id,
        tripId,
        action: 'expense.delete',
        targetId: expenseId,
        beforeData: { title: expense.title, amount: expense.amount },
      });
    }
    await get().loadExpenses(tripId);
    await get().loadBalances(tripId);
  },

  loadPayments: async (tripId) => {
    const payments = await fetchPayments(tripId);
    set({ currentPayments: payments });
  },

  addPayment: async (params) => {
    const result = await createPayment(params);
    await logAction({
      groupId: params.groupId,
      tripId: params.tripId,
      action: 'payment.create',
      targetId: result?.id || 'unknown',
      afterData: { from: params.fromMemberId, to: params.toMemberId, amount: params.amount },
    });
    await get().loadPayments(params.tripId);
    await get().loadBalances(params.tripId);
  },

  removePayment: async (paymentId, tripId) => {
    const payment = get().currentPayments.find((p) => p.id === paymentId);
    await deletePayment(paymentId);
    if (payment) {
      await logAction({
        groupId: payment.group_id,
        tripId,
        action: 'payment.delete',
        targetId: paymentId,
        beforeData: { from: payment.from_member_id, to: payment.to_member_id, amount: payment.amount },
      });
    }
    await get().loadPayments(tripId);
    await get().loadBalances(tripId);
  },

  loadBalances: async (tripId) => {
    const balances = await calculateBalances(tripId);
    const settlements = calculateSettlements(balances);
    set({ balances, settlements });
  },
}));
