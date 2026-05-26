/**
 * Subscribe Supabase realtime cho bảng `notifications` của user hiện tại.
 *
 * Tác dụng: khi 1 row notification được tạo (hoặc dedup-update) ở server,
 * client lập tức:
 *   - prepend / replace vào `notification.store.items` (badge + list cập nhật)
 *   - show toast in-app
 *   - dispatch derived refetch cho các store liên quan
 *     (xem `src/utils/notificationRouter.ts`)
 *
 * Phải mount trong subtree có `HeroUINativeProvider` (cho `useToast`) và sau
 * `AuthGate` (đảm bảo `session` đã có khi hook chạy). Hook tự early-return khi
 * chưa đăng nhập / chưa resolve được auth user id; tự cleanup channel khi
 * logout hoặc unmount.
 *
 * Foreground only — Supabase JS auto-reconnect khi mất kết nối ngắn, nhưng có
 * thể miss events khi app sleep lâu → vẫn giữ `refreshUnreadCount()` on focus
 * như fallback ở screens (đã có sẵn).
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { supabase } from '../config/supabase';
import { notificationRepo } from '../repositories';
import { getAuthUserId } from '../services/auth.helper';
import type { Notification } from '../services/notification.service';
import { useAuthStore } from '../stores/auth.store';
import { useNotificationStore } from '../stores/notification.store';
import * as syncState from '../sync/syncState';
import type { NotificationType } from '../utils/notificationFormat';
import { routeNotification } from '../utils/notificationRouter';
import { showInfo, showSuccess, showWarning } from '../utils/toast';

function showToastForType(type: string, label: string, description?: string) {
  const t = type as NotificationType;
  const opts = description ? { description } : undefined;
  switch (t) {
    case 'member.join_approved':
      showSuccess(label, opts);
      return;
    case 'member.join_rejected':
    case 'expense.deleted':
    case 'trip.deleted':
      showWarning(label, opts);
      return;
    default:
      // Info circle (blue) — better signal for an unsolicited event the user
      // should notice, without implying error/warning.
      showInfo(label, opts);
  }
}

export function useNotificationRealtime(): void {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      try {
        const appUserId = await getAuthUserId();
        if (cancelled || !appUserId) return;

        const persistToLocal = async (row: Notification) => {
          // Sync xuống SQLite mirror để offline-first restore. Fire-and-forget
          // — KHÔNG block UI nếu DB ghi fail.
          try {
            await notificationRepo.upsertFromServer(
              row as unknown as Parameters<
                typeof notificationRepo.upsertFromServer
              >[0]
            );
            // Advance watermark theo updated_at để pull tiếp theo không re-fetch row này.
            const ts =
              (row as unknown as { updated_at?: string }).updated_at ??
              row.created_at;
            if (ts) await syncState.setWatermark('notifications', ts);
          } catch (e) {
            if (__DEV__) console.warn('[NotifRT] persist local failed:', e);
          }
        };

        const handleInsert = (row: Notification) => {
          void persistToLocal(row);

          const store = useNotificationStore.getState();
          // Skip if already present (e.g., a fetchNotifications race put it in
          // before realtime delivered).
          if (store.items.some((x) => x.id === row.id)) return;
          store.prepend(row);

          // In-app toast — title đã render VN sẵn ở server.
          try {
            showToastForType(row.type, row.title, row.body ?? undefined);
          } catch (e) {
            if (__DEV__) console.warn('[NotifRT] toast failed:', e);
          }

          routeNotification(row);
        };

        const handleUpdate = (row: Notification) => {
          void persistToLocal(row);

          // Dedup UPDATE: row sẵn có được mutate (push target_ids, tăng count,
          // refresh created_at, đổi title). KHÔNG show toast (tránh spam) và
          // KHÔNG tăng unread (vẫn unread sẵn). `applyUpdate` sẽ prepend nếu
          // chưa có trong cache.
          useNotificationStore.getState().applyUpdate(row);
        };

        channel = supabase
          .channel(`notif:${appUserId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${appUserId}`,
            },
            (payload) => handleInsert(payload.new as Notification),
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${appUserId}`,
            },
            (payload) => handleUpdate(payload.new as Notification),
          )
          .subscribe((status, err) => {
            if (__DEV__ && status !== 'SUBSCRIBED' && status !== 'CLOSED') {
              console.warn('[NotifRT] channel status:', status, err);
            }
          });
      } catch (e) {
        if (__DEV__) console.warn('[NotifRT] init failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel).catch(() => {
          // ignore — channel might already be torn down
        });
      }
    };
  }, [session]);
}
