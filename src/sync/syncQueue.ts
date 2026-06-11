// API wrapper cho bảng `sync_queue` (SQLite).
// Mọi truy cập sync_queue PHẢI qua module này — không SQL trực tiếp.
//
// Lifecycle 1 row:
//   1. enqueue() — repository ghi local mirror xong, gọi enqueue để queue mutation
//   2. PushWorker pickPending() → markInFlight() → gọi RPC → markDone/Conflict/Dead/Failed
//   3. UI có thể list theo status='conflict' (Conflict Inbox)
//   4. Done rows được dọn định kỳ (24h sau khi done)

import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '../db/database';
import type {
  SyncQueueRow,
  SyncQueueStatus,
} from '../types/database.types';
import {
  classifyError,
  ENTITY_TYPES,
  type EntityType,
  MAX_QUEUE_RETRIES,
  type OpType,
  RATE_LIMIT_BACKOFF_SECONDS,
} from './types';

function now(): string {
  return new Date().toISOString();
}

interface EnqueueInput {
  op_type: OpType;
  entity_type: EntityType;
  entity_id: string;
  client_request_id: string; // crypto.randomUUID() bên gọi
  payload: object;
}

/**
 * Đẩy 1 lệnh vào queue. Trả về row vừa insert.
 * Nếu client_request_id đã tồn tại (replay enqueue 2 lần) → no-op, trả về row cũ.
 */
export async function enqueue(input: EnqueueInput): Promise<SyncQueueRow> {
  const db = getDatabase();
  const id = globalThis.crypto.randomUUID();
  const payload = JSON.stringify(input.payload);
  const ts = now();

  // ON CONFLICT (client_request_id) DO NOTHING — idempotent enqueue
  await db.runAsync(
    `INSERT INTO sync_queue
       (id, client_request_id, op_type, entity_type, entity_id, payload,
        status, retry_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
     ON CONFLICT(client_request_id) DO NOTHING`,
    [
      id,
      input.client_request_id,
      input.op_type,
      input.entity_type,
      input.entity_id,
      payload,
      ts,
      ts,
    ]
  );

  const row = await db.getFirstAsync<SyncQueueRow>(
    'SELECT * FROM sync_queue WHERE client_request_id = ?',
    [input.client_request_id]
  );
  if (!row) {
    throw new Error('[syncQueue] enqueue failed — row not found after insert');
  }
  return row;
}

/**
 * Recover orphaned `in_flight` rows: do app crash/force-kill/reload giữa lúc
 * dispatch, row có thể stuck `in_flight` mãi (pickPending KHÔNG include
 * status='in_flight' → không bao giờ retry).
 *
 * Reset về `pending` các row có updated_at > maxAgeMs trước hiện tại.
 * Khoảng cách an toàn so với SYNC_TIMEOUT_MS (60s) — không reset row vừa
 * markInFlight cách đây <60s vì có thể RPC còn chạy bình thường.
 *
 * Trả về số row đã reset.
 */
export async function recoverStaleInFlight(maxAgeMs = 60_000): Promise<number> {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const result = await db.runAsync(
    `UPDATE sync_queue
        SET status = 'pending', updated_at = ?
      WHERE status = 'in_flight' AND updated_at < ?`,
    [now(), cutoff]
  );
  return result.changes;
}

/**
 * Lấy items pending hoặc failed-đã-đến-thời-điểm-retry, sắp xếp theo created_at ASC.
 * Push worker gọi để lấy batch xử lý.
 */
export async function pickPending(limit = 20): Promise<SyncQueueRow[]> {
  const db = getDatabase();
  const ts = now();
  return db.getAllAsync<SyncQueueRow>(
    `SELECT * FROM sync_queue
      WHERE status = 'pending'
         OR (status = 'failed' AND (next_retry_at IS NULL OR next_retry_at <= ?))
      ORDER BY created_at ASC
      LIMIT ?`,
    [ts, limit]
  );
}

export async function getPendingForEntity(
  entity_type: EntityType,
  entity_id: string
): Promise<SyncQueueRow[]> {
  const db = getDatabase();
  return db.getAllAsync<SyncQueueRow>(
    `SELECT * FROM sync_queue
      WHERE entity_type = ?
        AND entity_id = ?
        AND status IN ('pending','in_flight','failed','conflict')
      ORDER BY created_at ASC`,
    [entity_type, entity_id]
  );
}

