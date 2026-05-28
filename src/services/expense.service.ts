import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import * as userRepo from '../repositories/user.repo';
import { mirrorServerRow } from '../repositories/writeback';
import { useAppStore } from '../stores/app.store';
import { tryServerThenLocal } from '../sync/fallback';
import { run as runSync } from '../sync/syncEngine';
import * as syncQueue from '../sync/syncQueue';
import { ENTITY_TYPES, OP_TYPES } from '../sync/types';
import {
  computeBalances as computeBalancesPure,
  type ExpenseData,
  filterInactiveZeroBalance,
  type PaymentData,
} from '../utils/balance';
import { isNetworkError } from '../utils/network';
import { formatNotificationTitle } from '../utils/notificationFormat';
import type { SplitResult } from '../utils/split';
import { validateName, validatePositiveAmount } from '../utils/validate';
import { getAuthUserId } from './auth.helper';
import { removeExpenseImage } from './expenseImage.service';
import { assertRole } from './group.service';
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

/** Fetch expenses for a trip, with splits and payer name. Fallback SQLite mirror. */
export async function fetchExpenses(
  tripId: string
): Promise<ExpenseWithSplits[]> {
  return tryServerThenLocal<ExpenseWithSplits[]>(
    async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('trip_id', tripId)
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async () => {
      const db = getDatabase();
      const expenses = await db.getAllAsync<Expense>(
        `SELECT * FROM expenses
          WHERE trip_id = ? AND deleted_at IS NULL
          ORDER BY date DESC, created_at DESC`,
        [tripId]
      );
      if (expenses.length === 0) return [];
      const ids = expenses.map((e) => e.id);
      const placeholders = ids.map(() => '?').join(',');
      const splits = await db.getAllAsync<ExpenseSplit>(
        `SELECT * FROM expense_splits WHERE expense_id IN (${placeholders})`,
        ids
      );
      const splitsByExpense = new Map<string, ExpenseSplit[]>();
      for (const s of splits) {
        const arr = splitsByExpense.get(s.expense_id) ?? [];
        arr.push(s);
        splitsByExpense.set(s.expense_id, arr);
      }
      return expenses.map((e) => ({
        ...e,
        expense_splits: splitsByExpense.get(e.id) ?? [],
      }));
    }
  );
}

/**
 * Write expense + splits vào SQLite local làm optimistic state.
 * Dùng cho offline path khi enqueue. Return Expense object render được trên UI.
 */
async function writeExpenseLocal(params: {
  id: string;
  tripId: string;
  groupId: string;
  userId: string;
  title: string;
  amount: number;
  category: string;
  paidByMemberId: string;
  splitType: 'equal' | 'ratio' | 'custom';
  splits: SplitResult[];
  note: string | null;
  date: string;
  imageUrl: string | null;
}): Promise<Expense> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO expenses
        (id, trip_id, group_id, title, amount, category, paid_by, split_type,
         date, note, image_url, created_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        params.id,
        params.tripId,
        params.groupId,
        params.title,
        params.amount,
        params.category,
        params.paidByMemberId,
        params.splitType,
        params.date,
        params.note,
        params.imageUrl,
        params.userId,
        now,
        now,
      ]
    );
    for (const s of params.splits) {
      const splitId = globalThis.crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO expense_splits (id, expense_id, member_id, amount)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [splitId, params.id, s.memberId, s.amount]
      );
    }
  });

  return {
    id: params.id,
    trip_id: params.tripId,
    group_id: params.groupId,
    title: params.title,
    amount: params.amount,
    category: params.category,
    paid_by: params.paidByMemberId,
    split_type: params.splitType,
    date: params.date,
    note: params.note,
    image_url: params.imageUrl,
    created_by: params.userId,
    version: 1,
    created_at: now,
    deleted_at: null,
  };
}

/**
 * Create an expense with splits — BR-02 validated before calling.
 *
 * Offline-first flow:
 *   - Online: gọi RPC create_expense (atomic insert + splits + audit + notify)
 *   - Offline / network fail: ghi local SQLite + enqueue sync_queue
 *
 * Đảm bảo UI luôn cập nhật ngay (optimistic). Khi sync, server tạo audit + notify
 * thật. Notification fan-out có thể trễ — chấp nhận tradeoff (đã document).
 */
