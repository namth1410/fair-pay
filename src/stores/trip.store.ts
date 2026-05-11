import { create } from 'zustand';

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
  balances: BalanceEntry[];
  settlements: SettlementEntry[];
  isLoading: boolean;

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
  reset: () => void;
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

  renameTrip: async (tripId, name) => {
    await updateTripName(tripId, name);
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) await get().loadTrips(trip.group_id);
  },

  clearCurrentTrip: async (tripId) => {
    await clearTrip(tripId);
    const trip = get().trips.find((t) => t.id === tripId);
    await Promise.all([
      get().loadExpenses(tripId),
      get().loadPayments(tripId),
      get().loadBalances(tripId),
      trip ? get().loadTrips(trip.group_id) : Promise.resolve(),
    ]);
  },

  deleteCurrentTrip: async (tripId, groupId) => {
    await deleteTrip(tripId);
    await get().loadTrips(groupId);
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
    await get().loadExpenses(params.tripId);
    await get().loadBalances(params.tripId);
  },

  removeExpense: async (expenseId, tripId) => {
    await deleteExpense(expenseId);
    await get().loadExpenses(tripId);
    await get().loadBalances(tripId);
  },

  loadPayments: async (tripId) => {
    const payments = await fetchPayments(tripId);
    set({ currentPayments: payments });
  },

  addPayment: async (params) => {
    await createPayment(params);
    await get().loadPayments(params.tripId);
    await get().loadBalances(params.tripId);
  },

  removePayment: async (paymentId, tripId) => {
    await deletePayment(paymentId);
    await get().loadPayments(tripId);
    await get().loadBalances(tripId);
  },

  loadBalances: async (tripId) => {
    const balances = await calculateBalances(tripId);
    const settlements = calculateSettlements(balances);
    set({ balances, settlements });
  },

  reset: () =>
    set({
      trips: [],
      currentExpenses: [],
      currentPayments: [],
      balances: [],
      settlements: [],
      isLoading: false,
    }),
}));
