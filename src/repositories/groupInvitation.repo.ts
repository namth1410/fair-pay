// Group invitation repository — read invitations từ SQLite local.
// Server cột: invited_email, invited_user_id, invited_by, responded_at.

import type { GroupInvitationRow } from '../types/database.types';
import { getDatabase, upsertRow } from './_shared';

export interface GroupInvitation {
  id: string;
  groupId: string;
  invitedEmail: string;
  invitedUserId: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
}

function mapRow(row: GroupInvitationRow): GroupInvitation {
  return {
    id: row.id,
    groupId: row.group_id,
    invitedEmail: row.invited_email,
    invitedUserId: row.invited_user_id,
    invitedBy: row.invited_by,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    respondedAt: row.responded_at,
  };
}

export async function listPendingForUser(
  userId: string
): Promise<GroupInvitation[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<GroupInvitationRow>(
    `SELECT * FROM group_invitations
      WHERE invited_user_id = ? AND status = 'pending'
      ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(mapRow);
}

export async function listForGroup(
  groupId: string,
  status?: 'pending' | 'accepted' | 'declined' | 'revoked'
): Promise<GroupInvitation[]> {
  const db = getDatabase();
  if (status) {
    const rows = await db.getAllAsync<GroupInvitationRow>(
      `SELECT * FROM group_invitations
        WHERE group_id = ? AND status = ?
        ORDER BY created_at DESC`,
      [groupId, status]
    );
    return rows.map(mapRow);
  }
  const rows = await db.getAllAsync<GroupInvitationRow>(
    `SELECT * FROM group_invitations
      WHERE group_id = ?
      ORDER BY created_at DESC`,
    [groupId]
  );
  return rows.map(mapRow);
}

export async function upsertFromServer(
  row: GroupInvitationRow
): Promise<void> {
  await upsertRow('group_invitations', {
    id: row.id,
    group_id: row.group_id,
    invited_email: row.invited_email,
    invited_user_id: row.invited_user_id,
    invited_by: row.invited_by,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    responded_at: row.responded_at,
  });
}
