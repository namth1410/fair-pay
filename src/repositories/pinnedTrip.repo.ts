// Pinned trip repository — read pinned trips từ SQLite local.

import type { PinnedTripRow } from '../types/database.types';
import { getDatabase, upsertRow } from './_shared';

export interface PinnedTrip {
  id: string;
  userId: string;
  tripId: string;
  position: number; // 0 = card trái, 1 = card phải
  pinnedAt: string;
  updatedAt: string;
}

function mapRow(row: PinnedTripRow): PinnedTrip {
  return {
    id: row.id,
    userId: row.user_id,
    tripId: row.trip_id,
    position: row.position,
    pinnedAt: row.pinned_at,
    updatedAt: row.updated_at,
  };
}

export async function listForUser(userId: string): Promise<PinnedTrip[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<PinnedTripRow>(
    `SELECT * FROM pinned_trips
      WHERE user_id = ?
      ORDER BY position ASC`,
    [userId]
  );
  return rows.map(mapRow);
}

export async function findByTrip(
  userId: string,
  tripId: string
): Promise<PinnedTrip | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<PinnedTripRow>(
    `SELECT * FROM pinned_trips WHERE user_id = ? AND trip_id = ?`,
    [userId, tripId]
  );
  return row ? mapRow(row) : null;
}

export async function upsertFromServer(row: PinnedTripRow): Promise<void> {
  await upsertRow('pinned_trips', {
    id: row.id,
    user_id: row.user_id,
    trip_id: row.trip_id,
    position: row.position,
    pinned_at: row.pinned_at,
    updated_at: row.updated_at,
  });
}

/**
 * Sync engine pull có thể trả về list rỗng (user unpin trip qua device khác).
 * Pull cycle phải reconcile: delete local rows không xuất hiện trong server response.
 * Repo cung cấp helper để sync engine gọi.
 */
export async function replaceAllForUser(
  userId: string,
  serverRows: PinnedTripRow[]
): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM pinned_trips WHERE user_id = ?`, [userId]);
    for (const row of serverRows) {
      await upsertRow(
        'pinned_trips',
        {
          id: row.id,
          user_id: row.user_id,
          trip_id: row.trip_id,
          position: row.position,
          pinned_at: row.pinned_at,
          updated_at: row.updated_at,
        },
        'id',
        db
      );
    }
  });
}
