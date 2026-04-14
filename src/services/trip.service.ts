import { supabase } from '../config/supabase';

export interface Trip {
  id: string;
  group_id: string;
  name: string;
  type: 'travel' | 'meal' | 'event' | 'other';
  status: 'open' | 'closed';
  created_by: string;
  created_at: string;
  closed_at: string | null;
  deleted_at: string | null;
}

/** Fetch trips for a group */
export async function fetchTrips(groupId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Create a trip (admin/owner only) */
export async function createTrip(
  groupId: string,
  name: string,
  type: Trip['type'] = 'other'
): Promise<Trip> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data, error } = await supabase
    .from('trips')
    .insert({ group_id: groupId, name, type, created_by: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Close a trip (admin/owner only) — BR-05: closed trips still readable */
export async function closeTrip(tripId: string): Promise<void> {
  const { error } = await supabase
    .from('trips')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', tripId);

  if (error) throw error;
}

/** Reopen a trip */
export async function reopenTrip(tripId: string): Promise<void> {
  const { error } = await supabase
    .from('trips')
    .update({ status: 'open', closed_at: null })
    .eq('id', tripId);

  if (error) throw error;
}

// ── Helper ──────────────────────────────────
async function getAuthUserId(): Promise<string | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single();

  return data?.id ?? null;
}
