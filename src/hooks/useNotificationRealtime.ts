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
import { useToast } from 'heroui-native';
import { useEffect, useRef } from 'react';

import { supabase } from '../config/supabase';
import { getAuthUserId } from '../services/auth.helper';
import type { Notification } from '../services/notification.service';
import { useAuthStore } from '../stores/auth.store';
import { useNotificationStore } from '../stores/notification.store';
import type { NotificationType } from '../utils/notificationFormat';
import { routeNotification } from '../utils/notificationRouter';

// heroui-native ToastVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger'
type ToastVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger';

function variantForType(type: string): ToastVariant {
  const t = type as NotificationType;
  switch (t) {
    case 'member.join_approved':
      return 'success';
    case 'member.join_rejected':
    case 'expense.deleted':
    case 'trip.deleted':
      return 'warning';
    default:
      // 'accent' = colored highlight (vs 'default' grey) — better signal for an
      // unsolicited push event that the user should notice.
      return 'accent';
  }
}

export function useNotificationRealtime(): void {
  const session = useAuthStore((s) => s.session);
  const { toast } = useToast();

  // Toast object can change identity on rerenders; keep ref fresh so the
  // subscription handler (created once per session) always uses the latest.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      try {
        const appUserId = await getAuthUserId();
        if (cancelled || !appUserId) return;

        const handleInsert = (row: Notification) => {
          const store = useNotificationStore.getState();
          // Skip if already present (e.g., a fetchNotifications race put it in
          // before realtime delivered).
          if (store.items.some((x) => x.id === row.id)) return;
          store.prepend(row);

          // In-app toast — title đã render VN sẵn ở server.
          try {
            toastRef.current.show({
              variant: variantForType(row.type),
              label: row.title,
              description: row.body ?? undefined,
            });
          } catch (e) {
            if (__DEV__) console.warn('[NotifRT] toast failed:', e);
          }

          routeNotification(row);
        };

        const handleUpdate = (row: Notification) => {
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
