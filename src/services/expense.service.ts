import { supabase } from '../config/supabase';
import {
  computeBalances as computeBalancesPure,
  type ExpenseData,
  filterInactiveZeroBalance,
  type PaymentData,
} from '../utils/balance';
import { formatNotificationTitle } from '../utils/notificationFormat';
import type { SplitResult } from '../utils/split';
import { validateName, validatePositiveAmount } from '../utils/validate';
import { logAction } from './audit.service';
import { getAuthUserId } from './auth.helper';
import { removeExpenseImage } from './expenseImage.service';
import { assertRole } from './group.service';
import { notifyExpenseEvent } from './notification.service';
import type { Payment } from './payment.service';

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
  image_url: string | null;
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
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Create an expense with splits — BR-02 validated before calling */
export async function createExpense(params: {
  /**
   * Optional client-generated UUID. Cho phép upload ảnh expense trước khi
   * INSERT (key R2 cần ID cuối cùng) — nếu không truyền, Postgres tự sinh.
   */
  id?: string;
  tripId: string;
  groupId: string;
  title: string;
  amount: number;
  paidByMemberId: string;
  splitType: 'equal' | 'ratio' | 'custom';
  splits: SplitResult[];
  note?: string;
  date?: string;
  imageUrl?: string | null;
}): Promise<Expense> {
  const titleErr = validateName(params.title, 'Tên khoản chi');
  if (titleErr) throw new Error(titleErr);
  const amountErr = validatePositiveAmount(params.amount);
  if (amountErr) throw new Error(amountErr);

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  // Pre-fetch actor display_name để truyền cho RPC (dùng format title + dedup)
  const { data: actor } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  const actorName = actor?.display_name || 'Thành viên';
  const initialTitle = formatNotificationTitle({
    type: 'expense.created',
    actorName,
    targetTitle: params.title,
    amount: params.amount,
  });

  // RPC create_expense: atomic insert expense + splits + audit + notify
  const { data, error } = await supabase
    .rpc('create_expense', {
      p_id: params.id ?? null,
      p_trip_id: params.tripId,
      p_group_id: params.groupId,
      p_title: params.title,
      p_amount: params.amount,
      p_category: 'other',
      p_paid_by: params.paidByMemberId,
      p_split_type: params.splitType,
      p_splits: params.splits.map((s) => ({
        member_id: s.memberId,
        amount: s.amount,
      })),
      p_note: params.note ?? null,
      p_date: params.date ?? null,
      p_image_url: params.imageUrl ?? null,
      p_initial_title: initialTitle,
      p_actor_name: actorName,
    })
    .single<Expense>();

  if (error) throw error;
  if (!data) throw new Error('Tạo khoản chi thất bại');
  return data;
}

/** Soft delete expense — BR-04 */
export async function deleteExpense(expenseId: string): Promise<void> {
  const { data: expense, error: fetchErr } = await supabase
    .from('expenses')
    .select('group_id, trip_id, title, amount, image_url, trips!inner(status)')
    .eq('id', expenseId)
    .single();
  if (fetchErr || !expense) throw new Error('Khoản chi không tồn tại');
  const tripStatus = (expense.trips as unknown as { status: string }).status;
  if (tripStatus === 'closed') {
    throw new Error('cannot_modify_closed_trip');
  }
  await assertRole(expense.group_id, ['admin']);

  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId);

  if (error) throw error;

  // Best-effort R2 cleanup nếu expense có ảnh — không block kết quả delete.
  if (expense.image_url) {
    removeExpenseImage(expenseId).catch((err) => {
      if (__DEV__) {
        console.warn('[expense] removeExpenseImage failed:', err);
      }
    });
  }

  // Audit + notify (best-effort)
  const userId = await getAuthUserId();
  if (!userId) return;
  const { data: actor } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  const actorName = actor?.display_name || 'Thành viên';
  await Promise.all([
    logAction({
      groupId: expense.group_id,
      tripId: expense.trip_id,
      action: 'expense.delete',
      targetId: expenseId,
      beforeData: { title: expense.title, amount: expense.amount },
    }),
    notifyExpenseEvent('expense.deleted', {
      groupId: expense.group_id,
      tripId: expense.trip_id,
      actorId: userId,
      actorName,
      expenseId,
      expenseTitle: expense.title,
      amount: expense.amount,
    }),
  ]);
}

export interface TripBalanceMember {
  id: string;
  displayName: string;
  leftAt: string | null;
}

export interface TripBalanceData {
  groupId: string;
  expenses: ExpenseWithSplits[];
  payments: Payment[];
  members: TripBalanceMember[];
}

/**
 * Fetch raw data needed for balance computation — 4 queries in parallel.
 * Tách khỏi compute để store có thể cache + recompute pure sau mutation,
 * tránh round-trip khi addExpense/addPayment.
 */
export async function fetchTripBalanceData(tripId: string): Promise<TripBalanceData | null> {
  const [expensesRes, paymentsRes, tripRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, expense_splits(*)')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('date', { ascending: false }),
    supabase
      .from('trips')
      .select('group_id')
      .eq('id', tripId)
      .single(),
  ]);

  if (expensesRes.error) throw expensesRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (!tripRes.data) return null;

  const { data: members } = await supabase
    .from('group_members')
    .select('id, display_name, left_at')
    .eq('group_id', tripRes.data.group_id);

  return {
    groupId: tripRes.data.group_id as string,
    expenses: (expensesRes.data || []) as ExpenseWithSplits[],
    payments: (paymentsRes.data || []) as Payment[],
    members: (members || []).map((m) => ({
      id: m.id as string,
      displayName: m.display_name as string,
      leftAt: m.left_at as string | null,
    })),
  };
}

/**
 * Pure compute từ data đã fetch — không I/O. Dùng cho recompute sau mutation
 * khi store đã có cached expenses/payments/members.
 */
export function computeTripBalances(
  members: TripBalanceMember[],
  expenses: { paid_by: string; amount: number; expense_splits: { member_id: string; amount: number }[] }[],
  payments: { from_member_id: string; to_member_id: string; amount: number }[]
): { memberId: string; memberName: string; balance: number }[] {
  const expenseData: ExpenseData[] = expenses.map((exp) => ({
    paidBy: exp.paid_by,
    amount: exp.amount,
    splits: (exp.expense_splits || []).map((s) => ({
      memberId: s.member_id,
      amount: s.amount,
    })),
  }));

  const paymentData: PaymentData[] = payments.map((pay) => ({
    fromMemberId: pay.from_member_id,
    toMemberId: pay.to_member_id,
    amount: pay.amount,
  }));

  const memberList = members.map((m) => ({ id: m.id, displayName: m.displayName }));

  const all = computeBalancesPure(memberList, expenseData, paymentData);
  const leftMap = new Map(members.map((m) => [m.id, m.leftAt]));
  return filterInactiveZeroBalance(all, leftMap);
}

/**
 * Calculate balance for each member in a trip — fetch + compute.
 * Giữ cho backward compat. Store mới dùng fetchTripBalanceData + computeTripBalances
 * riêng để cache và recompute pure sau mutation.
 */
export async function calculateBalances(
  tripId: string
): Promise<{ memberId: string; memberName: string; balance: number }[]> {
  const data = await fetchTripBalanceData(tripId);
  if (!data) return [];
  return computeTripBalances(data.members, data.expenses, data.payments);
}
