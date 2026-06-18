import * as SecureStore from 'expo-secure-store';

import { supabase } from '../config/supabase';
import * as authCache from '../sync/authCache';

let cached: { userId: string; ts: number } | null = null;
// Dedup in-flight: nhiều service gọi getAuthUserId() đồng thời lúc cold-start
// (cache rỗng) → share 1 promise thay vì mỗi caller tự resolve. Chống stampede
// (đo thực tế: ~18 round-trip getUser/users-lookup serialize qua auth-lock ~3.3s).
let inFlight: Promise<string | null> | null = null;
const TTL = 30_000; // 30s cache — avoids redundant lookups within the same user action

const RESET_COOLDOWN_KEY = 'fair_pay_reset_last_sent';
const RESET_COOLDOWN_MS = 60_000;

interface UserIdentityRow {
  id: string;
  email: string | null;
  display_name: string | null;
  photo_url: string | null;
}

/**
 * Resolve Supabase auth UUID → app-level users.id.
 *
 * Đường nóng KHÔNG gọi mạng: lấy `sub` từ session LOCAL qua getSession()
 * (tự refresh access token khi cần; `sub` không đổi qua refresh), map sang
 * users.id bằng `_auth_cache` khi `authUserId === sub`. Chỉ lookup server 1 lần
 * khi cache lạnh / đổi tài khoản. Cached 30s + dedup in-flight → nhiều caller
 * đồng thời chỉ resolve 1 lần. Offline / chưa login → fallback cache, cuối cùng null.
 */
export async function getAuthUserId(): Promise<string | null> {
  if (cached && Date.now() - cached.ts < TTL) return cached.userId;
  if (inFlight) return inFlight;
  inFlight = resolveAuthUserId();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

async function resolveAuthUserId(): Promise<string | null> {
  // 1) sub từ session LOCAL (không gọi getUser mạng).
  let sub: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    sub = data.session?.user?.id ?? null;
  } catch (e) {
    if (__DEV__) console.warn('[auth] getSession failed:', e);
  }

  if (sub) {
    // 2a) Cache local khớp sub → 0 round-trip.
    const identity = await authCache.load().catch(() => null);
    if (identity && identity.authUserId === sub) {
      cached = { userId: identity.appUserId, ts: Date.now() };
      return identity.appUserId;
    }

    // 2b) Cache lạnh / đổi tài khoản → lookup server 1 lần + persist cho lần sau.
    try {
      const { data } = await supabase
        .from('users')
        .select('id, email, display_name, photo_url')
        .eq('auth_id', sub)
        .single();
      const row = data as UserIdentityRow | null;
      if (row?.id) {
        cached = { userId: row.id, ts: Date.now() };
        void authCache
          .save({
            authUserId: sub,
            appUserId: row.id,
            email: row.email ?? '',
            displayName: row.display_name,
            photoUrl: row.photo_url,
          })
          .catch(() => {});
        return row.id;
      }
    } catch (e) {
      // Offline/network fail mà không có mapping local khớp sub (2a đã trượt) →
      // không resolve an toàn được, trả null (tránh trả nhầm id account khác).
      if (__DEV__) console.warn('[auth] users lookup failed:', e);
      return null;
    }
    return null; // sub hợp lệ nhưng không có row users tương ứng
  }

  // 3) Không có session (offline boot trước restore). Logout đã clear cache nên
  //    case "đã logout" sẽ trả null. Dùng cache còn sót nếu có.
  const identity = await authCache.load().catch(() => null);
  if (identity?.appUserId) {
    cached = { userId: identity.appUserId, ts: Date.now() };
    return identity.appUserId;
  }

  cached = null;
  return null;
}

/** Clear cached user ID — call on logout */
export function clearAuthCache(): void {
  cached = null;
  inFlight = null;
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
