import { supabase } from '../config/supabase';
import { computeBalances as computeBalancesPure, type ExpenseData, type PaymentData } from '../utils/balance';
import type { SplitResult } from '../utils/split';
import { validateName, validatePositiveAmount } from '../utils/validate';

import { getAuthUserId } from './auth.helper';

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
  const titleErr = validateName(params.title, 'Tên khoản chi');
  if (titleErr) throw new Error(titleErr);
  const amountErr = validatePositiveAmount(params.amount);
  if (amountErr) throw new Error(amountErr);

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

  // Insert splits — rollback expense if splits fail to maintain BR-02 invariant
  const splitRows = params.splits.map((s) => ({
    expense_id: expense.id,
    member_id: s.memberId,
    amount: s.amount,
  }));

  const { error: splitErr } = await supabase
    .from('expense_splits')
    .insert(splitRows);

  if (splitErr) {
    // Rollback: delete the orphaned expense to prevent data corruption
    await supabase.from('expenses').delete().eq('id', expense.id);
    throw splitErr;
  }

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
  // Parallel fetch: expenses, payments, and trip (all depend only on tripId)
  const [expensesRes, paymentsRes, tripRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, expense_splits(*)')
      .eq('trip_id', tripId)
      .is('deleted_at', null),
    supabase
      .from('payments')
      .select('*')
      .eq('trip_id', tripId)
      .is('deleted_at', null),
    supabase
      .from('trips')
      .select('group_id')
      .eq('id', tripId)
      .single(),
  ]);

  if (expensesRes.error) throw expensesRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (!tripRes.data) return [];

  const expenses = expensesRes.data;
  const payments = paymentsRes.data;

  // Members query depends on trip.group_id — must run after trip fetch
  const { data: members } = await supabase
    .from('group_members')
    .select('id, display_name')
    .eq('group_id', tripRes.data.group_id);

  if (!members) return [];

  // Transform to pure function format
  const expenseData: ExpenseData[] = (expenses || []).map((exp) => ({
    paidBy: exp.paid_by as string,
    amount: exp.amount as number,
    splits: ((exp.expense_splits as { member_id: string; amount: number }[]) || []).map((s) => ({
      memberId: s.member_id,
      amount: s.amount,
    })),
  }));

  const paymentData: PaymentData[] = (payments || []).map((pay) => ({
    fromMemberId: pay.from_member_id as string,
    toMemberId: pay.to_member_id as string,
    amount: pay.amount as number,
  }));

  const memberList = members.map((m) => ({
    id: m.id,
    displayName: m.display_name,
  }));

  // Delegate to shared pure function (same code as tests use)
  return computeBalancesPure(memberList, expenseData, paymentData);
}
