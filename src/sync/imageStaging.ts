// Stage compressed expense image vào local FileSystem cho deferred upload.
// Gọi từ ExpenseFormScreen khi offline (hoặc khi muốn UX optimistic image).
//
// Local path: <documentDirectory>/pending_images/<expense_id>.jpg
// Khi sync engine chạy imageUploadWorker → đọc path này, upload R2, xóa file.

// Dùng legacy FileSystem API cho documentDirectory + copyAsync — SDK 55 new
// `File` class chưa expose persistent dir constants.
import * as FileSystem from 'expo-file-system/legacy';

import { getDatabase } from '../db/database';
import * as pendingImageUploads from './pendingImageUploads';
import { MAX_QUEUE_RETRIES } from './types';

const STAGING_DIR = `${FileSystem.documentDirectory}pending_images/`;

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(STAGING_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(STAGING_DIR, { intermediates: true });
    }
  } catch (e) {
    if (__DEV__) console.warn('[imgStaging] ensureDir failed', e);
  }
}

/**
 * Move/copy compressed image vào staging dir + register pending upload row.
 * Trả về local file:// URI để UI hiển thị ngay.
 */
export async function stageExpenseImage(
  expenseId: string,
  sourceUri: string
): Promise<string> {
  await ensureDir();
  const dest = `${STAGING_DIR}${expenseId}.jpg`;
  // Use copy thay vì move để giữ original (vd nếu user share/save sau)
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  await pendingImageUploads.add(expenseId, dest);
  return dest;
}

/**
 * Cleanup nếu user hủy form trước khi submit. KHÔNG xóa pending upload row nếu
 * expense đã được submit (sync engine sẽ tự cleanup sau upload thành công).
 */
export async function cancelStaged(expenseId: string): Promise<void> {
  const path = `${STAGING_DIR}${expenseId}.jpg`;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore
  }
  await pendingImageUploads.remove(expenseId);
}

interface OrphanRow {
  expense_id: string;
}

/**
 * Quét pending_image_uploads tìm rows mồ côi → cancelStaged.
 *
 * 2 tiêu chí orphan:
 *   1. Expense local không tồn tại — addExpense ném exception sau khi stage,
 *      hoặc process kill giữa stage và write SQLite.
 *   2. retry_count >= MAX_QUEUE_RETRIES — worker filter bỏ vĩnh viễn (stuck).
 *
 * Idempotent, an toàn chạy nhiều lần. Không đụng row đang active (expense
 * local tồn tại + retry chưa cạn).
 */
export async function sweepStagedOrphans(): Promise<number> {
  const db = getDatabase();
  const orphans = await db.getAllAsync<OrphanRow>(
    `SELECT p.expense_id
       FROM pending_image_uploads p
       LEFT JOIN expenses e ON e.id = p.expense_id
      WHERE e.id IS NULL
         OR p.retry_count >= ?`,
    [MAX_QUEUE_RETRIES]
  );
  let cleaned = 0;
  for (const row of orphans) {
    try {
      await cancelStaged(row.expense_id);
      cleaned++;
    } catch (e) {
      if (__DEV__) console.warn('[imgStaging] sweep failed for', row.expense_id, e);
    }
  }
  if (__DEV__ && cleaned > 0) {
    console.warn(`[imgStaging] swept ${cleaned} orphan(s)`);
  }
  return cleaned;
}
