import { supabase } from '../config/supabase';

let cached: { userId: string; ts: number } | null = null;
const TTL = 30_000; // 30s cache — avoids redundant lookups within the same user action

/**
 * Resolve Supabase auth UUID → app-level users.id.
 * Cached for 30s to reduce round-trips when multiple services
 * are called in sequence (e.g. createExpense + logAction).
 */
export async function getAuthUserId(): Promise<string | null> {
  if (cached && Date.now() - cached.ts < TTL) return cached.userId;

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    cached = null;
    return null;
  }

  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single();

  const userId = data?.id ?? null;
  if (userId) {
    cached = { userId, ts: Date.now() };
  }
  return userId;
}

/** Clear cached user ID — call on logout */
export function clearAuthCache(): void {
  cached = null;
}
