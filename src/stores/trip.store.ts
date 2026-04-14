import { create } from 'zustand';
import {
  fetchTrips,
  createTrip,
  closeTrip,
  reopenTrip,
  type Trip,
} from '../services/trip.service';
import {
  fetchExpenses,
  createExpense,
  deleteExpense,
  calculateBalances,
  type ExpenseWithSplits,
} from '../services/expense.service';
import {
  fetchPayments,
  createPayment,
  deletePayment,
  calculateSettlements,
  type Payment,
} from '../services/payment.service';
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
    await createExpense(params);
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
}));
