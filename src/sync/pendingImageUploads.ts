// API wrapper cho bảng `pending_image_uploads` — defer image upload khi offline.
//
// Flow:
//   1. User chụp/chọn ảnh khi tạo expense → save vào FileSystem
//   2. expenseRepo.create() ghi expense local với image_url = file://...local_path
//      + enqueue() create_expense + pendingImageUploads.add()
//   3. SyncEngine.uploadPendingImages() chạy sau khi expense đã sync thành công:
//      upload R2 → update expense.image_url với R2 URL → xóa pending row + local file

import { getDatabase } from '../db/database';
import { MAX_QUEUE_RETRIES } from './types';
import type { PendingImageUploadRow } from '../types/database.types';

function now(): string {
  return new Date().toISOString();
}

export async function add(
  expenseId: string,
  localPath: string
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO pending_image_uploads (expense_id, local_path, retry_count, created_at)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(expense_id) DO UPDATE
       SET local_path = excluded.local_path,
           retry_count = 0,
           last_error = NULL,
           next_retry_at = NULL`,
    [expenseId, localPath, now()]
  );
}

export async function listPending(limit = 10): Promise<PendingImageUploadRow[]> {
  const db = getDatabase();
  const ts = now();
  return db.getAllAsync<PendingImageUploadRow>(
    `SELECT * FROM pending_image_uploads
      WHERE (next_retry_at IS NULL OR next_retry_at <= ?)
        AND retry_count < ?
      ORDER BY created_at ASC
      LIMIT ?`,
    [ts, MAX_QUEUE_RETRIES, limit]
  );
}

export async function markRetry(expenseId: string, error: string): Promise<void> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ retry_count: number }>(
    `SELECT retry_count FROM pending_image_uploads WHERE expense_id = ?`,
    [expenseId]
  );
  if (!row) return;
  const next = row.retry_count + 1;
  const backoffSeconds = Math.min(60 * Math.pow(2, next), 3600);
  const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();
  await db.runAsync(
    `UPDATE pending_image_uploads
        SET retry_count = ?, last_error = ?, next_retry_at = ?
      WHERE expense_id = ?`,
    [next, error, nextRetryAt, expenseId]
  );
}

export async function remove(expenseId: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `DELETE FROM pending_image_uploads WHERE expense_id = ?`,
    [expenseId]
  );
}
