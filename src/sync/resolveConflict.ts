// Conflict resolution actions — gọi từ ConflictResolverModal.
//
// 3 action user có thể chọn:
//   1. keepMine — resubmit queue item với base_version = server.version (force overwrite)
//   2. keepTheirs — discard local change, update local mirror với server data
//   3. defer — để conflict trong queue, user xử lý sau qua Conflict Inbox

import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import type { SyncQueueRow } from '../types/database.types';
import * as syncQueue from './syncQueue';

/**
 * "Giữ thay đổi của tôi" — update payload với base_version mới + reset status pending.
 * Next push cycle sẽ resubmit. Server bumps version từ new base.
 *
 * Caller phải truyền version field name (vd 'version' cho hầu hết, 'updated_at' cho settings LWW).
 */
export async function keepMine(
  item: SyncQueueRow,
  newBaseVersionField: 'version' | 'updated_at',
  serverData: Record<string, unknown>
): Promise<void> {
  const payload = JSON.parse(item.payload) as Record<string, unknown>;
  const baseField = newBaseVersionField === 'version' ? 'base_version' : 'base_updated_at';
  payload[baseField] = serverData[newBaseVersionField];
  await syncQueue.updateConflictPayloadAndReset(item.id, payload);
}

// Whitelist cột hợp lệ cho mỗi local table — source of truth là src/db/schema.ts.
// Bất kỳ key nào server trả về mà không có trong set sẽ bị bỏ qua (log warn) thay vì
// ném "no such column" — defense-in-depth khi server thêm cột mới hoặc embed JOIN.
const ALLOWED_COLUMNS: Record<string, ReadonlySet<string>> = {
  groups: new Set([
    'id', 'name', 'avatar_url', 'created_by', 'invite_code',
    'version', 'client_request_id', 'created_at', 'updated_at', 'deleted_at',
  ]),
  trips: new Set([
    'id', 'group_id', 'name', 'type', 'status', 'created_by',
    'version', 'client_request_id', 'created_at', 'updated_at', 'closed_at', 'deleted_at',
  ]),
  expenses: new Set([
    'id', 'trip_id', 'group_id', 'title', 'amount', 'category',
    'paid_by', 'split_type', 'date', 'note', 'image_url', 'created_by',
    'version', 'client_request_id', 'created_at', 'updated_at', 'deleted_at',
  ]),
  payments: new Set([
    'id', 'trip_id', 'group_id', 'from_member_id', 'to_member_id', 'amount',
    'note', 'recorded_by', 'date',
    'version', 'client_request_id', 'created_at', 'updated_at', 'deleted_at',
  ]),
  expense_presets: new Set([
    'id', 'user_id', 'trip_id', 'title', 'amount', 'category',
    'paid_by_member_id', 'split_type', 'splits_data',
    'version', 'client_request_id', 'created_at', 'updated_at', 'deleted_at',
  ]),
  group_members: new Set([
    'id', 'group_id', 'user_id', 'display_name', 'role', 'is_virtual',
    'version', 'client_request_id', 'joined_at', 'updated_at', 'left_at',
  ]),
  users: new Set([
    'id', 'auth_id', 'display_name', 'email', 'photo_url', 'fcm_token', 'settings',
    'version', 'created_at', 'updated_at',
  ]),
  pinned_trips: new Set([
    'id', 'user_id', 'trip_id', 'position', 'pinned_at', 'updated_at',
  ]),
  notifications: new Set([
    'id', 'user_id', 'group_id', 'trip_id', 'type', 'actor_id',
    'title', 'body', 'data', 'read_at', 'created_at', 'updated_at',
  ]),
};

const ENTITY_TO_TABLE: Record<string, string> = {
  group: 'groups',
  trip: 'trips',
  expense: 'expenses',
  payment: 'payments',
  preset: 'expense_presets',
  group_member: 'group_members',
  user: 'users',
  pinned_trip: 'pinned_trips',
  notification: 'notifications',
};

