// Trip repository — read trips từ SQLite local.

import type { TripRow, TripWithGroup } from '../types/database.types';
import { getDatabase, upsertRow } from './_shared';

export interface Trip {
  id: string;
  groupId: string;
  name: string;
  type: 'travel' | 'meal' | 'event' | 'other';
  status: 'open' | 'closed';
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  deletedAt: string | null;
}

function mapRow(row: TripRow): Trip {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    type: row.type,
    status: row.status,
    createdBy: row.created_by,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    deletedAt: row.deleted_at,
  };
}

export async function getById(id: string): Promise<Trip | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<TripRow>(
    'SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function getByIdIncludingDeleted(id: string): Promise<Trip | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<TripRow>(
    'SELECT * FROM trips WHERE id = ?',
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function listByGroup(groupId: string): Promise<Trip[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<TripRow>(
    `SELECT * FROM trips
      WHERE group_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    [groupId]
  );
  return rows.map(mapRow);
}

/**
 * List toàn bộ trip user có thể thấy (qua group membership) — cho home/pin picker.
 * Note: RLS server-side filter group membership; ở local mirror cũng JOIN
 * group_members để filter.
 */
export async function listForUser(userId: string): Promise<Trip[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<TripRow>(
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
  return rows.map(mapRow);
}

/**
 * List trips kèm tên group (cho PinPickerSheet, home views).
 */
export async function listWithGroup(userId: string): Promise<TripWithGroup[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<TripRow & { group_name: string }>(
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
  return rows.map((r) => {
    const { group_name, ...trip } = r;
    return { ...trip, group_name };
  });
}

export async function upsertFromServer(row: TripRow): Promise<void> {
  await upsertRow('trips', {
    id: row.id,
    group_id: row.group_id,
    name: row.name,
    type: row.type,
    status: row.status,
    created_by: row.created_by,
    version: row.version,
    client_request_id: row.client_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
    deleted_at: row.deleted_at,
  });
}