export async function hasPendingForEntity(
  entity_type: EntityType,
  entity_id: string
): Promise<boolean> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sync_queue
      WHERE entity_type = ?
        AND entity_id = ?
        AND status IN ('pending','in_flight','failed','conflict')`,
    [entity_type, entity_id]
  );
  return (row?.c ?? 0) > 0;
}

export async function getById(id: string): Promise<SyncQueueRow | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<SyncQueueRow>(
    'SELECT * FROM sync_queue WHERE id = ?',
    [id]
  );
  return row ?? null;
}

export async function listByStatus(
  status: SyncQueueStatus,
  limit = 100
): Promise<SyncQueueRow[]> {
  const db = getDatabase();
  return db.getAllAsync<SyncQueueRow>(
    `SELECT * FROM sync_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
    [status, limit]
  );
}

export async function countConflicts(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sync_queue WHERE status = 'conflict'`
  );
  return row?.c ?? 0;
}

export async function countPending(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sync_queue
      WHERE status IN ('pending','in_flight','failed')`
  );
  return row?.c ?? 0;
}

/**
 * Còn op chưa lên server ảnh hưởng tới balance (expense/payment/trip) không?
 * Khi true → server đang behind local mirror, đọc balance từ server sẽ stale.
 * KHÔNG tính 'conflict' — chờ user resolve qua modal, không tự lành.
 */
export async function hasPendingBalanceOps(): Promise<boolean> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sync_queue
      WHERE entity_type IN (?, ?, ?)
        AND status IN ('pending','in_flight','failed')`,
    [ENTITY_TYPES.EXPENSE, ENTITY_TYPES.PAYMENT, ENTITY_TYPES.TRIP]
  );
  return (row?.c ?? 0) > 0;
}

// ─── State transitions ──────────────────────────────────────────────────────

export async function markInFlight(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE sync_queue SET status = 'in_flight', updated_at = ? WHERE id = ?`,
    [now(), id]
  );
}

/**
 * Mark done: rows giữ lại 24h cho debug rồi cleanup. UI có thể đọc done
 * để cập nhật local mirror với server-confirmed data.
 */
export async function markDone(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE sync_queue SET status = 'done', last_error = NULL,
            last_error_code = NULL, next_retry_at = NULL, updated_at = ?
       WHERE id = ?`,
    [now(), id]
  );
}

/**
 * Mark conflict (server P0410). Lưu server state để UI hiện modal so sánh.
 */
export async function markConflict(
  id: string,
  errorCode: string,
  errorMessage: string,
  serverData: object | null
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE sync_queue
        SET status = 'conflict',
            last_error = ?,
            last_error_code = ?,
            conflict_server_data = ?,
            updated_at = ?
      WHERE id = ?`,
    [
      errorMessage,
      errorCode,
      serverData ? JSON.stringify(serverData) : null,
      now(),
      id,
    ]
  );
}

/**
 * Mark dead (không thể replay). UI hiện toast "bỏ thao tác offline".
 */
