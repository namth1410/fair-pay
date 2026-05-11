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
    .order('date', { ascending: false });

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
  category: string;
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
      p_category: params.category,
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
    .select('group_id, trip_id, title, amount, image_url')
    .eq('id', expenseId)
    .single();
  if (fetchErr || !expense) throw new Error('Khoản chi không tồn tại');
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

  // Lấy TẤT CẢ members (kể cả đã rời) vì expense/payment của họ vẫn ảnh hưởng đến balance.
  // Khác với fetchGroupMembers() chỉ lấy active members cho hiển thị danh sách.
  const { data: members } = await supabase
    .from('group_members')
    .select('id, display_name, left_at')
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
  const all = computeBalancesPure(memberList, expenseData, paymentData);

  // Filter: member đã rời (left_at !== null) chỉ giữ nếu còn balance ≠ 0 (lịch sử quan trọng).
  // Active member giữ nguyên kể cả balance = 0 (cân bằng).
  const leftMap = new Map(members.map((m) => [m.id, m.left_at as string | null]));
  return filterInactiveZeroBalance(all, leftMap);
}
