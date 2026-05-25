import * as SecureStore from 'expo-secure-store';

import { supabase } from '../config/supabase';
import * as authCache from '../sync/authCache';

let cached: { userId: string; ts: number } | null = null;
const TTL = 30_000; // 30s cache — avoids redundant lookups within the same user action

const RESET_COOLDOWN_KEY = 'fair_pay_reset_last_sent';
const RESET_COOLDOWN_MS = 60_000;

/**
 * Resolve Supabase auth UUID → app-level users.id.
 * Cached for 30s to reduce round-trips when multiple services
 * are called in sequence (e.g. createExpense + logAction).
 *
 * Offline fallback: nếu supabase.auth.getUser() throw (network) hoặc trả null
 * vì session expired, dùng cached identity từ _auth_cache (Phase 4 offline boot).
 */
export async function getAuthUserId(): Promise<string | null> {
  if (cached && Date.now() - cached.ts < TTL) return cached.userId;

  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser) {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', authUser.id)
        .single();
      const userId = data?.id ?? null;
      if (userId) {
        cached = { userId, ts: Date.now() };
        return userId;
      }
    }
  } catch (e) {
    // Network error → tiếp tục fall back xuống cache
    if (__DEV__) console.warn('[auth] getUser failed, trying cache:', e);
  }

  // Fallback: cached identity từ _auth_cache (offline restore)
  try {
    const identity = await authCache.load();
    if (identity) {
      cached = { userId: identity.appUserId, ts: Date.now() };
      return identity.appUserId;
    }
  } catch (e) {
    if (__DEV__) console.warn('[auth] authCache.load failed:', e);
  }

  cached = null;
  return null;
}

/** Clear cached user ID — call on logout */
export function clearAuthCache(): void {
  cached = null;
}

/**
 * Password reset cooldown — persisted across app restarts via SecureStore.
 * Per-device global cooldown (not per-email) to keep the check simple.
 */
export async function getResetCooldownRemaining(): Promise<number> {
  const raw = await SecureStore.getItemAsync(RESET_COOLDOWN_KEY);
  if (!raw) return 0;
  const last = Number(raw);
  if (!Number.isFinite(last)) return 0;
  const elapsed = Date.now() - last;
  if (elapsed >= RESET_COOLDOWN_MS) return 0;
  return Math.ceil((RESET_COOLDOWN_MS - elapsed) / 1000);
}

export async function markResetSent(): Promise<void> {
  await SecureStore.setItemAsync(RESET_COOLDOWN_KEY, String(Date.now()));
}
