import { supabase } from '../config/supabase';
import { validateName } from '../utils/validate';
import { logAction } from './audit.service';
import { getAuthUserId } from './auth.helper';
import { assertRole } from './group.service';
import { notifyTripClosed } from './notification.service';

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

/** Create a trip (admin only) */
export async function createTrip(
  groupId: string,
  name: string,
  type: Trip['type'] = 'other'
): Promise<Trip> {
  await assertRole(groupId, ['admin']);

  const nameErr = validateName(name, 'Tên chuyến');
  if (nameErr) throw new Error(nameErr);

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data, error } = await supabase
    .from('trips')
    .insert({ group_id: groupId, name, type, created_by: userId })
    .select()
    .single();

  if (error) throw error;

  // Audit (best-effort) — trip.create không phát notify (nhóm chưa có activity)
  await logAction({
    groupId,
    tripId: data.id,
    action: 'trip.create',
    targetId: data.id,
    afterData: { name, type },
  });

  return data;
}

/** Close a trip (admin only) — BR-05: closed trips still readable */
export async function closeTrip(tripId: string): Promise<void> {
  const { data: trip, error: fetchErr } = await supabase
    .from('trips')
    .select('group_id, name')
    .eq('id', tripId)
    .single();
  if (fetchErr || !trip) throw new Error('Chuyến đi không tồn tại');
  await assertRole(trip.group_id, ['admin']);

  const { error } = await supabase
    .from('trips')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', tripId);

  if (error) throw error;

  // Audit + notify (best-effort)
  const userId = await getAuthUserId();
  if (!userId) return;
  const { data: actor } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  const actorName = actor?.display_name || 'Thành viên';
  await Promise.all([
    logAction({
      groupId: trip.group_id,
      tripId,
      action: 'trip.close',
      targetId: tripId,
      beforeData: { name: trip.name, status: 'open' },
      afterData: { status: 'closed' },
    }),
    notifyTripClosed({
      groupId: trip.group_id,
      tripId,
      tripName: trip.name,
      actorId: userId,
      actorName,
    }),
  ]);
}

/** Reopen a trip */
export async function reopenTrip(tripId: string): Promise<void> {
  const { data: trip, error: fetchErr } = await supabase
    .from('trips')
    .select('group_id, name')
    .eq('id', tripId)
    .single();
  if (fetchErr || !trip) throw new Error('Chuyến đi không tồn tại');
  await assertRole(trip.group_id, ['admin']);

  const { error } = await supabase
    .from('trips')
    .update({ status: 'open', closed_at: null })
    .eq('id', tripId);

  if (error) throw error;

  // Audit (best-effort) — reopen không phát notify
  await logAction({
    groupId: trip.group_id,
    tripId,
    action: 'trip.reopen',
    targetId: tripId,
    beforeData: { name: trip.name, status: 'closed' },
    afterData: { status: 'open' },
  });
}