/**
 * "Giữ thay đổi của họ" — drop queue item + sync local mirror với server state.
 *
 * Hành vi atomic: INSERT/UPDATE local mirror + DELETE queue item chạy trong cùng
 * `withTransactionAsync` → nếu bất kỳ bước nào fail, cả 2 rollback → user thấy
 * lỗi và queue item stay 'conflict' để retry, KHÔNG mất state.
 *
 * Cột server trả mà không trong whitelist sẽ bị bỏ qua (log warn) — tránh
 * "no such column" khi server thêm cột mới trước khi SQLite migration kịp.
 *
 * @throws Error nếu entity_type không hợp lệ hoặc serverData không có id.
 */
export async function keepTheirs(
  item: SyncQueueRow,
  serverData: Record<string, unknown> | null
): Promise<void> {
  const table = ENTITY_TO_TABLE[item.entity_type];
  if (!table) {
    throw new Error(
      `Không thể áp dụng dữ liệu server: entity_type "${item.entity_type}" chưa được hỗ trợ`
    );
  }
  const allowed = ALLOWED_COLUMNS[table];
  if (!allowed) {
    throw new Error(`Không thể áp dụng dữ liệu server: thiếu whitelist cho bảng "${table}"`);
  }

  // Expense: serverData chỉ chứa row `expenses`, KHÔNG có `expense_splits` (bảng riêng,
  // không có version/updated_at). Sau khi bỏ local edit và adopt server, phải re-fetch
  // splits server để mirror local đúng — nếu không, splits vẫn giữ bản edit local vừa bỏ
  // → sai balance. Fetch TRƯỚC transaction (không I/O mạng trong transaction).
  let expenseSplits:
    | Array<{ id: string; expense_id: string; member_id: string; amount: number }>
    | null = null;
  if (item.entity_type === 'expense' && serverData) {
    const { data, error } = await supabase
      .from('expense_splits')
      .select('id, expense_id, member_id, amount')
      .eq('expense_id', item.entity_id);
    if (error) throw error;
    expenseSplits = data ?? [];
  }

  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    if (serverData) {
      const rawCols = Object.keys(serverData);
      const cols = rawCols.filter((c) => allowed.has(c));
      const skipped = rawCols.filter((c) => !allowed.has(c));
      if (skipped.length > 0) {
        console.warn(
          `[keepTheirs] Bỏ qua cột không trong whitelist của ${table}:`,
          skipped
        );
      }
      if (cols.length === 0 || !cols.includes('id')) {
        throw new Error(
          `Không thể áp dụng dữ liệu server: thiếu cột "id" sau khi lọc whitelist`
        );
      }

      const placeholders = cols.map(() => '?').join(', ');
      const updateAssignments = cols
        .filter((c) => c !== 'id')
        .map((c) => `${c} = excluded.${c}`)
        .join(', ');
      const values = cols.map((c) => {
        const v = serverData[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'object') return JSON.stringify(v);
        return v as string | number;
      });
      const sql = updateAssignments
        ? `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${updateAssignments}`
        : `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
      await db.runAsync(sql, values as never[]);
    }
    // Replace splits local bằng server (delete-then-insert) khi resolve expense conflict.
    if (expenseSplits) {
      await db.runAsync(`DELETE FROM expense_splits WHERE expense_id = ?`, [item.entity_id]);
      for (const s of expenseSplits) {
        await db.runAsync(
          `INSERT INTO expense_splits (id, expense_id, member_id, amount) VALUES (?, ?, ?, ?)`,
          [s.id, s.expense_id, s.member_id, s.amount]
        );
      }
    }
    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [item.id]);
  });
}

/**
 * "Xem sau" — không làm gì, item stay in conflict status.
 * UI chỉ đóng modal — user xử lý từ Conflict Inbox.
 */
export async function defer(_item: SyncQueueRow): Promise<void> {
  // No-op. Item stays in conflict status, visible in Conflict Inbox.
}
