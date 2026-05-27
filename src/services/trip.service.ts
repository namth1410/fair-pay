import { TRIP_NAME_MAX_LENGTH } from '../config/constants';
import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import { useAppStore } from '../stores/app.store';
import { tryServerThenLocal } from '../sync/fallback';
import { run as runSync } from '../sync/syncEngine';
import * as syncQueue from '../sync/syncQueue';
import { ENTITY_TYPES, OP_TYPES } from '../sync/types';
import type { TripWithGroup } from '../types/database.types';
import { isNetworkError } from '../utils/network';
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
  version: number;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  deleted_at: string | null;
}

/** Fetch trips for a group — fallback SQLite mirror khi offline/network fail. */
export async function fetchTrips(groupId: string): Promise<Trip[]> {
  return tryServerThenLocal<Trip[]>(
    async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async () => {
      const db = getDatabase();
      const rows = await db.getAllAsync<Trip>(
        `SELECT * FROM trips
          WHERE group_id = ? AND deleted_at IS NULL
          ORDER BY created_at DESC`,
        [groupId]
      );
      return rows;
    }
  );
}

/** Fetch single trip by id — fallback SQLite mirror khi offline/network fail.
 *  Dùng cho entry-point bypass group detail (pinned card, deep link, notification). */
export async function fetchTripById(tripId: string): Promise<Trip | null> {
  return tryServerThenLocal<Trip | null>(
    async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data as Trip | null) ?? null;
    },
    async () => {
      const db = getDatabase();
      const row = await db.getFirstAsync<Trip>(
        `SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL`,
        [tripId]
      );
      return row ?? null;
    }
  );
}

/** Fetch all trips user has access to. RLS scopes by membership (server) / JOIN (local). */
export async function fetchAllUserTrips(): Promise<Trip[]> {
  return tryServerThenLocal<Trip[]>(
    async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async () => {
      const userId = await getAuthUserId();
      if (!userId) return [];
      const db = getDatabase();
      const rows = await db.getAllAsync<Trip>(
        `SELECT t.* FROM trips t
           INNER JOIN group_members m ON m.group_id = t.group_id
           INNER JOIN groups g ON g.id = t.group_id
          WHERE m.user_id = ?
            AND m.left_at IS NULL
            AND g.deleted_at IS NULL
            AND t.deleted_at IS NULL
          ORDER BY t.created_at DESC`,
        [userId]
      );
      return rows;
    }
  );
}

