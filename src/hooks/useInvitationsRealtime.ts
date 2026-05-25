/**
 * Subscribe Supabase realtime cho bảng `group_invitations`.
 *
 * 2 channel song song để cover đầy đủ cross-device sync:
 *   1. Invitee channel (always-on khi có session): filter `invited_user_id=eq.${appUserId}`
 *      → khi admin gửi/thu hồi lời mời, banner ở Home + dialog confirm cập nhật ngay
 *      không cần polling.
 *   2. Admin channel (dynamic theo `currentGroupId`): filter `group_id=eq.${currentGroupId}`
 *      → khi user accept/decline, section "Lời mời đang chờ" ở MembersTab cập nhật ngay.
 *      Chỉ subscribe khi user đang xem màn group đó (tiết kiệm channel).
 *
 * Toast hiển thị KHÔNG từ hook này — `notificationRouter` đã handle toast qua notification
 * channel để tránh double-toast. Hook này chỉ patch store state.
 *
 * Phải mount sau `AuthGate` (đảm bảo session có khi hook chạy). Tự cleanup khi logout/unmount.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import { groupInvitationRepo } from '../repositories';
import { getAuthUserId } from '../services/auth.helper';
import type { GroupInvitation } from '../services/group.service';
import { useAuthStore } from '../stores/auth.store';
import { useGroupStore } from '../stores/group.store';
import * as syncState from '../sync/syncState';
import type { GroupInvitationRow } from '../types/database.types';

/**
 * Persist realtime payload xuống SQLite mirror. INSERT/UPDATE → upsert,
 * DELETE → physical delete row (Supabase realtime DELETE thường có `old` row).
 * Errors swallow để không block UI.
 */
async function persistInvitationToLocal(
  row: GroupInvitation,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
): Promise<void> {
  try {
    if (eventType === 'DELETE') {
      const db = getDatabase();
      await db.runAsync(`DELETE FROM group_invitations WHERE id = ?`, [row.id]);
      return;
    }
    await groupInvitationRepo.upsertFromServer(row as unknown as GroupInvitationRow);
    const ts =
      (row as unknown as { updated_at?: string }).updated_at ??
      row.created_at;
    if (ts) await syncState.setWatermark('group_invitations', ts);
  } catch (e) {
    if (__DEV__) console.warn('[InvitesRT] persist local failed:', e);
  }
}

export function useInvitationsRealtime(): void {
  const session = useAuthStore((s) => s.session);
  const currentGroupId = useGroupStore((s) => s.currentGroupId);

  // ── Invitee channel (per-user, always-on) ─────────────────────────────────
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let appUserId: string | null = null;

    (async () => {
      try {
        appUserId = await getAuthUserId();
        if (cancelled || !appUserId) return;

        channel = supabase
          .channel(`invites:user:${appUserId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'group_invitations',
              filter: `invited_user_id=eq.${appUserId}`,
            },
            (payload) => {
              const row = (payload.new ?? payload.old) as GroupInvitation;
              if (!row) return;
              const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              void persistInvitationToLocal(row, evt);
              useGroupStore
                .getState()
                .applyInvitationRealtime(row, evt, appUserId);
            }
          )
          .subscribe((status, err) => {
            if (__DEV__ && status !== 'SUBSCRIBED' && status !== 'CLOSED') {
              console.warn('[InvitesRT/user] channel status:', status, err);
            }
          });
      } catch (e) {
        if (__DEV__) console.warn('[InvitesRT/user] init failed:', e);
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

  // ── Admin channel (per-group, dynamic theo currentGroupId) ────────────────
  useEffect(() => {
    if (!session || !currentGroupId) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let appUserId: string | null = null;

    (async () => {
      try {
        appUserId = await getAuthUserId();
        if (cancelled || !appUserId) return;

        channel = supabase
          .channel(`invites:group:${currentGroupId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'group_invitations',
              filter: `group_id=eq.${currentGroupId}`,
            },
            (payload) => {
              const row = (payload.new ?? payload.old) as GroupInvitation;
              if (!row) return;
              // RLS sẽ filter: non-admin không nhận được payload nên không cần check role.
              useGroupStore.getState().applyInvitationRealtime(
                row,
                payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
                appUserId
              );
            }
          )
          .subscribe((status, err) => {
            if (__DEV__ && status !== 'SUBSCRIBED' && status !== 'CLOSED') {
              console.warn('[InvitesRT/group] channel status:', status, err);
            }
          });
      } catch (e) {
        if (__DEV__) console.warn('[InvitesRT/group] init failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel).catch(() => {
          // ignore
        });
      }
    };
  }, [session, currentGroupId]);
}
