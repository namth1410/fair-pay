// GroupAvatarUploadWorker — drain pending_group_avatar_uploads.
//
// Flow per row (op='upload'):
//   1. Check group còn tồn tại local. Nếu không → mark dead.
//   2. Check file local_path. Nếu mất → mark dead.
//   3. Re-check size (size_bytes của row có thể stale; lấy size mới).
//   4. Presign (Edge Function group-avatar-presign)
//   5. PUT R2
//   6. Commit (Edge Function group-avatar-commit) → return public URL
//   7. UPDATE groups.avatar_url local
//   8. Xóa file local + remove pending row
//
// Flow per row (op='remove'):
//   1. Check group còn tồn tại local. Nếu không → mark dead.
//   2. removeGroupAvatar Edge Function
//   3. UPDATE groups.avatar_url = NULL local
//   4. Remove pending row
//
// Dead path = silent: delete local file + remove row, không notify user.
// UI tự revert về server URL (overlay không còn).
//
// Concurrency: chỉ 1 worker run trong cùng moment.

import * as FileSystem from 'expo-file-system/legacy';

import { getDatabase } from '../db/database';
import {
  commitGroupAvatar,
  removeGroupAvatar as removeGroupAvatarRemote,
  requestGroupAvatarUploadUrl,
} from '../services/group.service';
import { useAppStore } from '../stores/app.store';
import { isNetworkError } from '../utils/network';
import * as pendingGroupAvatarUploads from './pendingGroupAvatarUploads';
import { MAX_QUEUE_RETRIES } from './types';

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
    if (__DEV__) console.warn('[groupAvatarUpload] deleteFile failed', e);
  }
}

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
 * Mark dead: dọn local file (nếu có) + remove row. Không notify user.
 */
async function markDead(
  groupId: string,
  localPath: string | null
): Promise<void> {
  if (localPath) await deleteFile(localPath);
  await pendingGroupAvatarUploads.remove(groupId);
}

export async function uploadPendingGroupAvatars(
  maxItems = 5
): Promise<UploadResult> {
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
    const items = await pendingGroupAvatarUploads.listPending(maxItems);
    const db = getDatabase();

    for (const row of items) {
      try {
        // Check group tồn tại + chưa bị soft-delete.
        const group = await db.getFirstAsync<{ id: string }>(
          `SELECT id FROM groups WHERE id = ? AND deleted_at IS NULL`,
          [row.group_id]
        );
        if (!group) {
          await markDead(row.group_id, row.local_path);
          dead++;
          continue;
        }

        if (row.op === 'remove') {
          await removeGroupAvatarRemote(row.group_id);
          await db.runAsync(
            `UPDATE groups SET avatar_url = NULL, updated_at = ? WHERE id = ?`,
            [new Date().toISOString(), row.group_id]
          );
          await pendingGroupAvatarUploads.remove(row.group_id);
          succeeded++;
          continue;
        }

        // op === 'upload'
        if (!row.local_path) {
          await markDead(row.group_id, null);
          dead++;
          continue;
        }
        if (!(await fileExists(row.local_path))) {
          await markDead(row.group_id, row.local_path);
          dead++;
          continue;
        }
        const size = await getFileSize(row.local_path);
        if (!size || size <= 0) {
          await markDead(row.group_id, row.local_path);
          dead++;
          continue;
        }

        const presign = await requestGroupAvatarUploadUrl(row.group_id, size);

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

        const commit = await commitGroupAvatar(row.group_id, presign.fileKey);

        await db.runAsync(
          `UPDATE groups SET avatar_url = ?, updated_at = ? WHERE id = ?`,
          [commit.avatar_url, new Date().toISOString(), row.group_id]
        );
        await deleteFile(row.local_path);
        await pendingGroupAvatarUploads.remove(row.group_id);
        succeeded++;
      } catch (err) {
        const msg =
          (err as { message?: string })?.message ?? String(err) ?? 'unknown';
        // Bump retry. Nếu sau bump retry_count vượt MAX → cleanup ngay (silent dead).
        await pendingGroupAvatarUploads.markRetry(row.group_id, msg);
        const after = await pendingGroupAvatarUploads.getForGroup(row.group_id);
        if (after && after.retry_count >= MAX_QUEUE_RETRIES) {
          // Lý do isNetworkError vẫn dead: 5 retries chạy qua nhiều session, đủ chứng cứ
          // user thực sự kẹt. Theo quyết định nghiệp vụ: silent drop.
          await markDead(row.group_id, after.local_path);
          dead++;
          if (__DEV__) {
            console.warn(
              `[groupAvatarUpload] dead ${row.group_id}: ${msg} (network=${isNetworkError(err)})`
            );
          }
        } else {
          failed++;
          if (__DEV__) {
            console.warn(`[groupAvatarUpload] retry ${row.group_id}: ${msg}`);
          }
        }
      }
    }
  } finally {
    isRunning = false;
  }

  return { attempted: succeeded + failed + dead, succeeded, failed, dead };
}
