import { supabase } from '../config/supabase';
import { computeBalances as computeBalancesPure, type ExpenseData, type PaymentData } from '../utils/balance';
import type { SplitResult } from '../utils/split';

export interface Expense {
  id: string;
  trip_id: string;
  group_id: string;
  title: string;
  amount: number;
  category: string;
  paid_by: string; // group_member id
  split_type: 'equal' | 'ratio' | 'custom';
  date: string;
  note: string | null;
  created_by: string;
  version: number;
  created_at: string;
  deleted_at: string | null;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  member_id: string;
  amount: number;
}

export interface ExpenseWithSplits extends Expense {
  expense_splits: ExpenseSplit[];
  payer_name?: string;
}

/** Fetch expenses for a trip, with splits and payer name */
export async function fetchExpenses(
  tripId: string
): Promise<ExpenseWithSplits[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, expense_splits(*)')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Create an expense with splits — BR-02 validated before calling */
export async function createExpense(params: {
  tripId: string;
  groupId: string;
  title: string;
  amount: number;
  category: string;
  paidByMemberId: string;
  splitType: 'equal' | 'ratio' | 'custom';
  splits: SplitResult[];
  note?: string;
  date?: string;
}): Promise<Expense> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  // Insert expense
  const { data: expense, error: expErr } = await supabase
    .from('expenses')
    .insert({
      trip_id: params.tripId,
      group_id: params.groupId,
      title: params.title,
      amount: params.amount,
      category: params.category,
      paid_by: params.paidByMemberId,
      split_type: params.splitType,
      date: params.date || new Date().toISOString(),
      note: params.note || null,
      created_by: userId,
    })
    .select()
    .single();

  if (expErr) throw expErr;

  // Insert splits
  const splitRows = params.splits.map((s) => ({
    expense_id: expense.id,
    member_id: s.memberId,
    amount: s.amount,
  }));

  const { error: splitErr } = await supabase
    .from('expense_splits')
    .insert(splitRows);

  if (splitErr) throw splitErr;

  return expense;
}

/** Soft delete expense — BR-04 */
export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId);

  if (error) throw error;
}

/**
 * Calculate balance for each member in a trip.
 * Fetches data from Supabase, then delegates to pure function in utils/balance.ts.
 */
export async function calculateBalances(
  tripId: string
): Promise<{ memberId: string; memberName: string; balance: number }[]> {
  // Fetch expenses with splits
  const { data: expenses, error: expErr } = await supabase
    .from('expenses')
    .select('*, expense_splits(*)')
    .eq('trip_id', tripId)
    .is('deleted_at', null);

  if (expErr) throw expErr;

  // Fetch payments
  const { data: payments, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .eq('trip_id', tripId)
    .is('deleted_at', null);

  if (payErr) throw payErr;

  // Fetch trip to get group_id
  const { data: trip } = await supabase
    .from('trips')
    .select('group_id')
    .eq('id', tripId)
    .single();

  if (!trip) return [];

  // Fetch members
  const { data: members } = await supabase
    .from('group_members')
    .select('id, display_name')
    .eq('group_id', trip.group_id);

  if (!members) return [];

  // Transform to pure function format
  const expenseData: ExpenseData[] = (expenses || []).map((exp: any) => ({
    paidBy: exp.paid_by,
    amount: exp.amount,
    splits: (exp.expense_splits || []).map((s: any) => ({
      memberId: s.member_id,
      amount: s.amount,
    })),
  }));

  const paymentData: PaymentData[] = (payments || []).map((pay: any) => ({
    fromMemberId: pay.from_member_id,
    toMemberId: pay.to_member_id,
    amount: pay.amount,
  }));

  const memberList = members.map((m) => ({
    id: m.id,
    displayName: m.display_name,
  }));

  // Delegate to shared pure function (same code as tests use)
  return computeBalancesPure(memberList, expenseData, paymentData);
}

// ── Helper ──────────────────────────────────
async function getAuthUserId(): Promise<string | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single();

  return data?.id ?? null;
}