/**
 * Create a trip (admin only). Offline-first: client-gen UUID + enqueue.
 * Online: INSERT trực tiếp; network fail → fallback queue.
 */
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

  const tripId = globalThis.crypto.randomUUID();
  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();

  const enqueueLocal = async (): Promise<Trip> => {
    const db = getDatabase();
    await db.runAsync(
      `INSERT INTO trips
        (id, group_id, name, type, status, created_by, version,
         client_request_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, 1, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [tripId, groupId, name, type, userId, clientRequestId, clientCreatedAt, clientCreatedAt]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.CREATE_TRIP,
      entity_type: ENTITY_TYPES.TRIP,
      entity_id: tripId,
      client_request_id: clientRequestId,
      payload: {
        id: tripId,
        group_id: groupId,
        name,
        type,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
      },
    });
    return {
      id: tripId,
      group_id: groupId,
      name,
      type,
      status: 'open',
      created_by: userId,
      version: 1,
      client_request_id: clientRequestId,
      created_at: clientCreatedAt,
      updated_at: clientCreatedAt,
      closed_at: null,
      deleted_at: null,
    };
  };

  if (!useAppStore.getState().isOnline) {
    return enqueueLocal();
  }

  try {
    const { data, error } = await supabase
      .from('trips')
      .insert({
        id: tripId,
        group_id: groupId,
        name,
        type,
        created_by: userId,
        client_request_id: clientRequestId,
      })
      .select()
      .single();

    if (error) throw error;

    await logAction({
      groupId,
      tripId: data.id,
      action: 'trip.create',
      targetId: data.id,
      afterData: { name, type },
    });

    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[createTrip] network fail, queueing offline');
      return enqueueLocal();
    }
    throw err;
  }
}

/**
 * Close a trip (admin only) — BR-05. Offline-first: dùng RPC close_trip với
 * optimistic concurrency. Idempotent server-side (no-op nếu đã closed).
 */
export async function closeTrip(tripId: string): Promise<void> {
  const db = getDatabase();
  const local = await db.getFirstAsync<{
    group_id: string;
    name: string;
    version: number;
    status: string;
  }>(
    `SELECT group_id, name, version, status FROM trips WHERE id = ?`,
    [tripId]
  );
  if (!local) throw new Error('Chuyến đi không tồn tại');
  if (local.status === 'closed') return; // already closed — no-op
  await assertRole(local.group_id, ['admin']);

  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE trips
          SET status = 'closed', closed_at = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND status <> 'closed'`,
      [clientCreatedAt, clientCreatedAt, tripId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.CLOSE_TRIP,
      entity_type: ENTITY_TYPES.TRIP,
      entity_id: tripId,
      client_request_id: clientRequestId,
      payload: {
        trip_id: tripId,
        base_version: local.version,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
      },
    });
  };

  const isOnline = useAppStore.getState().isOnline;
  const hasPending = await syncQueue.hasPendingForEntity(ENTITY_TYPES.TRIP, tripId);
  if (!isOnline || hasPending) {
    await enqueueLocal();
    if (isOnline) {
      void runSync().catch(() => {});
    }
    return;
  }

  try {
    const { error } = await supabase.rpc('close_trip', {
      p_trip_id: tripId,
      p_base_version: local.version,
      p_client_request_id: clientRequestId,
      p_client_created_at: clientCreatedAt,
    });
    if (error) throw error;

    // Notify (best-effort) — RPC server-side đã log audit atomic.
    const userId = await getAuthUserId();
    if (!userId) return;
    const { data: actor } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    const actorName = actor?.display_name || 'Thành viên';
    await notifyTripClosed({
      groupId: local.group_id,
      tripId,
      tripName: local.name,
      actorId: userId,
      actorName,
    });
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[closeTrip] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/**
 * Reopen a trip (admin only). Offline-first: dùng RPC reopen_trip.
 * Idempotent server-side (no-op nếu đã open).
 */
export async function reopenTrip(tripId: string): Promise<void> {
  const db = getDatabase();
  const local = await db.getFirstAsync<{
    group_id: string;
    name: string;
    version: number;
    status: string;
  }>(
    `SELECT group_id, name, version, status FROM trips WHERE id = ?`,
    [tripId]
  );
  if (!local) throw new Error('Chuyến đi không tồn tại');
  if (local.status === 'open') return; // already open
  await assertRole(local.group_id, ['admin']);

  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE trips
          SET status = 'open', closed_at = NULL, version = version + 1, updated_at = ?
        WHERE id = ? AND status <> 'open'`,
      [clientCreatedAt, tripId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.REOPEN_TRIP,
      entity_type: ENTITY_TYPES.TRIP,
      entity_id: tripId,
      client_request_id: clientRequestId,
      payload: {
        trip_id: tripId,
        base_version: local.version,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
      },
    });
  };

  const isOnline = useAppStore.getState().isOnline;
  const hasPending = await syncQueue.hasPendingForEntity(ENTITY_TYPES.TRIP, tripId);
  if (!isOnline || hasPending) {
    await enqueueLocal();
    if (isOnline) {
      void runSync().catch(() => {});
    }
    return;
  }

  try {
    const { error } = await supabase.rpc('reopen_trip', {
      p_trip_id: tripId,
      p_base_version: local.version,
      p_client_request_id: clientRequestId,
      p_client_created_at: clientCreatedAt,
    });
    if (error) throw error;
    // Audit logged by RPC, no notify on reopen.
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[reopenTrip] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/**
 * Rename a trip (admin only). Offline-first: dùng RPC update_trip_name với
 * optimistic concurrency (P3 pattern). Conflict → modal cho user chọn.
 */
export async function updateTripName(tripId: string, newName: string): Promise<void> {
  const db = getDatabase();
  const local = await db.getFirstAsync<{
    group_id: string;
    name: string;
    version: number;
  }>(`SELECT group_id, name, version FROM trips WHERE id = ?`, [tripId]);
  if (!local) throw new Error('Chuyến đi không tồn tại');
  await assertRole(local.group_id, ['admin']);

  const trimmed = newName.trim();
  const nameErr = validateName(trimmed, 'Tên chuyến');
  if (nameErr) throw new Error(nameErr);
  if (trimmed.length > TRIP_NAME_MAX_LENGTH) {
    throw new Error(`Tên chuyến không được quá ${TRIP_NAME_MAX_LENGTH} ký tự`);
  }
  if (trimmed === local.name) return; // no-op nếu trùng tên cũ

  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    // Local: tăng version + đổi name (UI render đúng tên mới ngay)
    await db.runAsync(
      `UPDATE trips
          SET name = ?, version = version + 1, updated_at = ?
        WHERE id = ?`,
      [trimmed, clientCreatedAt, tripId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.UPDATE_TRIP_NAME,
      entity_type: ENTITY_TYPES.TRIP,
      entity_id: tripId,
      client_request_id: clientRequestId,
      payload: {
        trip_id: tripId,
        name: trimmed,
        base_version: local.version,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
      },
    });
  };

  const isOnline = useAppStore.getState().isOnline;
  const hasPending = await syncQueue.hasPendingForEntity(ENTITY_TYPES.TRIP, tripId);
  if (!isOnline || hasPending) {
    await enqueueLocal();
    if (isOnline) {
      void runSync().catch(() => {});
    }
    return;
  }

  try {
    const { data, error } = await supabase.rpc('update_trip_name', {
      p_trip_id: tripId,
      p_name: trimmed,
      p_base_version: local.version,
      p_client_request_id: clientRequestId,
      p_client_created_at: clientCreatedAt,
    });
    if (error) throw error;

    // Write-back local mirror với server's version + updated_at: tránh lần
    // update kế dùng stale base_version → P0410 version_conflict.
    const serverRow = Array.isArray(data) && data.length > 0
      ? (data[0] as { version: number; updated_at: string })
      : null;
    if (serverRow) {
      await db.runAsync(
        `UPDATE trips SET name = ?, version = ?, updated_at = ? WHERE id = ?`,
        [trimmed, serverRow.version, serverRow.updated_at, tripId]
      );
    }
    // Audit logged by RPC server-side.
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[updateTripName] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/**
 * Clear trip: soft-delete tất cả expenses + payments của trip — ATOMIC qua RPC.
 * Cho phép cả `open` và `closed` — nếu trip đang closed, tự reopen.
 * Members giữ nguyên. Authorization + transaction enforced ở DB.
 */
/**
 * Clear trip — soft-delete all expenses + payments + reopen nếu closed.
 * Offline-first: idempotent local soft-delete + queue RPC clear_trip server.
 *
 * Server-side RPC chạy atomic + audit + notify. Offline path apply local optimistic
 * (mass UPDATE soft-delete expense+payments) rồi queue RPC.
 */
export async function clearTrip(tripId: string): Promise<void> {
  const db = getDatabase();
  const local = await db.getFirstAsync<{ group_id: string; name: string; status: string }>(
    `SELECT group_id, name, status FROM trips WHERE id = ?`,
    [tripId]
  );
  if (!local) throw new Error('Chuyến đi không tồn tại');
  await assertRole(local.group_id, ['admin']);

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE expenses SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?
          WHERE trip_id = ? AND deleted_at IS NULL`,
        [now, now, tripId]
      );
      await db.runAsync(
        `UPDATE payments SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?
          WHERE trip_id = ? AND deleted_at IS NULL`,
        [now, now, tripId]
      );
      if (local.status === 'closed') {
        await db.runAsync(
          `UPDATE trips SET status = 'open', closed_at = NULL,
                version = version + 1, updated_at = ?
            WHERE id = ?`,
          [now, tripId]
        );
      }
    });
    await syncQueue.enqueue({
      op_type: OP_TYPES.CLEAR_TRIP,
      entity_type: ENTITY_TYPES.TRIP,
      entity_id: tripId,
      client_request_id: clientRequestId,
      payload: { trip_id: tripId, client_request_id: clientRequestId, client_created_at: now },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }

  try {
    const { data, error } = await supabase
      .rpc('clear_trip', { p_trip_id: tripId })
      .single<{ group_id: string; name: string; was_closed: boolean }>();
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
        action: 'trip.clear',
        targetId: tripId,
        beforeData: { name: data.name, was_closed: data.was_closed },
        afterData: { cleared_at: now },
      }),
      notifyTripCleared({
        groupId: data.group_id,
        tripId,
        tripName: data.name,
        actorId: userId,
        actorName,
      }),
    ]);
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[clearTrip] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/**
 * Delete trip: soft-delete trip + cascade expenses + payments — ATOMIC qua RPC.
 * Trip biến mất khỏi danh sách. Offline-first: local cascade + queue RPC.
 */
