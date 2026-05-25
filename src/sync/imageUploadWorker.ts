// ImageUploadWorker — drain pending_image_uploads table sau khi expense đã
// được tạo (offline hoặc online).
//
// Flow per row:
//   1. Đọc local_path. Nếu file không tồn tại → mark dead, xóa row.
//   2. Compress + presign (Edge Function expense-image-presign)
//   3. PUT lên R2
//   4. commitExpenseImage (Edge Function expense-image-commit) → return public URL
//   5. UPDATE expense.image_url qua direct UPDATE
//   6. Xóa row pending_image_uploads + local file
//
// Concurrency: chỉ 1 worker run trong cùng moment.

// Legacy API cho uploadAsync + getInfoAsync (SDK 55 new File class chưa cover upload).
import * as FileSystem from 'expo-file-system/legacy';

import { useAppStore } from '../stores/app.store';
import {
  commitExpenseImage,
  requestExpenseImageUploadUrl,
} from '../services/expenseImage.service';
import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import * as pendingImageUploads from './pendingImageUploads';

let isRunning = false;

interface UploadResult {
  attempted: number;
  succeeded: number;
  failed: number;
  dead: number;
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

async function deleteFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    if (__DEV__) console.warn('[imgUpload] deleteFile failed', e);
  }
}

/**
 * Get file size in bytes. expo-file-system legacy: FileInfo.size available when exists.
 */
async function getFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return info.size ?? null;
  } catch {
    return null;
  }
}

/**
 * Upload pending images. Mỗi row có thể fail riêng — không block các row khác.
 * Caller (syncEngine) gọi sau pushPending để image upload chỉ chạy khi expense
 * đã tạo thành công trên server.
 */
export async function uploadPending(maxItems = 5): Promise<UploadResult> {
  if (isRunning) {
    return { attempted: 0, succeeded: 0, failed: 0, dead: 0 };
  }
  if (!useAppStore.getState().isOnline) {
    return { attempted: 0, succeeded: 0, failed: 0, dead: 0 };
  }
  isRunning = true;

  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  try {
    const items = await pendingImageUploads.listPending(maxItems);
    for (const row of items) {
      try {
        // 1. Check expense thực sự đã tạo trên server (qua client_request_id idempotency).
        //    Nếu expense vẫn còn trong sync_queue chưa apply → skip lần này.
        const db = getDatabase();
        const expense = await db.getFirstAsync<{
          id: string;
          trip_id: string;
          image_url: string | null;
        }>(
          `SELECT id, trip_id, image_url FROM expenses WHERE id = ?`,
          [row.expense_id]
        );
        if (!expense) {
          // Expense bị xóa local trong khi pending → cleanup
          await deleteFile(row.local_path);
          await pendingImageUploads.remove(row.expense_id);
          dead++;
          continue;
        }

        // 2. Check file vẫn tồn tại
        if (!(await fileExists(row.local_path))) {
          await pendingImageUploads.remove(row.expense_id);
          dead++;
          continue;
        }

        const size = await getFileSize(row.local_path);
        if (!size || size <= 0) {
          await deleteFile(row.local_path);
          await pendingImageUploads.remove(row.expense_id);
          dead++;
          continue;
        }

        // 3. Presign
        const presign = await requestExpenseImageUploadUrl(
          expense.id,
          expense.trip_id,
          size
        );

        // 4. PUT to R2
        // expo-file-system Network uploadAsync handle multipart/raw upload.
        const uploadResult = await FileSystem.uploadAsync(
          presign.uploadUrl,
          row.local_path,
          {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': 'image/jpeg' },
          }
        );
        if (uploadResult.status < 200 || uploadResult.status >= 300) {
          throw new Error(`R2 PUT failed status=${uploadResult.status}`);
        }

        // 5. Commit (Edge Function verifies + updates expense.image_url server-side)
        const commit = await commitExpenseImage(expense.id, presign.fileKey);

        // 6. Cập nhật local mirror với R2 URL + cleanup
        await db.runAsync(
          `UPDATE expenses SET image_url = ?, updated_at = ? WHERE id = ?`,
          [commit.image_url, new Date().toISOString(), expense.id]
        );
        await deleteFile(row.local_path);
        await pendingImageUploads.remove(row.expense_id);
        succeeded++;
      } catch (err) {
        const msg =
          (err as { message?: string })?.message ?? String(err) ?? 'unknown';
        await pendingImageUploads.markRetry(row.expense_id, msg);
        if (__DEV__) {
          console.warn(
            `[imgUpload] retry ${row.expense_id}: ${msg}`
          );
        }
        failed++;
      }
    }
  } finally {
    isRunning = false;
  }

  return { attempted: succeeded + failed + dead, succeeded, failed, dead };
}

/**
 * Update expense image_url server-side trực tiếp (không qua Edge commit) — dùng cho
 * trường hợp test/admin. Bình thường commit() ở trên đã update qua Edge Function.
 */
export async function _forceSyncImageUrl(
  expenseId: string,
  imageUrl: string | null
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ image_url: imageUrl })
    .eq('id', expenseId);
  if (error) throw error;
}
