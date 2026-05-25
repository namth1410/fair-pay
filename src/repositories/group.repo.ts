// Group repository — read groups + balance summary từ SQLite local.

import type { GroupRow } from '../types/database.types';
import { getDatabase, upsertRow } from './_shared';

export interface Group {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdBy: string;
  inviteCode: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdBy: row.created_by,
    inviteCode: row.invite_code,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getById(id: string): Promise<Group | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<GroupRow>(
    'SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? mapRow(row) : null;
}

/** Get group bất kể deleted (cho UI history / audit). */
export async function getByIdIncludingDeleted(id: string): Promise<Group | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<GroupRow>(
    'SELECT * FROM groups WHERE id = ?',
    [id]
  );
  return row ? mapRow(row) : null;
}

/**
 * List groups user là member (joining group_members).
 * SQL: groups JOIN group_members ON groups.id = group_members.group_id
 * WHERE group_members.user_id = ? AND group_members.left_at IS NULL
 *   AND groups.deleted_at IS NULL
 */
export async function listForUser(userId: string): Promise<Group[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<GroupRow>(
    `SELECT g.* FROM groups g
       INNER JOIN group_members m ON m.group_id = g.id
      WHERE m.user_id = ?
        AND m.left_at IS NULL
        AND g.deleted_at IS NULL
      ORDER BY g.created_at DESC`,
    [userId]
  );
  return rows.map(mapRow);
}

/**
 * Lookup group bằng invite_code (cho join flow — chỉ active groups).
 */
export async function getByInviteCode(code: string): Promise<Group | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<GroupRow>(
    'SELECT * FROM groups WHERE invite_code = ? AND deleted_at IS NULL',
    [code]
  );
  return row ? mapRow(row) : null;
}

export async function upsertFromServer(row: GroupRow): Promise<void> {
  await upsertRow('groups', {
    id: row.id,
    name: row.name,
    avatar_url: row.avatar_url,
    created_by: row.created_by,
    invite_code: row.invite_code,
    version: row.version,
    client_request_id: row.client_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  });
}
