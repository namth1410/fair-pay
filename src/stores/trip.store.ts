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
import type { SplitResult } from '../utils/split';

interface BalanceEntry {
  memberId: string;
  memberName: string;
  balance: number;
}

interface TripState {
  trips: Trip[];
  currentExpenses: ExpenseWithSplits[];
  balances: BalanceEntry[];
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
  loadBalances: (tripId: string) => Promise<void>;
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  currentExpenses: [],
  balances: [],
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

  loadBalances: async (tripId) => {
    const balances = await calculateBalances(tripId);
    set({ balances });
  },
}));
