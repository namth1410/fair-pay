import { DISPLAY_NAME_MAX_LENGTH } from '../config/constants';
import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import * as userRepo from '../repositories/user.repo';
import { extractServerRow, mirrorServerRow } from '../repositories/writeback';
import { useAppStore } from '../stores/app.store';
import { run as runSync } from '../sync/syncEngine';
import * as syncQueue from '../sync/syncQueue';
import { ENTITY_TYPES, OP_TYPES } from '../sync/types';
import type { UserRow } from '../types/database.types';
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

  // Seed/refresh SQLite mirror NGAY khi có server row. Tránh race: store profile
  // sẵn sàng (đọc thẳng Supabase ở đây) TRƯỚC khi sync engine pull `users` về →
  // UI cho toggle settings nhưng updateSettings/updateDisplayName đọc SQLite trống
  // → throw "Hồ sơ không tồn tại" (toast đỏ). Await trước khi return → lúc
  // setProfile chạy (toggle enabled) thì mirror đã tồn tại.
  if (data) {
    try {
      await userRepo.upsertFromServer(data as unknown as UserRow);
    } catch (e) {
      if (__DEV__) console.warn('[fetchCurrentUser] seed local mirror failed:', e);
    }
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

interface LocalUserRow {
  version: number;
  display_name: string;
  updated_at: string;
  settings: string | null;
}

/**
 * Đọc row `users` từ SQLite mirror. Nếu mirror chưa được seed (race: store
 * profile sẵn sàng từ Supabase TRƯỚC khi sync engine pull `users` về) → dựng
 * row tối thiểu từ store profile + session để mutation đi tiếp được (online RPC
 * hoặc enqueue offline) thay vì throw "Hồ sơ không tồn tại". Trả null CHỈ khi
 * thật sự chưa có identity nào (chưa đăng nhập xong) — lúc đó throw là đúng.
 */
async function readOrSeedLocalUser(userId: string): Promise<LocalUserRow | null> {
  const db = getDatabase();
  const sql =
    `SELECT version, display_name, updated_at, settings FROM users WHERE id = ?`;
  const existing = await db.getFirstAsync<LocalUserRow>(sql, [userId]);
  if (existing) return existing;

  // Mirror chưa seed — lấy identity từ auth store (profile do fetchCurrentUser
  // set, đọc thẳng Supabase). Lazy require tránh circular import.
  const { useAuthStore } = require('../stores/auth.store') as typeof import('../stores/auth.store');
  const state = useAuthStore.getState();
  const profile = state.profile;
  const authId = state.session?.user.id;
  if (!profile || !authId) return null;

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO users
       (id, auth_id, display_name, email, photo_url, fcm_token, settings, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      userId,
      authId,
      profile.display_name,
      profile.email,
      profile.photo_url,
      profile.fcm_token,
      JSON.stringify(profile.settings),
      now,
      now,
    ]
  );
  return db.getFirstAsync<LocalUserRow>(sql, [userId]);
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
  const local = await readOrSeedLocalUser(userId);
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

  const isOnline = useAppStore.getState().isOnline;
  const hasPending = await syncQueue.hasPendingForEntity(ENTITY_TYPES.USER, userId);
  if (!isOnline || hasPending) {
    await enqueueLocal();
    // Online + có pending queue: trigger sync để push row mới sớm, tránh chờ
    // trigger ngẫu nhiên (background/foreground hoặc network blip). Sync engine
    // single-flight + rate-limit 5s → an toàn fire-and-forget.
    if (isOnline) {
      void runSync().catch(() => {});
    }
    return;
  }

  try {
    const { data, error } = await supabase.rpc('update_user_display_name', {
      p_display_name: trimmed,
      p_base_version: local.version,
      p_client_request_id: clientRequestId,
    });
    if (error) throw error;

    // Write-back: mirror version + updated_at server bump (xem
    // src/repositories/writeback.ts cho lý do).
    const serverRow = extractServerRow<{ version: number; updated_at: string }>(data);
    if (serverRow) {
      await mirrorServerRow('users', userId, serverRow, { display_name: trimmed });
    }

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
 *
 * Nhận PATCH (delta) thay vì full object → server merge `current || patch`
 * chỉ ghi đúng field client đổi, giữ nguyên 7 field còn lại trên server →
 * tránh stale value của Zustand cache overwrite change của thiết bị khác.
 */
export async function updateSettings(patch: Partial<UserSettings>): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');
  if (Object.keys(patch).length === 0) return;

  const db = getDatabase();
  const local = await readOrSeedLocalUser(userId);
  if (!local) throw new Error('Hồ sơ không tồn tại');

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  // Merge với SQLite current trước khi write local — mirror khớp với cách
  // server merge `current || patch` (whitelist + JSONB ||).
  const currentLocal = JSON.parse(local.settings || '{}') as Partial<UserSettings>;
  const mergedLocal = { ...currentLocal, ...patch };

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE users SET settings = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(mergedLocal), now, userId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.UPDATE_USER_SETTINGS,
      entity_type: ENTITY_TYPES.USER,
      entity_id: userId,
      client_request_id: clientRequestId,
      payload: {
        settings: patch as Record<string, unknown>,
        base_updated_at: local.updated_at,
        client_request_id: clientRequestId,
      },
    });
  };

  const isOnline = useAppStore.getState().isOnline;
  const hasPending = await syncQueue.hasPendingForEntity(ENTITY_TYPES.USER, userId);
  if (!isOnline || hasPending) {
    await enqueueLocal();
    if (isOnline) {
      void runSync().catch(() => {});
    }
    return;
  }

  try {
    const { data, error } = await supabase.rpc('update_user_settings', {
      p_settings: patch,
      p_base_updated_at: local.updated_at,
      p_client_request_id: clientRequestId,
    });
    if (error) throw error;

    // Write-back: mirror settings + version + updated_at.
    const serverRow = extractServerRow<{
      settings: Record<string, unknown>;
      version: number;
      updated_at: string;
    }>(data);
    if (serverRow) {
      await mirrorServerRow('users', userId, serverRow, { settings: serverRow.settings });
    }
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[updateSettings] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/** Update FCM token for push notifications. Pass `null` to clear on logout.
 *
 * Server-side trigger `trg_users_bump_version` skip bump version+updated_at
 * khi chỉ `fcm_token` đổi (migration 20260528140000) → KHÔNG cần write-back
 * local mirror để giữ optimistic concurrency / LWW base sync với server.
 */
export async function updateFcmToken(token: string | null): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('users')
    .update({ fcm_token: token })
    .eq('id', userId);

  if (error) console.warn('[User] Failed to update FCM token:', error.message);
}