export async function markDead(
  id: string,
  errorCode: string | null,
  errorMessage: string
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE sync_queue
        SET status = 'dead', last_error = ?, last_error_code = ?, updated_at = ?
      WHERE id = ?`,
    [errorMessage, errorCode, now(), id]
  );
}

/**
 * Mark failed với exponential backoff. Sau MAX_QUEUE_RETRIES → chuyển sang dead.
 */
export async function markFailed(
  id: string,
  errorCode: string | null,
  errorMessage: string
): Promise<void> {
  const db = getDatabase();
  const row = await getById(id);
  if (!row) return;

  // Rate limit (P0429): retry fixed-backoff 30', KHÔNG tăng retry_count → không bao giờ
  // dead-letter vì rate limit. Batch offline hợp lệ tự lành khi cửa sổ trượt trôi qua;
  // queue của abuser chỉ retry ~1 lần/30' (vô hại). pickPending chọn lại khi next_retry_at
  // <= now. Nếu op thật sự hỏng, retry sau trả errcode KHÁC → rơi vào path classify thường.
  if (errorCode === 'P0429') {
    const nextRetryAt = new Date(
      Date.now() + RATE_LIMIT_BACKOFF_SECONDS * 1000
    ).toISOString();
    await db.runAsync(
      `UPDATE sync_queue
          SET status = 'failed',
              last_error = ?,
              last_error_code = ?,
              next_retry_at = ?,
              updated_at = ?
        WHERE id = ?`,
      [errorMessage, errorCode, nextRetryAt, now(), id]
    );
    return;
  }

  const nextRetry = row.retry_count + 1;
  if (nextRetry >= MAX_QUEUE_RETRIES) {
    await markDead(id, errorCode, `Retry limit (${MAX_QUEUE_RETRIES}) reached: ${errorMessage}`);
    return;
  }

  // Backoff: 30s, 2m, 8m, 32m, 2h (cap)
  const backoffSeconds = Math.min(30 * Math.pow(4, nextRetry - 1), 7200);
  const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

  await db.runAsync(
    `UPDATE sync_queue
        SET status = 'failed',
            last_error = ?,
            last_error_code = ?,
            retry_count = ?,
            next_retry_at = ?,
            updated_at = ?
      WHERE id = ?`,
    [errorMessage, errorCode, nextRetry, nextRetryAt, now(), id]
  );
}

/**
 * Handler tổng cho error từ Supabase RPC — classify + apply status transition.
 */
export async function handleError(
  id: string,
  err: unknown,
  serverData?: object | null
): Promise<SyncQueueStatus> {
  const code = (err as { code?: string })?.code ?? null;
  const message =
    (err as { message?: string })?.message ?? String(err) ?? 'Unknown error';
  const next = classifyError(code, message);

  switch (next) {
    case 'conflict':
      await markConflict(id, code ?? 'P0410', message, serverData ?? null);
      break;
    case 'done':
      // Duplicate idempotency — server đã apply
      await markDone(id);
      break;
    case 'dead':
      await markDead(id, code, message);
      break;
    case 'failed':
      await markFailed(id, code, message);
      break;
    default:
      await markFailed(id, code, message);
  }
  return next;
}

// ─── Conflict resolution ────────────────────────────────────────────────────

/**
 * User chọn "giữ của tôi" — resubmit queue item với base_version = server.version mới.
 * Caller (repo) tự build payload mới với base_version cập nhật.
 */
export async function updateConflictPayloadAndReset(
  id: string,
  newPayload: object
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE sync_queue
        SET payload = ?,
            status = 'pending',
            retry_count = 0,
            last_error = NULL,
            last_error_code = NULL,
            conflict_server_data = NULL,
            next_retry_at = NULL,
            updated_at = ?
      WHERE id = ?`,
    [JSON.stringify(newPayload), now(), id]
  );
}

/**
 * User chọn "giữ của họ" hoặc "hủy" — drop queue item. Repo cần update local
 * mirror với server data trước khi gọi hàm này.
 */
export async function discard(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

// ─── Maintenance ────────────────────────────────────────────────────────────

/**
 * Dọn `done` rows > 24h + `dead` rows > 7 ngày. Gọi sau mỗi successful sync.
 */
export async function cleanup(): Promise<void> {
  const db = getDatabase();
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  await db.runAsync(`DELETE FROM sync_queue WHERE status = 'done' AND updated_at < ?`, [oneDayAgo]);
  await db.runAsync(`DELETE FROM sync_queue WHERE status = 'dead' AND updated_at < ?`, [oneWeekAgo]);
}

/**
 * Reset toàn bộ queue về pending — dùng khi user manual "đồng bộ lại tất cả".
 * Chỉ tác động các row failed/in_flight (không touch conflict — chờ user resolve).
 */
export async function retryAllFailed(): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE sync_queue
        SET status = 'pending',
            next_retry_at = NULL,
            updated_at = ?
      WHERE status IN ('failed','in_flight')`,
    [now()]
  );
}

// ─── Internal: dùng cho unit test ───────────────────────────────────────────
export async function _truncateForTests(db?: SQLiteDatabase): Promise<void> {
  const conn = db ?? getDatabase();
  await conn.runAsync('DELETE FROM sync_queue');
}