export async function deleteTrip(tripId: string): Promise<void> {
  const db = getDatabase();
  const local = await db.getFirstAsync<{ group_id: string; name: string }>(
    `SELECT group_id, name FROM trips WHERE id = ?`,
    [tripId]
  );
  if (!local) throw new Error('Chuyến đi không tồn tại');
  await assertRole(local.group_id, ['admin']);

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE trips SET deleted_at = COALESCE(deleted_at, ?), updated_at = ? WHERE id = ?`,
        [now, now, tripId]
      );
      await db.runAsync(
        `UPDATE expenses SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?
          WHERE trip_id = ? AND deleted_at IS NULL`,
        [now, now, tripId]
      );
      await db.runAsync(
        `UPDATE payments SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?
          WHERE trip_id = ? AND deleted_at IS NULL`,
        [now, now, tripId]
      );
    });
    await syncQueue.enqueue({
      op_type: OP_TYPES.DELETE_TRIP,
      entity_type: ENTITY_TYPES.TRIP,
      entity_id: tripId,
      client_request_id: clientRequestId,
      payload: { trip_id: tripId, client_request_id: clientRequestId, client_created_at: now },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }

  try {
    const { data, error } = await supabase
      .rpc('delete_trip', { p_trip_id: tripId })
      .single<{ group_id: string; name: string }>();
    if (error) throw error;
    if (!data) throw new Error('Chuyến đi không tồn tại');

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
        afterData: { deleted_at: now },
      }),
      notifyTripDeleted({
        groupId: data.group_id,
        tripId,
        tripName: data.name,
        actorId: userId,
        actorName,
      }),
    ]);
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[deleteTrip] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/* ============================================================================
 * Pinned trips — per-user shortcut tới max 2 trip
 * RLS SELECT/DELETE chính chủ. INSERT/UPDATE chỉ qua RPC (REVOKE direct).
 * ========================================================================== */

interface PinnedTripJoinRow {
  position: number;
  trips: (Trip & { groups: { name: string; deleted_at: string | null } }) | null;
}

/** Fetch các trip user đã pin (kèm tên group), ordered by position (0 → 1). */
export async function fetchPinnedTrips(): Promise<TripWithGroup[]> {
  return tryServerThenLocal<TripWithGroup[]>(
    async () => {
      const { data, error } = await supabase
        .from('pinned_trips')
        .select('position, trips!inner(*, groups!inner(name, deleted_at))')
        .order('position', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as PinnedTripJoinRow[])
        .map((r) => r.trips)
        .filter(
          (t): t is Trip & { groups: { name: string; deleted_at: string | null } } =>
            !!t && !t.deleted_at && !t.groups?.deleted_at,
        )
        .map((t) => {
          const { groups, ...rest } = t;
          return { ...rest, group_name: groups.name };
        });
    },
    async () => {
      const userId = await getAuthUserId();
      if (!userId) return [];
      const db = getDatabase();
      const rows = await db.getAllAsync<Trip & { group_name: string }>(
        `SELECT t.*, g.name AS group_name
           FROM pinned_trips p
           INNER JOIN trips t ON t.id = p.trip_id
           INNER JOIN groups g ON g.id = t.group_id
          WHERE p.user_id = ?
            AND t.deleted_at IS NULL
            AND g.deleted_at IS NULL
          ORDER BY p.position ASC`,
        [userId]
      );
      return rows;
    }
  );
}

/**
 * Pin a trip — idempotent. Offline-first: optimistic update local pinned_trips +
 * enqueue. RPC pin_trip server-side đã handle limit 2 + ghost cleanup.
 */
export async function pinTrip(tripId: string): Promise<void> {
  const clientRequestId = globalThis.crypto.randomUUID();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const enqueueLocal = async (): Promise<void> => {
    const db = getDatabase();
    // Pick next position (0 hoặc 1). Nếu đã có 2 pin → server reject.
    const existing = await db.getAllAsync<{ position: number }>(
      `SELECT position FROM pinned_trips WHERE user_id = ? ORDER BY position`,
      [userId]
    );
    const usedPositions = new Set(existing.map((p) => p.position));
    let nextPos = 0;
    while (usedPositions.has(nextPos) && nextPos < 2) nextPos++;
    // Nếu đã đủ 2 pin, vẫn enqueue — server sẽ reject hoặc replace.
    const id = globalThis.crypto.randomUUID();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO pinned_trips (id, user_id, trip_id, position, pinned_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, trip_id) DO NOTHING`,
      [id, userId, tripId, nextPos, now, now]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.PIN_TRIP,
      entity_type: ENTITY_TYPES.PINNED_TRIP,
      entity_id: tripId,
      client_request_id: clientRequestId,
      payload: { trip_id: tripId, client_request_id: clientRequestId },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }
  try {
    const { error } = await supabase.rpc('pin_trip', { p_trip_id: tripId });
    if (error) throw error;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[pinTrip] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/** Unpin a trip. Idempotent. Offline-first. */
export async function unpinTrip(tripId: string): Promise<void> {
  const clientRequestId = globalThis.crypto.randomUUID();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const enqueueLocal = async (): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
      `DELETE FROM pinned_trips WHERE user_id = ? AND trip_id = ?`,
      [userId, tripId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.UNPIN_TRIP,
      entity_type: ENTITY_TYPES.PINNED_TRIP,
      entity_id: tripId,
      client_request_id: clientRequestId,
      payload: { trip_id: tripId, client_request_id: clientRequestId },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }
  try {
    const { error } = await supabase.rpc('unpin_trip', { p_trip_id: tripId });
    if (error) throw error;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[unpinTrip] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/**
 * Reorder 2 pin theo thứ tự mới: [pos0, pos1]. LWW theo timestamp cuối khi sync.
 */
export async function reorderPinnedTrips(
  orderedTripIds: [string, string]
): Promise<void> {
  const clientRequestId = globalThis.crypto.randomUUID();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const enqueueLocal = async (): Promise<void> => {
    const db = getDatabase();
    const now = new Date().toISOString();
    // Local swap: tạm dùng position -1 / -2 tránh UNIQUE conflict trong transaction
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE pinned_trips SET position = -1, updated_at = ?
          WHERE user_id = ? AND trip_id = ?`,
        [now, userId, orderedTripIds[0]]
      );
      await db.runAsync(
        `UPDATE pinned_trips SET position = -2, updated_at = ?
          WHERE user_id = ? AND trip_id = ?`,
        [now, userId, orderedTripIds[1]]
      );
      await db.runAsync(
        `UPDATE pinned_trips SET position = 0
          WHERE user_id = ? AND trip_id = ?`,
        [userId, orderedTripIds[0]]
      );
      await db.runAsync(
        `UPDATE pinned_trips SET position = 1
          WHERE user_id = ? AND trip_id = ?`,
        [userId, orderedTripIds[1]]
      );
    });
    await syncQueue.enqueue({
      op_type: OP_TYPES.REORDER_PINNED_TRIPS,
      entity_type: ENTITY_TYPES.PINNED_TRIP,
      entity_id: orderedTripIds.join('|'),
      client_request_id: clientRequestId,
      payload: { trip_ids: orderedTripIds, client_request_id: clientRequestId },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }
  try {
    const { error } = await supabase.rpc('reorder_pinned_trips', {
      p_trip_ids: orderedTripIds,
    });
    if (error) throw error;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[reorderPinnedTrips] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/** Fetch toàn bộ trip user có thể thấy + tên group (cho PinPickerSheet). */
export async function fetchAllUserTripsWithGroup(): Promise<TripWithGroup[]> {
  return tryServerThenLocal<TripWithGroup[]>(
    async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*, groups!inner(name, deleted_at)')
        .is('deleted_at', null)
        .is('groups.deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      type Row = Trip & { groups: { name: string; deleted_at: string | null } };
      return ((data ?? []) as unknown as Row[]).map((t) => {
        const { groups, ...rest } = t;
        return { ...rest, group_name: groups.name };
      });
    },
    async () => {
      const userId = await getAuthUserId();
      if (!userId) return [];
      const db = getDatabase();
      const rows = await db.getAllAsync<Trip & { group_name: string }>(
        `SELECT t.*, g.name AS group_name FROM trips t
           INNER JOIN group_members m ON m.group_id = t.group_id
           INNER JOIN groups g ON g.id = t.group_id
          WHERE m.user_id = ?
            AND m.left_at IS NULL
            AND g.deleted_at IS NULL
            AND t.deleted_at IS NULL
          ORDER BY t.created_at DESC`,
        [userId]
      );
      return rows;
    }
  );
}
