// Shared helpers cho repository layer.
//
// Mọi repo:
//   - Read từ SQLite local (KHÔNG hit Supabase)
//   - Provide methods stores cần (getById, listX, ...)
//   - `upsertFromServer(row)`: sync engine pull gọi để cập nhật local mirror
//
// Write methods (create/update/delete) sẽ thêm ở Phase 2 cùng với write queue.

import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '../db/database';

export { getDatabase };

/**
 * Parse JSON string an toàn — repo nhận data từ SQLite có thể NULL hoặc legacy format.
 * Trả về fallback nếu parse fail.
 */
export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Serialize JSON cho SQLite TEXT column. null → null (lưu NULL).
 */
export function jsonStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

/**
 * Boolean → INTEGER 0/1 cho SQLite (SQLite không có boolean type).
 * Postgres trả về true/false, SQLite trả về 0/1. Code app dùng truthy check
 * trên cả 2 — pattern này chỉ dùng khi UPSERT từ Postgres data vào SQLite.
 */
export function boolToInt(v: boolean | 0 | 1 | undefined | null): 0 | 1 {
  if (v === true || v === 1) return 1;
  return 0;
}

/**
 * Helper để dynamic UPSERT: tự tạo placeholders + column list.
 *
 * Gọi từ syncEngine.upsertLocal() — pull về 1 batch row → UPSERT vào SQLite.
 * KHÔNG dùng cho user-facing write (đó là job của Phase 2 repo methods).
 */
export async function upsertRow(
  table: string,
  row: Record<string, unknown>,
  primaryKey: string | string[] = 'id',
  db?: SQLiteDatabase
): Promise<void> {
  const conn = db ?? getDatabase();
  const cols = Object.keys(row);
  const vals = cols.map((c) => normalizeForSqlite(row[c]));
  const placeholders = cols.map(() => '?').join(', ');
  const pkCols = Array.isArray(primaryKey) ? primaryKey : [primaryKey];
  const pkList = pkCols.join(', ');
  const updateAssignments = cols
    .filter((c) => !pkCols.includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

  const sql = updateAssignments
    ? `INSERT INTO ${table} (${cols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT(${pkList}) DO UPDATE SET ${updateAssignments}`
    : `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;

  await conn.runAsync(sql, vals as never[]);
}

/**
 * Normalize value cho SQLite binding. expo-sqlite chỉ chấp nhận
 * primitive types — boolean, object, undefined cần convert.
 */
export function normalizeForSqlite(v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'number') return v;
  return String(v);
}

/**
 * Generic batch upsert — dùng cho sync engine pull về batch rows.
 * Xử lý từng row trong transaction để giảm fsync overhead.
 */
export async function upsertBatch(
  table: string,
  rows: Record<string, unknown>[],
  primaryKey: string | string[] = 'id'
): Promise<void> {
  if (rows.length === 0) return;
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await upsertRow(table, row, primaryKey, db);
    }
  });
}
