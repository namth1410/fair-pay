import { TRIP_NAME_MAX_LENGTH } from '../config/constants';
import { supabase } from '../config/supabase';
import { validateName } from '../utils/validate';
import { logAction } from './audit.service';
import { getAuthUserId } from './auth.helper';
import { assertRole } from './group.service';
import {
  notifyTripCleared,
  notifyTripClosed,
  notifyTripDeleted,
} from './notification.service';

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

/** Fetch all trips user has access to (across all groups). RLS scopes by membership. */
export async function fetchAllUserTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
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

/** Rename a trip (admin only) */
export async function updateTripName(tripId: string, newName: string): Promise<void> {
  const { data: trip, error: fetchErr } = await supabase
    .from('trips')
    .select('group_id, name')
    .eq('id', tripId)
    .single();
  if (fetchErr || !trip) throw new Error('Chuyến đi không tồn tại');
  await assertRole(trip.group_id, ['admin']);

  const trimmed = newName.trim();
  const nameErr = validateName(trimmed, 'Tên chuyến');
  if (nameErr) throw new Error(nameErr);
  if (trimmed.length > TRIP_NAME_MAX_LENGTH) {
    throw new Error(`Tên chuyến không được quá ${TRIP_NAME_MAX_LENGTH} ký tự`);
  }
  if (trimmed === trip.name) return; // no-op nếu trùng tên cũ

  const { error } = await supabase
    .from('trips')
    .update({ name: trimmed })
    .eq('id', tripId);
  if (error) throw error;

  // Audit best-effort — rename không phát notify
  await logAction({
    groupId: trip.group_id,
    tripId,
    action: 'trip.rename',
    targetId: tripId,
    beforeData: { name: trip.name },
    afterData: { name: trimmed },
  });
}

/**
 * Clear trip: soft-delete tất cả expenses + payments của trip — ATOMIC qua RPC.
 * Cho phép cả `open` và `closed` — nếu trip đang closed, tự reopen.
 * Members giữ nguyên. Authorization + transaction enforced ở DB.
 */
export async function clearTrip(tripId: string): Promise<void> {
  const { data, error } = await supabase
    .rpc('clear_trip', { p_trip_id: tripId })
    .single<{ group_id: string; name: string; was_closed: boolean }>();
  if (error) throw error;
  if (!data) throw new Error('Chuyến đi không tồn tại');

  // Audit + notify (best-effort) — chạy sau khi RPC đã commit thành công
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
      groupId: data.group_id,
      tripId,
      action: 'trip.clear',
      targetId: tripId,
      beforeData: { name: data.name, was_closed: data.was_closed },
      afterData: { cleared_at: new Date().toISOString() },
    }),
    notifyTripCleared({
      groupId: data.group_id,
      tripId,
      tripName: data.name,
      actorId: userId,
      actorName,
    }),
  ]);
}

/**
 * Delete trip: soft-delete trip + cascade expenses + payments — ATOMIC qua RPC.
 * Trip biến mất khỏi danh sách. UI cần navigate back sau khi gọi thành công.
 */
export async function deleteTrip(tripId: string): Promise<void> {
  const { data, error } = await supabase
    .rpc('delete_trip', { p_trip_id: tripId })
    .single<{ group_id: string; name: string }>();
  if (error) throw error;
  if (!data) throw new Error('Chuyến đi không tồn tại');

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
      groupId: data.group_id,
      tripId,
      action: 'trip.delete',
      targetId: tripId,
      beforeData: { name: data.name },
      afterData: { deleted_at: new Date().toISOString() },
    }),
    notifyTripDeleted({
      groupId: data.group_id,
      tripId,
      tripName: data.name,
      actorId: userId,
      actorName,
    }),
  ]);
}
