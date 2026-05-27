// API wrapper cho bảng `pending_group_avatar_uploads` — defer avatar nhóm khi offline.
//
// 2 op:
//   - 'upload': user pick ảnh mới offline → stage file local + add row.
//                Worker presign → PUT R2 → commit → UPDATE local + xóa file + remove row.
//   - 'remove': user xóa avatar offline → add row (không local_path).
//                Worker gọi removeGroupAvatar Edge Function → UPDATE local + remove row.

import { getDatabase } from '../db/database';
import { MAX_QUEUE_RETRIES } from './types';
import type {
  PendingGroupAvatarOp,
  PendingGroupAvatarUploadRow,
} from '../types/database.types';

function now(): string {
  return new Date().toISOString();
}

/**
 * Upsert op='upload' row. Override row cũ (kể cả op='remove') vì user intent mới
 * là "upload ảnh này". Reset retry để worker thử ngay.
 */
export async function addUpload(
  groupId: string,
  localPath: string,
  sizeBytes: number
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO pending_group_avatar_uploads
       (group_id, op, local_path, size_bytes, retry_count, created_at)
     VALUES (?, 'upload', ?, ?, 0, ?)
     ON CONFLICT(group_id) DO UPDATE
       SET op = 'upload',
           local_path = excluded.local_path,
           size_bytes = excluded.size_bytes,
           retry_count = 0,
           last_error = NULL,
           next_retry_at = NULL`,
    [groupId, localPath, sizeBytes, now()]
  );
}

/**
 * Upsert op='remove' row. Override mọi pending cũ (kể cả op='upload').
 * Caller (service) chịu trách nhiệm dọn local file trước khi gọi.
 */
export async function addRemove(groupId: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO pending_group_avatar_uploads
       (group_id, op, local_path, size_bytes, retry_count, created_at)
     VALUES (?, 'remove', NULL, NULL, 0, ?)
     ON CONFLICT(group_id) DO UPDATE
       SET op = 'remove',
           local_path = NULL,
           size_bytes = NULL,
           retry_count = 0,
           last_error = NULL,
           next_retry_at = NULL`,
    [groupId, now()]
  );
}

export async function getForGroup(
  groupId: string
): Promise<PendingGroupAvatarUploadRow | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<PendingGroupAvatarUploadRow>(
    `SELECT * FROM pending_group_avatar_uploads WHERE group_id = ?`,
    [groupId]
  );
  return row ?? null;
}

/**
 * Map of group_id → { op, local_path } để store overlay UI tốc độ cao.
 * Bỏ rows đã hết retry (worker sẽ mark dead trong lần tiếp).
 */
export async function listAll(): Promise<
  Map<string, { op: PendingGroupAvatarOp; local_path: string | null }>
> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    group_id: string;
    op: PendingGroupAvatarOp;
    local_path: string | null;
  }>(
    `SELECT group_id, op, local_path
       FROM pending_group_avatar_uploads
      WHERE retry_count < ?`,
    [MAX_QUEUE_RETRIES]
  );
  const m = new Map<
    string,
    { op: PendingGroupAvatarOp; local_path: string | null }
  >();
  for (const r of rows) {
    m.set(r.group_id, { op: r.op, local_path: r.local_path });
  }
  return m;
}

export async function listPending(
  limit = 5
): Promise<PendingGroupAvatarUploadRow[]> {
  const db = getDatabase();
  const ts = now();
  return db.getAllAsync<PendingGroupAvatarUploadRow>(
    `SELECT * FROM pending_group_avatar_uploads
      WHERE (next_retry_at IS NULL OR next_retry_at <= ?)
        AND retry_count < ?
      ORDER BY created_at ASC
      LIMIT ?`,
    [ts, MAX_QUEUE_RETRIES, limit]
  );
}

export async function markRetry(
  groupId: string,
  error: string
): Promise<void> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ retry_count: number }>(
    `SELECT retry_count FROM pending_group_avatar_uploads WHERE group_id = ?`,
    [groupId]
  );
  if (!row) return;
  const next = row.retry_count + 1;
  const backoffSeconds = Math.min(60 * Math.pow(2, next), 3600);
  const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();
  await db.runAsync(
    `UPDATE pending_group_avatar_uploads
        SET retry_count = ?, last_error = ?, next_retry_at = ?
      WHERE group_id = ?`,
    [next, error, nextRetryAt, groupId]
  );
}

export async function remove(groupId: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `DELETE FROM pending_group_avatar_uploads WHERE group_id = ?`,
    [groupId]
  );
}
