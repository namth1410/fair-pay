// Persistent log cho sync errors bị `safe()` của pullAll nuốt im, hoặc lỗi
// non-fatal khác trong sync pipeline. Trước đây chỉ `console.warn` → mất khi
// reload. Giờ insert vào `_sync_errors` (SQLite) để adb pull về xem được.
//
// Caller pattern: gọi `log()` trong catch, KHÔNG await để không block flow.
// `log` tự nuốt error nội bộ — KHÔNG được throw ra ngoài làm crash sync.

import { getDatabase } from '../db/database';

export interface SyncErrorRow {
  id: number;
  source: string;
  error_code: string | null;
  error_message: string;
  context: string | null;
  created_at: string;
}

export interface LogInput {
  /** Vd `pull:groups`, `push:create_group`, `sync_engine:timeout`. */
  source: string;
  code?: string | null;
  message: string;
  /** Object/array → JSON.stringify trước khi insert. */
  context?: unknown;
}

const MAX_ROWS = 500;

/**
 * Persist 1 error vào DB. Tự dọn nếu vượt MAX_ROWS (giữ recent N).
 * Silent: catch tất cả lỗi nội bộ — log infrastructure KHÔNG được crash caller.
 */
export async function log(input: LogInput): Promise<void> {
  try {
    const db = getDatabase();
    await db.runAsync(
      `INSERT INTO _sync_errors (source, error_code, error_message, context, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.source,
        input.code ?? null,
        input.message.slice(0, 2000),
        input.context ? safeStringify(input.context).slice(0, 4000) : null,
        new Date().toISOString(),
      ]
    );
    // Trim: giữ N hàng mới nhất, xóa phần dư.
    await db.runAsync(
      `DELETE FROM _sync_errors
        WHERE id NOT IN (
          SELECT id FROM _sync_errors ORDER BY id DESC LIMIT ?
        )`,
      [MAX_ROWS]
    );
  } catch {
    // Silent: error logging must not crash callers
  }
}

export async function listRecent(limit = 50): Promise<SyncErrorRow[]> {
  const db = getDatabase();
  return db.getAllAsync<SyncErrorRow>(
    `SELECT * FROM _sync_errors ORDER BY id DESC LIMIT ?`,
    [limit]
  );
}

export async function listBySource(
  sourcePrefix: string,
  limit = 50
): Promise<SyncErrorRow[]> {
  const db = getDatabase();
  return db.getAllAsync<SyncErrorRow>(
    `SELECT * FROM _sync_errors WHERE source LIKE ?
      ORDER BY id DESC LIMIT ?`,
    [`${sourcePrefix}%`, limit]
  );
}

export async function clear(): Promise<void> {
  const db = getDatabase();
  await db.runAsync(`DELETE FROM _sync_errors`);
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
