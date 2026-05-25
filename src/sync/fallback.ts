// Network fallback helper: cho service.fetchX() rơi xuống local mirror khi
// network error. Pattern transparent — store/UI không cần biết.
//
// Usage:
//   return tryServerThenLocal(
//     () => supabase.from('trips').select('*').eq('group_id', groupId),
//     () => tripRepo.listByGroup(groupId),
//   );
//
// Quy ước:
//   - serverFn ném khi fetch fail → catch + fallback
//   - localFn luôn return (kể cả empty array)
//   - Lỗi non-network (vd permission denied 42501) KHÔNG fallback —
//     re-throw để UI hiện error rõ ràng (không che dấu lỗi auth/perm).

import { useAppStore } from '../stores/app.store';
import { isNetworkError } from '../utils/network';

/**
 * Online: gọi serverFn. Network error → fallback localFn.
 * Offline: gọi localFn ngay.
 */
export async function tryServerThenLocal<T>(
  serverFn: () => Promise<T>,
  localFn: () => Promise<T>
): Promise<T> {
  const isOnline = useAppStore.getState().isOnline;
  if (!isOnline) {
    return localFn();
  }
  try {
    return await serverFn();
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) {
        console.warn('[fallback] server failed, using local:', err);
      }
      return localFn();
    }
    throw err;
  }
}
