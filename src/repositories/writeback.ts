// Write-back helper: mirror server's bumped columns về SQLite local sau RPC
// P3/P5 success.
//
// Lý do: trigger `bump_version_and_updated_at` (và analog `bump_version_users`)
// bump `version + updated_at` trên MỌI UPDATE bảng có offline-first. Nếu client
// không write-back, base_version/base_updated_at lần update kế sẽ stale → server
// throw `version_conflict` / `lww_stale` (P0410).
//
// Đã có 3 bug đợt 2026-05-28 do bỏ sót pattern này (xem memory
// `feedback_rpc_writeback_all_bumped_cols`). Helper này đảm bảo write-back đồng
// nhất.

import { normalizeForSqlite } from './_shared';
import { getDatabase } from '../db/database';

/**
 * Server row trả về sau RPC — luôn có `updated_at`, có thể có `version` tuỳ
 * RPC. KHÔNG dùng index signature [k: string]: unknown vì sẽ conflict với
 * well-typed shapes (ExpensePresetRow…) ở call site.
 */
export interface MirrorableServerRow {
  version?: number;
  updated_at: string;
}

/**
 * Write-back các cột server-bumped (`version` + `updated_at`) + optional
 * `extraCols` (vd `status`, `closed_at`, `deleted_at`, các cột nghiệp vụ) về
 * SQLite local mirror.
 *
 * Gọi sau khi RPC Flow A success (server đã UPDATE → trigger đã bump):
 * ```
 * const { data, error } = await supabase.rpc('xxx', {...});
 * if (error) throw error;
 * const row = extractServerRow(data);
 * if (row) await mirrorServerRow('trips', tripId, row, { status: 'closed' });
 * ```
 */
export async function mirrorServerRow(
  table: string,
  entityId: string,
  serverRow: MirrorableServerRow,
  extraCols: Record<string, unknown> = {}
): Promise<void> {
  const db = getDatabase();
  const cols: Record<string, unknown> = { ...extraCols, updated_at: serverRow.updated_at };
  if (typeof serverRow.version === 'number') cols.version = serverRow.version;

  const setClauses = Object.keys(cols).map((c) => `${c} = ?`).join(', ');
  const values = Object.keys(cols).map((c) => normalizeForSqlite(cols[c]));
  await db.runAsync(
    `UPDATE ${table} SET ${setClauses} WHERE id = ?`,
    [...values, entityId] as never[]
  );
}

/**
 * Extract row đầu tiên từ RPC return có shape `RETURNS TABLE(...)`.
 * Supabase-js trả về `data: T[] | null`. Helper này gom null-check + type cast.
 */
export function extractServerRow<T extends MirrorableServerRow>(data: unknown): T | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0] as T;
}
