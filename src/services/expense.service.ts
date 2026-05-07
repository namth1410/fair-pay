import { supabase } from '../config/supabase';
import { computeBalances as computeBalancesPure, type ExpenseData, type PaymentData } from '../utils/balance';
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

  await assertRole(params.groupId, ['admin', 'member']);

  // Verify trip thuộc đúng group + chưa đóng
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('group_id, status')
    .eq('id', params.tripId)
    .is('deleted_at', null)
    .maybeSingle();
  if (tripErr) throw tripErr;
  if (!trip || trip.group_id !== params.groupId) {
    throw new Error('Chuyến không thuộc nhóm này');
  }
  if (trip.status === 'closed') {
    throw new Error('Chuyến đã đóng, không thể thêm khoản chi');
  }

  // Verify paidByMemberId là member active của group (chống cross-group injection)
  const { data: payerMember } = await supabase
    .from('group_members')
    .select('id')
    .eq('id', params.paidByMemberId)
    .eq('group_id', params.groupId)
    .maybeSingle();
  if (!payerMember) {
    throw new Error('Người trả không thuộc nhóm này');
  }

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  // Insert expense
  const insertPayload: Record<string, unknown> = {
    trip_id: params.tripId,
    group_id: params.groupId,
    title: params.title,
    amount: params.amount,
    category: params.category,
    paid_by: params.paidByMemberId,
    split_type: params.splitType,
    date: params.date || new Date().toISOString(),
    note: params.note || null,
    image_url: params.imageUrl ?? null,
    created_by: userId,
  };
  if (params.id) insertPayload.id = params.id;

  const { data: expense, error: expErr } = await supabase
    .from('expenses')
    .insert(insertPayload)
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

  // Audit + notify (best-effort, không block flow chính)
  const { data: actor } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  const actorName = actor?.display_name || 'Thành viên';
  await Promise.all([
    logAction({
      groupId: params.groupId,
      tripId: params.tripId,
      action: 'expense.create',
      targetId: expense.id,
      afterData: {
        title: params.title,
        amount: params.amount,
        category: params.category,
      },
    }),
    notifyExpenseEvent('expense.created', {
      groupId: params.groupId,
      tripId: params.tripId,
      actorId: userId,
      actorName,
      expenseId: expense.id,
      expenseTitle: params.title,
      amount: params.amount,
    }),
  ]);

  return expense;
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