export async function createExpense(params: {
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

  const expenseId = params.id ?? globalThis.crypto.randomUUID();
  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();
  const date = params.date ?? clientCreatedAt;
  const note = params.note ?? null;
  const imageUrl = params.imageUrl ?? null;

  const enqueueAndPersistLocal = async (): Promise<Expense> => {
    const expense = await writeExpenseLocal({
      id: expenseId,
      tripId: params.tripId,
      groupId: params.groupId,
      userId,
      title: params.title,
      amount: params.amount,
      category: 'other',
      paidByMemberId: params.paidByMemberId,
      splitType: params.splitType,
      splits: params.splits,
      note,
      date,
      imageUrl,
    });
    // Capture actor identity từ SQLite local (offline-safe) để format notification
    // title trước khi enqueue. Dispatcher replay sẽ pass thẳng cho RPC create_expense
    // (yêu cầu p_initial_title + p_actor_name).
    const actor = await userRepo.getById(userId);
    const actorName = actor?.displayName || 'Thành viên';
    const initialTitle = formatNotificationTitle({
      type: 'expense.created',
      actorName,
      targetTitle: params.title,
      amount: params.amount,
    });
    // Server payload image_url: null nếu staged local (file://) — server insert NULL,
    // imageUploadWorker sẽ commit R2 URL sau khi upload xong. Tránh broken URL trên
    // server cho thiết bị khác pull về.
    const payloadImageUrl = imageUrl?.startsWith('file://') ? null : imageUrl;
    await syncQueue.enqueue({
      op_type: OP_TYPES.CREATE_EXPENSE,
      entity_type: ENTITY_TYPES.EXPENSE,
      entity_id: expenseId,
      client_request_id: clientRequestId,
      payload: {
        id: expenseId,
        trip_id: params.tripId,
        group_id: params.groupId,
        title: params.title,
        amount: params.amount,
        category: 'other',
        paid_by: params.paidByMemberId,
        split_type: params.splitType,
        date,
        note,
        image_url: payloadImageUrl,
        splits: params.splits.map((s) => ({
          member_id: s.memberId,
          amount: s.amount,
        })),
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
        initial_title: initialTitle,
        actor_name: actorName,
      },
    });
    return expense;
  };

  // Local-first cho mọi flow (online + offline). UI navigate back ngay sau khi
  // local write thành công; sync engine flush queue ngầm.
  const expense = await enqueueAndPersistLocal();
  if (useAppStore.getState().isOnline) {
    void runSync(true).catch((e) => {
      if (__DEV__) console.warn('[createExpense] sync trigger fail', e);
    });
  }
  return expense;
}

/**
 * Soft delete expense — BR-04. Offline-first: idempotent soft-delete.
 *
 * Local: UPDATE expenses SET deleted_at = COALESCE(deleted_at, now()).
 * Online: same UPDATE + best-effort R2 image cleanup + audit + notify.
 * Replay queue: server-side `expenses.update set deleted_at` (already idempotent qua
 * `is('deleted_at', null)` clause), 2nd call ON CONFLICT no-op.
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();

  // Lookup local expense ĐỂ check trip status + image_url (offline cũng cần).
  const db = getDatabase();
  const localExp = await db.getFirstAsync<{
    group_id: string;
    trip_id: string;
    title: string;
    amount: number;
    image_url: string | null;
    trip_status: string;
  }>(
    `SELECT e.group_id, e.trip_id, e.title, e.amount, e.image_url,
            t.status AS trip_status
       FROM expenses e
       INNER JOIN trips t ON t.id = e.trip_id
      WHERE e.id = ?`,
    [expenseId]
  );
  if (!localExp) throw new Error('Khoản chi không tồn tại');
  if (localExp.trip_status === 'closed') {
    throw new Error('cannot_modify_closed_trip');
  }
  await assertRole(localExp.group_id, ['admin']);

  // Fetch actor_name từ local mirror (offline-friendly) để truyền vào RPC cho
  // notify dedup title. Cả online lẫn replay queue path đều dùng.
  const userId = await getAuthUserId();
  const localUser = userId ? await userRepo.getById(userId) : null;
  const actorName = localUser?.displayName?.trim() || 'Thành viên';

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE expenses
          SET deleted_at = COALESCE(deleted_at, ?)
        WHERE id = ?`,
      [clientCreatedAt, expenseId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.DELETE_EXPENSE,
      entity_type: ENTITY_TYPES.EXPENSE,
      entity_id: expenseId,
      client_request_id: clientRequestId,
      payload: {
        expense_id: expenseId,
        actor_name: actorName,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
      },
    });
  };

  const isOnline = useAppStore.getState().isOnline;
  const hasPending = await syncQueue.hasPendingForEntity(ENTITY_TYPES.EXPENSE, expenseId);
  if (!isOnline || hasPending) {
    await enqueueLocal();
    if (isOnline) {
      void runSync().catch(() => {});
    }
    return;
  }

  try {
    const { data, error } = await supabase.rpc('delete_expense', {
      p_expense_id: expenseId,
      p_actor_name: actorName,
      p_client_request_id: clientRequestId,
      p_client_created_at: clientCreatedAt,
    });
    if (error) throw error;

    // delete_expense RPC RETURNS jsonb { expense_id, was_deleted, group_id, trip_id, version, updated_at }
    if (data && typeof data === 'object' && 'version' in data && 'updated_at' in data) {
      const row = data as { version: number; updated_at: string };
      await mirrorServerRow('expenses', expenseId, row, { deleted_at: clientCreatedAt });
    }

    // RPC server-side đã log audit `expense.delete` + notify `expense.deleted` atomic.
    // Best-effort R2 cleanup nếu expense có ảnh — không block kết quả delete.
    if (localExp.image_url) {
      removeExpenseImage(expenseId).catch((err) => {
        if (__DEV__) {
          console.warn('[expense] removeExpenseImage failed:', err);
        }
      });
    }
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[deleteExpense] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
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
 *
 * Offline: dùng SQLite mirror (trips/expenses/expense_splits/payments/group_members
 * đều được pull worker đồng bộ). Members KHÔNG filter `left_at IS NULL` giống
 * server path — ex-member có thể còn balance cần hiện.
 */
export async function fetchTripBalanceData(tripId: string): Promise<TripBalanceData | null> {
  return tryServerThenLocal<TripBalanceData | null>(
    async () => {
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
    },
    async () => {
      const db = getDatabase();
      const tripRow = await db.getFirstAsync<{ group_id: string }>(
        `SELECT group_id FROM trips WHERE id = ? AND deleted_at IS NULL`,
        [tripId]
      );
      if (!tripRow) return null;

      const expenses = await db.getAllAsync<Expense>(
        `SELECT * FROM expenses
          WHERE trip_id = ? AND deleted_at IS NULL
          ORDER BY date DESC, created_at DESC`,
        [tripId]
      );

      let splits: ExpenseSplit[] = [];
      if (expenses.length > 0) {
        const ids = expenses.map((e) => e.id);
        const placeholders = ids.map(() => '?').join(',');
        splits = await db.getAllAsync<ExpenseSplit>(
          `SELECT * FROM expense_splits WHERE expense_id IN (${placeholders})`,
          ids
        );
      }
      const splitsByExpense = new Map<string, ExpenseSplit[]>();
      for (const s of splits) {
        const arr = splitsByExpense.get(s.expense_id) ?? [];
        arr.push(s);
        splitsByExpense.set(s.expense_id, arr);
      }
      const expensesWithSplits: ExpenseWithSplits[] = expenses.map((e) => ({
        ...e,
        expense_splits: splitsByExpense.get(e.id) ?? [],
      }));

      const payments = await db.getAllAsync<Payment>(
        `SELECT * FROM payments
          WHERE trip_id = ? AND deleted_at IS NULL
          ORDER BY date DESC`,
        [tripId]
      );

      const members = await db.getAllAsync<{
        id: string;
        display_name: string;
        left_at: string | null;
      }>(
        `SELECT id, display_name, left_at FROM group_members WHERE group_id = ?`,
        [tripRow.group_id]
      );

      return {
        groupId: tripRow.group_id,
        expenses: expensesWithSplits,
        payments,
        members: members.map((m) => ({
          id: m.id,
          displayName: m.display_name,
          leftAt: m.left_at,
        })),
      };
    }
  );
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
