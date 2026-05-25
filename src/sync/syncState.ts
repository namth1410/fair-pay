// API wrapper cho bảng `_sync_state` (SQLite) — watermark cho delta pull.
//
// Mỗi bảng có 1 row tracking last_pulled_at (timestamp của row mới nhất kéo về).
// Pull cycle:
//   1. getWatermark(table) → 'X'
//   2. SELECT * FROM <table> WHERE updated_at > 'X'
//   3. Upsert rows vào SQLite local
//   4. setWatermark(table, max(rows.updated_at))

import { getDatabase } from '../db/database';

const SYNCED_TABLES = [
  'users',
  'groups',
  'group_members',
  'trips',
  'expenses',
  'expense_splits',
  'payments',
  'expense_presets',
  'pinned_trips',
  'audit_logs',
  'settlements',
  'notifications',
  'group_invitations',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export function getSyncedTables(): readonly SyncedTable[] {
  return SYNCED_TABLES;
}

function now(): string {
  return new Date().toISOString();
}

export async function getWatermark(
  table: SyncedTable
): Promise<string | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ last_pulled_at: string | null }>(
    'SELECT last_pulled_at FROM _sync_state WHERE table_name = ?',
    [table]
  );
  return row?.last_pulled_at ?? null;
}

export async function setWatermark(
  table: SyncedTable,
  pulledAt: string
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO _sync_state (table_name, last_pulled_at)
     VALUES (?, ?)
     ON CONFLICT(table_name) DO UPDATE
       SET last_pulled_at = excluded.last_pulled_at
       WHERE excluded.last_pulled_at > _sync_state.last_pulled_at
          OR _sync_state.last_pulled_at IS NULL`,
    [table, pulledAt]
  );
}

export async function setFullPullTimestamp(
  table: SyncedTable
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO _sync_state (table_name, last_full_pull_at, last_pulled_at)
     VALUES (?, ?, ?)
     ON CONFLICT(table_name) DO UPDATE
       SET last_full_pull_at = excluded.last_full_pull_at`,
    [table, now(), now()]
  );
}

/**
 * Reset toàn bộ watermark — buộc next sync làm full pull. Dùng khi schema mismatch
 * hoặc user manual "tải lại dữ liệu từ server".
 */
export async function resetAll(): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM _sync_state');
}

/**
 * Reset 1 table — vd khi detect inconsistency.
 */
export async function resetTable(table: SyncedTable): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM _sync_state WHERE table_name = ?', [table]);
}
