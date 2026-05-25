// Audit log repository — read audit_logs từ SQLite local. Append-only.

import type { AuditLogRow } from '../types/database.types';
import { getDatabase, safeJsonParse, upsertRow } from './_shared';

export interface AuditLog {
  id: string;
  groupId: string;
  tripId: string | null;
  action: string;
  actorId: string;
  targetId: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  clientCreatedAt: string | null;
  createdAt: string;
}

function mapRow(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    groupId: row.group_id,
    tripId: row.trip_id,
    action: row.action,
    actorId: row.actor_id,
    targetId: row.target_id,
    beforeData: safeJsonParse<Record<string, unknown> | null>(
      row.before_data,
      null
    ),
    afterData: safeJsonParse<Record<string, unknown> | null>(
      row.after_data,
      null
    ),
    clientCreatedAt: row.client_created_at,
    createdAt: row.created_at,
  };
}

// UI sort theo COALESCE(client_created_at, created_at) — chronological đúng cả
// khi user offline replay queue trễ.

export async function listByGroup(
  groupId: string,
  limit = 200
): Promise<AuditLog[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<AuditLogRow>(
    `SELECT * FROM audit_logs
      WHERE group_id = ?
      ORDER BY COALESCE(client_created_at, created_at) DESC
      LIMIT ?`,
    [groupId, limit]
  );
  return rows.map(mapRow);
}

export async function listByTrip(
  tripId: string,
  limit = 200
): Promise<AuditLog[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<AuditLogRow>(
    `SELECT * FROM audit_logs
      WHERE trip_id = ?
      ORDER BY COALESCE(client_created_at, created_at) DESC
      LIMIT ?`,
    [tripId, limit]
  );
  return rows.map(mapRow);
}

export async function upsertFromServer(row: AuditLogRow): Promise<void> {
  await upsertRow('audit_logs', {
    id: row.id,
    group_id: row.group_id,
    trip_id: row.trip_id,
    action: row.action,
    actor_id: row.actor_id,
    target_id: row.target_id,
    before_data:
      typeof row.before_data === 'object' && row.before_data !== null
        ? JSON.stringify(row.before_data)
        : row.before_data,
    after_data:
      typeof row.after_data === 'object' && row.after_data !== null
        ? JSON.stringify(row.after_data)
        : row.after_data,
    client_created_at: row.client_created_at,
    created_at: row.created_at,
  });
}

/**
 * Dọn audit_logs local > 90 ngày để giữ storage SQLite gọn.
 * Server vẫn giữ đầy đủ — chỉ trim local mirror.
 */
export async function pruneOld(olderThanDays = 90): Promise<number> {
  const db = getDatabase();
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 3600 * 1000
  ).toISOString();
  const result = await db.runAsync(
    `DELETE FROM audit_logs WHERE created_at < ?`,
    [cutoff]
  );
  return result.changes;
}
