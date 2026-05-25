// Payment repository — read payments từ SQLite local.

import type { PaymentRow } from '../types/database.types';
import { getDatabase, upsertRow } from './_shared';

export interface Payment {
  id: string;
  tripId: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  note: string | null;
  recordedBy: string;
  date: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function mapRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    tripId: row.trip_id,
    groupId: row.group_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amount: row.amount,
    note: row.note,
    recordedBy: row.recorded_by,
    date: row.date,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function getById(id: string): Promise<Payment | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<PaymentRow>(
    'SELECT * FROM payments WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function listByTrip(tripId: string): Promise<Payment[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<PaymentRow>(
    `SELECT * FROM payments
      WHERE trip_id = ? AND deleted_at IS NULL
      ORDER BY date DESC, created_at DESC`,
    [tripId]
  );
  return rows.map(mapRow);
}

export async function listByGroup(
  groupId: string,
  limit = 100
): Promise<Payment[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<PaymentRow>(
    `SELECT * FROM payments
      WHERE group_id = ? AND deleted_at IS NULL
      ORDER BY date DESC, created_at DESC
      LIMIT ?`,
    [groupId, limit]
  );
  return rows.map(mapRow);
}

export async function upsertFromServer(row: PaymentRow): Promise<void> {
  await upsertRow('payments', {
    id: row.id,
    trip_id: row.trip_id,
    group_id: row.group_id,
    from_member_id: row.from_member_id,
    to_member_id: row.to_member_id,
    amount: row.amount,
    note: row.note,
    recorded_by: row.recorded_by,
    date: row.date,
    version: row.version,
    client_request_id: row.client_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  });
}
