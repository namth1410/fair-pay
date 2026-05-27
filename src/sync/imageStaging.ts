// Stage compressed expense image vào local FileSystem cho deferred upload.
// Gọi từ ExpenseFormScreen khi offline (hoặc khi muốn UX optimistic image).
//
// Local path: <documentDirectory>/pending_images/<expense_id>.jpg
// Khi sync engine chạy imageUploadWorker → đọc path này, upload R2, xóa file.

// Dùng legacy FileSystem API cho documentDirectory + copyAsync — SDK 55 new
// `File` class chưa expose persistent dir constants.
import * as FileSystem from 'expo-file-system/legacy';

import { getDatabase } from '../db/database';
import * as pendingGroupAvatarUploads from './pendingGroupAvatarUploads';
import * as pendingImageUploads from './pendingImageUploads';
import { MAX_QUEUE_RETRIES } from './types';

const STAGING_DIR = `${FileSystem.documentDirectory}pending_images/`;
const GROUP_AVATAR_STAGING_DIR = `${FileSystem.documentDirectory}pending_group_avatars/`;

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

async function ensureGroupAvatarDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(GROUP_AVATAR_STAGING_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(GROUP_AVATAR_STAGING_DIR, {
        intermediates: true,
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('[imgStaging] ensureGroupAvatarDir failed', e);
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
/**
 * Stage group avatar: copy file vào staging dir + register pending upload row.
 * Nếu group đã có pending upload trước đó, file cũ bị overwrite (cùng filename
 * <group_id>.jpg) — không cần explicit delete. addUpload upsert PK = group_id.
 * Trả về local file:// URI để UI hiển thị ngay (optimistic).
 */
export async function stageGroupAvatar(
  groupId: string,
  sourceUri: string,
  sizeBytes: number
): Promise<string> {
  await ensureGroupAvatarDir();
  const dest = `${GROUP_AVATAR_STAGING_DIR}${groupId}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  await pendingGroupAvatarUploads.addUpload(groupId, dest, sizeBytes);
  return dest;
}

/**
 * Hủy staged avatar: xóa file + remove pending row. Idempotent.
 * Dùng cho cancel pending khi user bấm "Xóa ảnh" (revert) hoặc worker mark dead.
 */
export async function cancelStagedGroupAvatar(groupId: string): Promise<void> {
  const path = `${GROUP_AVATAR_STAGING_DIR}${groupId}.jpg`;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore
  }
  await pendingGroupAvatarUploads.remove(groupId);
}

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
