// Group member repository — read members + roles từ SQLite local.

import type { GroupMemberRow } from '../types/database.types';
import { getDatabase, upsertRow } from './_shared';

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string | null; // null cho virtual member
  displayName: string;
  role: 'admin' | 'member';
  isVirtual: boolean;
  version: number;
  joinedAt: string;
  updatedAt: string;
  leftAt: string | null;
}

function mapRow(row: GroupMemberRow): GroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    isVirtual: !!row.is_virtual,
    version: row.version,
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
    leftAt: row.left_at,
  };
}

export async function getById(id: string): Promise<GroupMember | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<GroupMemberRow>(
    'SELECT * FROM group_members WHERE id = ?',
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function listActiveByGroup(
  groupId: string
): Promise<GroupMember[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<GroupMemberRow>(
    `SELECT * FROM group_members
      WHERE group_id = ? AND left_at IS NULL
      ORDER BY joined_at ASC`,
    [groupId]
  );
  return rows.map(mapRow);
}

/** Includes left members (cho history/audit display). */
export async function listAllByGroup(groupId: string): Promise<GroupMember[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<GroupMemberRow>(
    `SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at ASC`,
    [groupId]
  );
  return rows.map(mapRow);
}

export async function findMembership(
  groupId: string,
  userId: string
): Promise<GroupMember | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<GroupMemberRow>(
    `SELECT * FROM group_members
      WHERE group_id = ? AND user_id = ? AND left_at IS NULL
      LIMIT 1`,
    [groupId, userId]
  );
  return row ? mapRow(row) : null;
}

export async function getRole(
  groupId: string,
  userId: string
): Promise<'admin' | 'member' | null> {
  const m = await findMembership(groupId, userId);
  return m?.role ?? null;
}

export async function isAdmin(
  groupId: string,
  userId: string
): Promise<boolean> {
  return (await getRole(groupId, userId)) === 'admin';
}

export async function listActiveMembershipsForUser(
  userId: string
): Promise<GroupMember[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<GroupMemberRow>(
    `SELECT * FROM group_members
      WHERE user_id = ? AND left_at IS NULL
      ORDER BY joined_at DESC`,
    [userId]
  );
  return rows.map(mapRow);
}

export async function upsertFromServer(row: GroupMemberRow): Promise<void> {
  await upsertRow('group_members', {
    id: row.id,
    group_id: row.group_id,
    user_id: row.user_id,
    display_name: row.display_name,
    role: row.role,
    is_virtual: row.is_virtual,
    version: row.version,
    client_request_id: row.client_request_id,
    joined_at: row.joined_at,
    updated_at: row.updated_at,
    left_at: row.left_at,
  });
}
