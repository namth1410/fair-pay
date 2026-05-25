// Expense repository — read expenses + splits từ SQLite local.

import type { ExpenseRow, ExpenseSplitRow } from '../types/database.types';
import { getDatabase, upsertRow } from './_shared';

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'fun'
  | 'shopping'
  | 'other';

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  memberId: string;
  amount: number;
}

export interface Expense {
  id: string;
  tripId: string;
  groupId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  paidBy: string;
  splitType: 'equal' | 'ratio' | 'custom';
  date: string;
  note: string | null;
  imageUrl: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpenseWithSplits extends Expense {
  splits: ExpenseSplit[];
}

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    groupId: row.group_id,
    title: row.title,
    amount: row.amount,
    category: row.category,
    paidBy: row.paid_by,
    splitType: row.split_type,
    date: row.date,
    note: row.note,
    imageUrl: row.image_url,
    createdBy: row.created_by,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapSplit(row: ExpenseSplitRow): ExpenseSplit {
  return {
    id: row.id,
    expenseId: row.expense_id,
    memberId: row.member_id,
    amount: row.amount,
  };
}

export async function getById(id: string): Promise<Expense | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<ExpenseRow>(
    'SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? mapExpense(row) : null;
}

export async function getWithSplits(
  id: string
): Promise<ExpenseWithSplits | null> {
  const expense = await getById(id);
  if (!expense) return null;
  const splits = await listSplits(id);
  return { ...expense, splits };
}

export async function listSplits(expenseId: string): Promise<ExpenseSplit[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<ExpenseSplitRow>(
    'SELECT * FROM expense_splits WHERE expense_id = ?',
    [expenseId]
  );
  return rows.map(mapSplit);
}

export async function listByTrip(tripId: string): Promise<Expense[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<ExpenseRow>(
    `SELECT * FROM expenses
      WHERE trip_id = ? AND deleted_at IS NULL
      ORDER BY date DESC, created_at DESC`,
    [tripId]
  );
  return rows.map(mapExpense);
}

export async function listByTripWithSplits(
  tripId: string
): Promise<ExpenseWithSplits[]> {
  const db = getDatabase();
  const expenseRows = await db.getAllAsync<ExpenseRow>(
    `SELECT * FROM expenses
      WHERE trip_id = ? AND deleted_at IS NULL
      ORDER BY date DESC, created_at DESC`,
    [tripId]
  );
  if (expenseRows.length === 0) return [];
  const ids = expenseRows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const splitRows = await db.getAllAsync<ExpenseSplitRow>(
    `SELECT * FROM expense_splits WHERE expense_id IN (${placeholders})`,
    ids
  );
  const splitsByExpense = new Map<string, ExpenseSplit[]>();
  for (const s of splitRows) {
    const arr = splitsByExpense.get(s.expense_id) ?? [];
    arr.push(mapSplit(s));
    splitsByExpense.set(s.expense_id, arr);
  }
  return expenseRows.map((row) => ({
    ...mapExpense(row),
    splits: splitsByExpense.get(row.id) ?? [],
  }));
}

export async function listByGroup(
  groupId: string,
  limit = 100
): Promise<Expense[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<ExpenseRow>(
    `SELECT * FROM expenses
      WHERE group_id = ? AND deleted_at IS NULL
      ORDER BY date DESC, created_at DESC
      LIMIT ?`,
    [groupId, limit]
  );
  return rows.map(mapExpense);
}

export async function upsertFromServer(row: ExpenseRow): Promise<void> {
  await upsertRow('expenses', {
    id: row.id,
    trip_id: row.trip_id,
    group_id: row.group_id,
    title: row.title,
    amount: row.amount,
    category: row.category,
    paid_by: row.paid_by,
    split_type: row.split_type,
    date: row.date,
    note: row.note,
    image_url: row.image_url,
    created_by: row.created_by,
    version: row.version,
    client_request_id: row.client_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  });
}

export async function upsertSplitFromServer(
  row: ExpenseSplitRow
): Promise<void> {
  await upsertRow('expense_splits', {
    id: row.id,
    expense_id: row.expense_id,
    member_id: row.member_id,
    amount: row.amount,
  });
}
