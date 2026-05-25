// Expense preset repository — read presets từ SQLite local.

import type {
  ExpensePresetRow,
  PresetSplitEntry,
} from '../types/database.types';
import { getDatabase, safeJsonParse, upsertRow } from './_shared';

import type { ExpenseCategory } from './expense.repo';

export type SplitType = 'equal' | 'ratio' | 'custom';

export interface Preset {
  id: string;
  userId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  tripId: string | null;
  paidByMemberId: string | null;
  splitType: SplitType | null;
  splitsData: PresetSplitEntry[] | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function mapRow(row: ExpensePresetRow): Preset {
  // SQLite lưu jsonb as TEXT, Postgres trả về object — safeJsonParse handle cả 2
  const splitsRaw: unknown = row.splits_data;
  let splitsData: PresetSplitEntry[] | null = null;
  if (typeof splitsRaw === 'string') {
    splitsData = safeJsonParse<PresetSplitEntry[] | null>(splitsRaw, null);
  } else if (splitsRaw && typeof splitsRaw === 'object') {
    splitsData = splitsRaw as PresetSplitEntry[];
  }
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    amount: row.amount,
    category: row.category,
    tripId: row.trip_id,
    paidByMemberId: row.paid_by_member_id,
    splitType: row.split_type,
    splitsData,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function getById(id: string): Promise<Preset | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<ExpensePresetRow>(
    'SELECT * FROM expense_presets WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? mapRow(row) : null;
}

/**
 * List presets cho user, theo context:
 *   - tripId=null (home): all presets — global + all trip-pinned
 *   - tripId='X' (in-trip): chỉ global + trip-pinned của X
 */
export async function listForUser(
  userId: string,
  tripId?: string
): Promise<Preset[]> {
  const db = getDatabase();
  if (tripId === undefined) {
    const rows = await db.getAllAsync<ExpensePresetRow>(
      `SELECT * FROM expense_presets
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
      [userId]
    );
    return rows.map(mapRow);
  }
  // In-trip: global OR pinned-to-tripId
  const rows = await db.getAllAsync<ExpensePresetRow>(
    `SELECT * FROM expense_presets
      WHERE user_id = ?
        AND deleted_at IS NULL
        AND (trip_id IS NULL OR trip_id = ?)
      ORDER BY trip_id IS NULL ASC, updated_at DESC`,
    [userId, tripId]
  );
  return rows.map(mapRow);
}

/**
 * Check trùng title cùng scope — UI hint inline khi user gõ title.
 * scope='global' → trip_id IS NULL. scope=tripId → trip_id = ?.
 */
export async function existsByTitle(
  userId: string,
  title: string,
  scope: 'global' | string
): Promise<boolean> {
  const db = getDatabase();
  const trimmed = title.trim();
  if (scope === 'global') {
    const row = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM expense_presets
        WHERE user_id = ? AND title = ? AND trip_id IS NULL AND deleted_at IS NULL`,
      [userId, trimmed]
    );
    return (row?.c ?? 0) > 0;
  }
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM expense_presets
      WHERE user_id = ? AND title = ? AND trip_id = ? AND deleted_at IS NULL`,
    [userId, trimmed, scope]
  );
  return (row?.c ?? 0) > 0;
}

export async function upsertFromServer(row: ExpensePresetRow): Promise<void> {
  await upsertRow('expense_presets', {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    amount: row.amount,
    category: row.category,
    trip_id: row.trip_id,
    paid_by_member_id: row.paid_by_member_id,
    split_type: row.split_type,
    splits_data:
      typeof row.splits_data === 'object' && row.splits_data !== null
        ? JSON.stringify(row.splits_data)
        : row.splits_data,
    version: row.version,
    client_request_id: row.client_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  });
}
