import { DISPLAY_NAME_MAX_LENGTH } from '../config/constants';
import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import { useAppStore } from '../stores/app.store';
import * as syncQueue from '../sync/syncQueue';
import { ENTITY_TYPES, OP_TYPES } from '../sync/types';
import { isNetworkError } from '../utils/network';
import { getAuthUserId } from './auth.helper';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  fcm_token: string | null;
  settings: UserSettings;
}

export interface UserSettings {
  dark_mode: 'system' | 'light' | 'dark';
  /** Expense + trip events (created/edited/deleted/closed). */
  notify_activity: boolean;
  /** Payment recorded/received. */
  notify_payment: boolean;
  /** Join request, approve/reject, role change. */
  notify_member: boolean;
  /** Smart suggestions (settle reminder…). */
  notify_smart: boolean;
  /** Master FCM push toggle — independent of in-app/realtime notifications.
   *  OFF: fcm_token bị clear, không nhận push trên tray. ON: re-register. */
  push_enabled: boolean;
  haptics_enabled: boolean;
  animations_enabled: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dark_mode: 'system',
  notify_activity: true,
  notify_payment: true,
  notify_member: true,
  notify_smart: true,
  push_enabled: true,
  haptics_enabled: true,
  animations_enabled: true,
};

/** Fetch current user profile, falling back to auth metadata if the users
 *  row is missing or RLS-blocked — so the UI never shows "Đang tải..." forever
 *  just because the DB query failed.
 */
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (error && __DEV__) {
    console.warn('[fetchCurrentUser] users table query failed:', error.message);
  }

  // Build display_name with priority: DB row → auth metadata → email local-part
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const fallbackName =
    meta.display_name ||
    meta.full_name ||
    meta.name ||
    user.email?.split('@')[0] ||
    'Bạn';

  return {
    id: data?.id || user.id,
    email: data?.email || user.email || '',
    display_name: data?.display_name || fallbackName,
    photo_url: data?.photo_url || meta.avatar_url || null,
    fcm_token: data?.fcm_token || null,
    settings: { ...DEFAULT_SETTINGS, ...(data?.settings || {}) },
  };
}

/**
 * Update display name. Offline-first: dùng RPC update_user_display_name với
 * optimistic concurrency (P3 pattern). Conflict → modal.
 */
export async function updateDisplayName(name: string): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Tên không được để trống');
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`Tên không được quá ${DISPLAY_NAME_MAX_LENGTH} ký tự`);
  }

  const db = getDatabase();
  const local = await db.getFirstAsync<{ version: number; display_name: string }>(
    `SELECT version, display_name FROM users WHERE id = ?`,
    [userId]
  );
  if (!local) throw new Error('Hồ sơ không tồn tại');
  if (trimmed === local.display_name) return;

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE users
          SET display_name = ?, version = version + 1, updated_at = ?
        WHERE id = ?`,
      [trimmed, now, userId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.UPDATE_USER_DISPLAY_NAME,
      entity_type: ENTITY_TYPES.USER,
      entity_id: userId,
      client_request_id: clientRequestId,
      payload: {
        display_name: trimmed,
        base_version: local.version,
        client_request_id: clientRequestId,
      },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }

  try {
    const { error } = await supabase.rpc('update_user_display_name', {
      p_display_name: trimmed,
      p_base_version: local.version,
      p_client_request_id: clientRequestId,
    });
    if (error) throw error;

    // Auth metadata is secondary — DB is source of truth. Best-effort.
    try {
      await supabase.auth.updateUser({ data: { display_name: trimmed } });
    } catch {
      console.warn('[User] Auth metadata update failed, DB is source of truth');
    }
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[updateDisplayName] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/**
 * Update user settings. Offline-first: LWW theo updated_at (P5 pattern).
 * 2 device offline sửa cùng settings → device sau sync sẽ conflict modal.
 */
export async function updateSettings(settings: UserSettings): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const db = getDatabase();
  const local = await db.getFirstAsync<{ updated_at: string }>(
    `SELECT updated_at FROM users WHERE id = ?`,
    [userId]
  );
  if (!local) throw new Error('Hồ sơ không tồn tại');

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE users SET settings = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(settings), now, userId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.UPDATE_USER_SETTINGS,
      entity_type: ENTITY_TYPES.USER,
      entity_id: userId,
      client_request_id: clientRequestId,
      payload: {
        settings: settings as unknown as Record<string, unknown>,
        base_updated_at: local.updated_at,
        client_request_id: clientRequestId,
      },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }

  try {
    const { error } = await supabase.rpc('update_user_settings', {
      p_settings: settings,
      p_base_updated_at: local.updated_at,
      p_client_request_id: clientRequestId,
    });
    if (error) throw error;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[updateSettings] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/** Update FCM token for push notifications. Pass `null` to clear on logout. */
export async function updateFcmToken(token: string | null): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('users')
    .update({ fcm_token: token })
    .eq('id', userId);

  if (error) console.warn('[User] Failed to update FCM token:', error.message);
}
