// writeFallback — boilerplate cho write services support offline queue.
//
// Pattern: Online → try server. Offline / network fail → run local fn (write SQLite + enqueue).
// Wrap dạng try/catch tự classify network error, fall back gracefully.

import { useAppStore } from '../stores/app.store';
import { isNetworkError } from '../utils/network';

/**
 * Online: gọi serverFn. Network fail → fallback localFn (write local + enqueue).
 * Offline: gọi localFn ngay.
 *
 * Non-network errors (perm denied, FK violation, validation) bubble up KHÔNG fallback —
 * lỗi server hợp lệ phải hiện cho user, không che dấu.
 */
export async function tryServerOrQueue<T>(
  serverFn: () => Promise<T>,
  localFn: () => Promise<T>,
  logTag?: string
): Promise<T> {
  if (!useAppStore.getState().isOnline) {
    return localFn();
  }
  try {
    return await serverFn();
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) {
        console.warn(`[${logTag ?? 'write'}] network fail, queueing offline`);
      }
      return localFn();
    }
    throw err;
  }
}
