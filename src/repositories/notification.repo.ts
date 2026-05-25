// Notification repository — read notifications từ SQLite local.

import type { NotificationRow } from '../types/database.types';
import { getDatabase, safeJsonParse, upsertRow } from './_shared';

export interface Notification {
  id: string;
  userId: string;
  groupId: string | null;
  tripId: string | null;
  type: string;
  actorId: string | null;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: NotificationRow & { data: string | object }): Notification {
  const raw = row.data;
  const data =
    typeof raw === 'string'
      ? safeJsonParse<Record<string, unknown>>(raw, {})
      : (raw as Record<string, unknown>) || {};
  return {
    id: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    tripId: row.trip_id,
    type: row.type,
    actorId: row.actor_id,
    title: row.title,
    body: row.body,
    data,
    readAt: row.read_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getById(id: string): Promise<Notification | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<NotificationRow>(
    'SELECT * FROM notifications WHERE id = ?',
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function listForUser(
  userId: string,
  options: { limit?: number; before?: string } = {}
): Promise<Notification[]> {
  const db = getDatabase();
  const limit = options.limit ?? 30;
  if (options.before) {
    const rows = await db.getAllAsync<NotificationRow>(
      `SELECT * FROM notifications
        WHERE user_id = ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?`,
      [userId, options.before, limit]
    );
    return rows.map(mapRow);
  }
  const rows = await db.getAllAsync<NotificationRow>(
    `SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, limit]
  );
  return rows.map(mapRow);
}

export async function countUnread(userId: string): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM notifications
      WHERE user_id = ? AND read_at IS NULL`,
    [userId]
  );
  return row?.c ?? 0;
}

export async function upsertFromServer(row: NotificationRow): Promise<void> {
  await upsertRow('notifications', {
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    trip_id: row.trip_id,
    type: row.type,
    actor_id: row.actor_id,
    title: row.title,
    body: row.body,
    data:
      typeof row.data === 'object' && row.data !== null
        ? JSON.stringify(row.data)
        : row.data,
    read_at: row.read_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}
