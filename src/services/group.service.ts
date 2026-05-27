import { File } from 'expo-file-system';

import { DISPLAY_NAME_MAX_LENGTH } from '../config/constants';
import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import * as groupMemberRepo from '../repositories/groupMember.repo';
import * as userRepo from '../repositories/user.repo';
import { useAppStore } from '../stores/app.store';
import { tryServerThenLocal } from '../sync/fallback';
import {
  cancelStagedGroupAvatar,
  stageGroupAvatar,
} from '../sync/imageStaging';
import * as pendingGroupAvatarUploads from '../sync/pendingGroupAvatarUploads';
import { run as runSync } from '../sync/syncEngine';
import * as syncQueue from '../sync/syncQueue';
import { ENTITY_TYPES, OP_TYPES } from '../sync/types';
import { computeBalances as computeBalancesPure, type ExpenseData, type PaymentData } from '../utils/balance';
import { isNetworkError } from '../utils/network';
import { generatePlaceholderInviteCode } from '../utils/inviteCode';
import { validateEmail, validateName } from '../utils/validate';
import { logAction } from './audit.service';
import { getAuthUserId } from './auth.helper';
import { notifyJoinResolved } from './notification.service';

export interface BalanceSummary {
  /** Tổng số dư qua tất cả nhóm/chuyến đang mở (dương = được nợ, âm = đang nợ) */
  total: number;
  /** Số dư của user trong từng group (groupId → balance) */
  groupBalances: Record<string, number>;
}

export interface Group {
  id: string;
  name: string;
  avatar_url: string | null;
  created_by: string;
  invite_code: string;
  created_at: string;
  deleted_at: string | null;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  role: 'admin' | 'member';
  is_virtual: boolean;
  joined_at: string;
  left_at: string | null;
}

export interface JoinRequest {
  id: string;
  group_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  display_name: string;
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export type JoinResult = { type: 'pending'; group: Group; requestId: string };

export interface GroupWithMemberCount extends Group {
  member_count: number;
}

/**
 * Apply overlay từ pending_group_avatar_uploads — override avatar_url của group:
 * - op='upload' → swap sang local_path (UI hiện ảnh local đang chờ upload).
 * - op='remove' → swap sang null (UI hiện default avatar).
 * Worker sau khi upload/remove thành công sẽ remove pending row → lần fetch kế
 * tiếp không còn overlay → avatar về server URL.
 */
async function overlayPendingAvatars<T extends { id: string; avatar_url: string | null }>(
  groups: T[]
): Promise<T[]> {
  if (groups.length === 0) return groups;
  const pendingMap = await pendingGroupAvatarUploads.listAll();
  if (pendingMap.size === 0) return groups;
  return groups.map((g) => {
    const p = pendingMap.get(g.id);
    if (!p) return g;
    if (p.op === 'upload' && p.local_path) {
      return { ...g, avatar_url: p.local_path };
    }
    if (p.op === 'remove') {
      return { ...g, avatar_url: null };
    }
    return g;
  });
}

/** Fetch all groups the current user belongs to. Fallback SQLite mirror. */
export async function fetchMyGroups(): Promise<GroupWithMemberCount[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const groups = await tryServerThenLocal<GroupWithMemberCount[]>(
    async () => {
      const { data: memberships, error: memErr } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (memErr) throw memErr;
      if (!memberships?.length) return [];

      const groupIds = memberships.map((m) => m.group_id);

      const { data: groups, error: grpErr } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (grpErr) throw grpErr;

      const { data: counts, error: cntErr } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', groupIds)
        .is('left_at', null);

      if (cntErr) throw cntErr;

      const countMap: Record<string, number> = {};
      counts?.forEach((c) => {
        countMap[c.group_id] = (countMap[c.group_id] || 0) + 1;
      });

      return (groups || []).map((g) => ({
        ...g,
        member_count: countMap[g.id] || 0,
      }));
    },
    async () => {
      const db = getDatabase();
      const rows = await db.getAllAsync<Group & { member_count: number }>(
        `SELECT g.*, (
            SELECT COUNT(*) FROM group_members m2
             WHERE m2.group_id = g.id AND m2.left_at IS NULL
          ) AS member_count
         FROM groups g
         INNER JOIN group_members m ON m.group_id = g.id
        WHERE m.user_id = ?
          AND m.left_at IS NULL
          AND g.deleted_at IS NULL
        ORDER BY g.created_at DESC`,
        [userId]
      );
      return rows;
    }
  );

  return overlayPendingAvatars(groups);
}

/**
 * Create a new group — caller becomes admin. Offline-first (P1).
 *
 * RPC `create_group(p_id, p_name, p_admin_member_id, p_client_request_id,
 * p_client_created_at)` atomic + idempotent insert groups + admin group_members.
 * Client gen id + clientRequestId để mirror local an toàn lúc offline.
 *
 * invite_code: server giữ DEFAULT làm source-of-truth. Offline path sinh
 * placeholder prefix "PEND-" → MembersTab detect và hiển thị "Sẽ hiện sau khi
 * đồng bộ"; pullGroups overwrite bằng giá trị thật sau push.
 */
export async function createGroup(name: string): Promise<Group> {
  const nameErr = validateName(name, 'Tên nhóm');
  if (nameErr) throw new Error(nameErr);

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const trimmedName = name.trim();
  const groupId = globalThis.crypto.randomUUID();
  const adminMemberId = globalThis.crypto.randomUUID();
  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();
  const placeholderInviteCode = generatePlaceholderInviteCode();

  const localUser = await userRepo.getById(userId);
  const adminDisplayName = localUser?.displayName?.trim() || 'Admin';

  const enqueueLocal = async (): Promise<Group> => {
    const db = getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO groups
          (id, name, created_by, invite_code, version, client_request_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [groupId, trimmedName, userId, placeholderInviteCode, clientRequestId, clientCreatedAt, clientCreatedAt]
      );
      await db.runAsync(
        `INSERT INTO group_members
          (id, group_id, user_id, display_name, role, is_virtual, version,
           client_request_id, joined_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 0, 1, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [adminMemberId, groupId, userId, adminDisplayName, clientRequestId, clientCreatedAt, clientCreatedAt]
      );
    });
    await syncQueue.enqueue({
      op_type: OP_TYPES.CREATE_GROUP,
      entity_type: ENTITY_TYPES.GROUP,
      entity_id: groupId,
      client_request_id: clientRequestId,
      payload: {
        id: groupId,
        name: trimmedName,
        admin_member_id: adminMemberId,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
      },
    });
    return {
      id: groupId,
      name: trimmedName,
      avatar_url: null,
      created_by: userId,
      invite_code: placeholderInviteCode,
      created_at: clientCreatedAt,
      deleted_at: null,
    };
  };

  if (!useAppStore.getState().isOnline) {
    return enqueueLocal();
  }

  try {
    const { data, error } = await supabase.rpc('create_group', {
      p_id: groupId,
      p_name: trimmedName,
      p_admin_member_id: adminMemberId,
      p_client_request_id: clientRequestId,
      p_client_created_at: clientCreatedAt,
    });
    if (error) throw error;
    return data as Group;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[createGroup] network fail, queueing offline');
      return enqueueLocal();
    }
    throw err;
  }
}

/**
 * BR-09: Tạo join request thay vì join trực tiếp.
 * Mọi trường hợp (kể cả rejoin) đều cần Admin duyệt.
 * Dùng upsert để handle: first-time, rejoin, re-request sau rejection.
 */
export async function joinGroupByCode(code: string): Promise<JoinResult> {
  // RPC bypass RLS: non-member không thể tự query `groups` theo invite_code
  // (RLS chỉ cho is_member/created_by SELECT) cũng không tự query admin list để
  // fan-out notify được. RPC làm atomic 4 bước: lookup group + active-member
  // check + upsert pending request + notify admins.
  const { data, error } = await supabase.rpc('request_join_by_code', {
    p_code: code,
  });
  if (error) throw error;

  const payload = data as {
    request_id: string;
    requester_name: string;
    group: Group;
  };

  return { type: 'pending', group: payload.group, requestId: payload.request_id };
}

export interface MyPendingJoinRequest {
  request_id: string;
  group_id: string;
  group_name: string;
  created_at: string;
}

/**
 * Pending join requests của user hiện tại, kèm group_name.
 * RPC SECURITY DEFINER vì non-member không SELECT được `groups.name` qua RLS.
 * Dùng ở Home để render ribbon "ĐANG CHỜ DUYỆT" — persist qua logout/login.
 *
 * Offline: `join_requests` không mirror local → trả `[]`. Ribbon sẽ ẩn cho tới
 * khi online lại (acceptable: user không thể tạo join request mới khi offline).
 */
export async function fetchMyPendingJoinRequests(): Promise<MyPendingJoinRequest[]> {
  return tryServerThenLocal<MyPendingJoinRequest[]>(
    async () => {
      const { data, error } = await supabase.rpc('get_my_pending_join_requests');
      if (error) throw error;
      return (data as MyPendingJoinRequest[] | null) ?? [];
    },
    async () => []
  );
}

/**
 * F-23: Lấy danh sách join requests đang pending của một nhóm (cho Admin).
 * Offline: `join_requests` không mirror local → trả `[]` (admin sẽ thấy lại
 * list khi online; offline cũng không approve/reject được).
 */
export async function fetchPendingJoinRequests(
  groupId: string
): Promise<JoinRequest[]> {
  await assertRole(groupId, ['admin']);

  return tryServerThenLocal<JoinRequest[]>(
    async () => {
      const { data, error } = await supabase
        .from('join_requests')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async () => []
  );
}

/** F-23: Admin duyệt join request → thêm vào group_members */
export async function approveJoinRequest(
  requestId: string,
  groupId: string
): Promise<void> {
  // Pre-fetch group name để RPC render title VN ("Bạn đã được duyệt vào nhóm X")
  const { data: groupRow } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .maybeSingle();

  // RPC approve_join_request: atomic insert/rejoin member + update status + audit + notify
  const { error } = await supabase.rpc('approve_join_request', {
    p_request_id: requestId,
    p_group_id: groupId,
    p_group_name: groupRow?.name ?? '',
  });
  if (error) throw error;
}

/** F-23: Admin từ chối join request */
export async function rejectJoinRequest(
  requestId: string,
  groupId: string
): Promise<void> {
  await assertRole(groupId, ['admin']);

  const reviewerId = await getAuthUserId();
  if (!reviewerId) throw new Error('Chưa đăng nhập');

  // Cần fetch user_id của requester TRƯỚC khi update status (để notify).
  // Bắt buộc filter group_id để chặn cross-tenant reject (admin A reject request của nhóm B).
  const { data: req } = await supabase
    .from('join_requests')
    .select('user_id')
    .eq('id', requestId)
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .maybeSingle();

  const { error } = await supabase
    .from('join_requests')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('group_id', groupId)
    .eq('status', 'pending');

  if (error) throw error;

  await logAction({
    groupId,
    action: 'member.join_rejected',
    targetId: requestId,
  });

  if (req?.user_id) {
    const { data: groupRow } = await supabase
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .single();
    await notifyJoinResolved('member.join_rejected', {
      groupId,
      groupName: groupRow?.name ?? '',
      reviewerId,
      requesterUserId: req.user_id,
    });
  }
}

/**
 * Tạo thành viên ảo (virtual member) — không có user_id, không có auth session.
 * Chỉ admin tạo được. Cho phép trùng display_name. Offline-first: client-gen UUID + queue.
 */
export async function addVirtualMember(
  groupId: string,
  displayName: string
): Promise<GroupMember> {
  await assertRole(groupId, ['admin']);

  const nameErr = validateName(displayName, 'Tên thành viên');
  if (nameErr) throw new Error(nameErr);

  const memberId = globalThis.crypto.randomUUID();
  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<GroupMember> => {
    const db = getDatabase();
    await db.runAsync(
      `INSERT INTO group_members
        (id, group_id, user_id, display_name, role, is_virtual,
         version, client_request_id, joined_at, updated_at)
       VALUES (?, ?, NULL, ?, 'member', 1, 1, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [memberId, groupId, displayName, clientRequestId, now, now]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.ADD_VIRTUAL_MEMBER,
      entity_type: ENTITY_TYPES.GROUP_MEMBER,
      entity_id: memberId,
      client_request_id: clientRequestId,
      payload: {
        id: memberId,
        group_id: groupId,
        display_name: displayName,
        client_request_id: clientRequestId,
        client_created_at: now,
      },
    });
    return {
      id: memberId,
      group_id: groupId,
      user_id: null,
      display_name: displayName,
      role: 'member',
      is_virtual: true,
      joined_at: now,
      left_at: null,
    };
  };

  if (!useAppStore.getState().isOnline) {
    return enqueueLocal();
  }

  try {
    const { data, error } = await supabase
      .from('group_members')
      .insert({
        id: memberId,
        group_id: groupId,
        user_id: null,
        display_name: displayName,
        role: 'member',
        is_virtual: true,
        client_request_id: clientRequestId,
      })
      .select()
      .single();

    if (error) throw error;

    await logAction({
      groupId,
      action: 'member.virtual_add',
      targetId: data.id,
      afterData: { display_name: displayName, is_virtual: true },
    });

    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[addVirtualMember] network fail, queueing offline');
      return enqueueLocal();
    }
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Invitation flow (admin invite by email → user accept/decline → admin revoke).
// Mọi mutation qua RPC SECURITY DEFINER trong supabase/migrations/20260514150100_invite_rpcs.sql.
// ──────────────────────────────────────────────────────────────────────────────

export interface GroupInvitation {
  id: string;
  group_id: string;
  invited_email: string;
  invited_user_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  created_at: string;
  responded_at: string | null;
  invited_display_name?: string;
  invited_photo_url?: string | null;
}

export interface MyPendingInvitation {
  invitation_id: string;
  group_id: string;
  group_name: string;
  group_avatar_url: string | null;
  inviter_name: string;
  created_at: string;
}

/**
 * Admin mời user qua email — tạo invitation pending.
 * Email validate cả client-side (sớm) lẫn server-side (anti-tamper).
 * Server normalize lowercase + trim → đồng bộ ở client để tránh round-trip.
 */
export async function inviteMemberByEmail(
  groupId: string,
  email: string
): Promise<{ invitation_id: string; invited_user_id: string; invited_name: string }> {
  const emailErr = validateEmail(email);
  if (emailErr) throw new Error(emailErr);

  const { data, error } = await supabase.rpc('invite_member_by_email', {
    p_group_id: groupId,
    p_email: email.trim().toLowerCase(),
  });
  if (error) throw error;
  return data as { invitation_id: string; invited_user_id: string; invited_name: string };
}

/**
 * User accept hoặc decline invitation pending của họ.
 * Server tự rejoin nếu user từng là member rồi rời (giữ history).
 */
export async function respondToInvitation(
  invitationId: string,
  action: 'accept' | 'decline'
): Promise<{ group_id: string; group_name: string; status: string }> {
  const { data, error } = await supabase.rpc('respond_to_invitation', {
    p_invitation_id: invitationId,
    p_action: action,
  });
  if (error) throw error;
  return data as { group_id: string; group_name: string; status: string };
}

/** Admin rút lời mời pending. */
export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw error;
}

/** Admin xem danh sách invitations pending của group (kèm display_name/photo của invitee). */
export async function fetchPendingInvitations(
  groupId: string
): Promise<GroupInvitation[]> {
  return tryServerThenLocal<GroupInvitation[]>(
    async () => {
      const { data, error } = await supabase.rpc('get_pending_invitations_for_group', {
        p_group_id: groupId,
      });
      if (error) throw error;
      return (data as GroupInvitation[] | null) ?? [];
    },
    async () => {
      // Local: JOIN group_invitations + users (invitee) để dựng shape có
      // invited_display_name + invited_photo_url như RPC trả về.
      const db = getDatabase();
      const rows = await db.getAllAsync<{
        id: string;
        group_id: string;
        invited_email: string;
        invited_user_id: string;
        invited_by: string;
        status: 'pending' | 'accepted' | 'declined' | 'revoked';
        created_at: string;
        responded_at: string | null;
        invited_display_name: string | null;
        invited_photo_url: string | null;
      }>(
        `SELECT
            inv.id,
            inv.group_id,
            inv.invited_email,
            inv.invited_user_id,
            inv.invited_by,
            inv.status,
            inv.created_at,
            inv.responded_at,
            u.display_name AS invited_display_name,
            u.photo_url    AS invited_photo_url
         FROM group_invitations inv
         LEFT JOIN users u ON u.id = inv.invited_user_id
         WHERE inv.group_id = ?
           AND inv.status = 'pending'
         ORDER BY inv.created_at DESC`,
        [groupId]
      );
      return rows.map((r) => ({
        id: r.id,
        group_id: r.group_id,
        invited_email: r.invited_email,
        invited_user_id: r.invited_user_id,
        invited_by: r.invited_by,
        status: r.status,
        created_at: r.created_at,
        responded_at: r.responded_at,
        invited_display_name: r.invited_display_name ?? undefined,
        invited_photo_url: r.invited_photo_url ?? undefined,
      }));
    }
  );
}

/** User xem các invitation pending dành cho mình (Home banner + dialog confirm). */
export async function fetchMyPendingInvitations(): Promise<MyPendingInvitation[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  return tryServerThenLocal<MyPendingInvitation[]>(
    async () => {
      const { data, error } = await supabase.rpc('get_my_pending_invitations');
      if (error) throw error;
      return (data as MyPendingInvitation[] | null) ?? [];
    },
    async () => {
      // Local: JOIN group_invitations + groups + users (inviter) từ SQLite mirror.
      // Inviter có thể chưa pull về (users table mirror chậm hơn invitations) →
      // fallback empty string. Group avatar có thể NULL như shape gốc.
      const db = getDatabase();
      const rows = await db.getAllAsync<{
        invitation_id: string;
        group_id: string;
        group_name: string;
        group_avatar_url: string | null;
        inviter_name: string | null;
        created_at: string;
      }>(
        `SELECT
            inv.id           AS invitation_id,
            inv.group_id     AS group_id,
            g.name           AS group_name,
            g.avatar_url     AS group_avatar_url,
            u.display_name   AS inviter_name,
            inv.created_at   AS created_at
         FROM group_invitations inv
         INNER JOIN groups g ON g.id = inv.group_id
         LEFT JOIN users u ON u.id = inv.invited_by
         WHERE inv.invited_user_id = ?
           AND inv.status = 'pending'
           AND g.deleted_at IS NULL
         ORDER BY inv.created_at DESC`,
        [userId]
      );
      return rows.map((r) => ({
        invitation_id: r.invitation_id,
        group_id: r.group_id,
        group_name: r.group_name,
        group_avatar_url: r.group_avatar_url,
        inviter_name: r.inviter_name ?? '',
        created_at: r.created_at,
      }));
    }
  );
}

/** Fetch active members of a group (left_at IS NULL). Fallback SQLite mirror. */
export async function fetchGroupMembers(
  groupId: string
): Promise<GroupMember[]> {
  return tryServerThenLocal<GroupMember[]>(
    async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .is('left_at', null)
        .order('role', { ascending: true })
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async () => {
      const db = getDatabase();
      // SQLite is_virtual: 0|1. Service GroupMember type uses boolean → cast.
      const rows = await db.getAllAsync<
        Omit<GroupMember, 'is_virtual'> & { is_virtual: number }
      >(
        `SELECT * FROM group_members
          WHERE group_id = ? AND left_at IS NULL
          ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at ASC`,
        [groupId]
      );
      return rows.map((r) => ({ ...r, is_virtual: !!r.is_virtual }));
    }
  );
}

/** Fetch ALL members including those who left (for historical display) */
export async function fetchAllGroupMembers(
  groupId: string
): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('role', { ascending: true })
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * @deprecated Giữ lại để tương lai build Transfer Admin (atomic swap).
 * Với chính sách "1 admin duy nhất / nhóm", admin hiện tại không thể tự demote
 * và promote người khác (bị chặn bởi invariant 1-admin) → hàm này không gọi được
 * qua UI nữa. Gỡ UI button, giữ signature cho refactor sau.
 */
export async function updateMemberRole(
  memberId: string,
  newRole: 'admin' | 'member'
): Promise<void> {
  const { data: targetMember } = await supabase
    .from('group_members')
    .select('group_id, role')
    .eq('id', memberId)
    .single();

  if (!targetMember) throw new Error('Thành viên không tồn tại');
  await assertRole(targetMember.group_id, ['admin']);

  if (newRole === 'admin') {
    const { count } = await supabase
      .from('group_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', targetMember.group_id)
      .eq('role', 'admin')
      .is('left_at', null);

    if ((count ?? 0) >= 1) {
      throw new Error(
        'Nhóm đã có quản trị viên. Hãy hạ quyền quản trị viên hiện tại trước.'
      );
    }
  }

  const { error } = await supabase
    .from('group_members')
    .update({ role: newRole })
    .eq('id', memberId);

  if (error) throw error;
}

/** Soft-remove a member from group (admin only) — sets left_at */
/**
 * Soft-remove member (set left_at). Offline-first: idempotent soft-delete.
 * Admin chỉ xóa được member (không xóa được admin — invariant 1-admin).
 */
export async function removeMember(memberId: string): Promise<void> {
  const db = getDatabase();
  const local = await db.getFirstAsync<{ group_id: string; role: string; left_at: string | null }>(
    `SELECT group_id, role, left_at FROM group_members WHERE id = ?`,
    [memberId]
  );
  if (!local) throw new Error('Thành viên không tồn tại');
  if (local.role === 'admin') {
    throw new Error('Admin không thể rời/bị xóa khỏi nhóm. Hãy xóa nhóm thay thế.');
  }
  await assertRole(local.group_id, ['admin']);
  if (local.left_at) return; // already removed

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE group_members
          SET left_at = COALESCE(left_at, ?), updated_at = ?
        WHERE id = ?`,
      [now, now, memberId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.REMOVE_MEMBER,
      entity_type: ENTITY_TYPES.GROUP_MEMBER,
      entity_id: memberId,
      client_request_id: clientRequestId,
      payload: {
        member_id: memberId,
        client_request_id: clientRequestId,
        client_created_at: now,
      },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }

  try {
    const { error } = await supabase
      .from('group_members')
      .update({ left_at: now })
      .eq('id', memberId)
      .is('left_at', null);
    if (error) throw error;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[removeMember] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/**
 * Rename a member's display_name (admin only).
 * Áp dụng cho cả member thật và member ảo. KHÔNG đổi tên cho member đã rời.
 */
/**
 * Rename member (admin only). Offline-first: RPC update_member_display_name
 * với optimistic concurrency. Audit logged server-side.
 */
export async function renameMember(
  memberId: string,
  newDisplayName: string
): Promise<void> {
  const db = getDatabase();
  const local = await db.getFirstAsync<{
    group_id: string;
    display_name: string;
    version: number;
    left_at: string | null;
  }>(
    `SELECT group_id, display_name, version, left_at FROM group_members WHERE id = ?`,
    [memberId]
  );
  if (!local) throw new Error('Thành viên không tồn tại');
  if (local.left_at) throw new Error('Không thể đổi tên thành viên đã rời nhóm');
  await assertRole(local.group_id, ['admin']);

  const trimmed = newDisplayName.trim();
  const nameErr = validateName(trimmed, 'Tên thành viên');
  if (nameErr) throw new Error(nameErr);
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`Tên thành viên không được quá ${DISPLAY_NAME_MAX_LENGTH} ký tự`);
  }
  if (trimmed === local.display_name) return;

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE group_members
          SET display_name = ?, version = version + 1, updated_at = ?
        WHERE id = ?`,
      [trimmed, now, memberId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.UPDATE_MEMBER_DISPLAY_NAME,
      entity_type: ENTITY_TYPES.GROUP_MEMBER,
      entity_id: memberId,
      client_request_id: clientRequestId,
      payload: {
        member_id: memberId,
        display_name: trimmed,
        base_version: local.version,
        client_request_id: clientRequestId,
        client_created_at: now,
      },
    });
  };

  const isOnline = useAppStore.getState().isOnline;
  const hasPending = await syncQueue.hasPendingForEntity(ENTITY_TYPES.GROUP_MEMBER, memberId);
  if (!isOnline || hasPending) {
    await enqueueLocal();
    if (isOnline) {
      void runSync().catch(() => {});
    }
    return;
  }

  try {
    const { data, error } = await supabase.rpc('update_member_display_name', {
      p_member_id: memberId,
      p_display_name: trimmed,
      p_base_version: local.version,
      p_client_request_id: clientRequestId,
      p_client_created_at: now,
    });
    if (error) throw error;

    // Write-back local mirror với server's version + updated_at: tránh lần
    // update kế dùng stale base_version → P0410 version_conflict.
    const serverRow = Array.isArray(data) && data.length > 0
      ? (data[0] as { version: number; updated_at: string })
      : null;
    if (serverRow) {
      await db.runAsync(
        `UPDATE group_members SET display_name = ?, version = ?, updated_at = ? WHERE id = ?`,
        [trimmed, serverRow.version, serverRow.updated_at, memberId]
      );
    }
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[renameMember] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

/**
 * Update group name (admin only). Offline-first: dùng RPC update_group với
 * optimistic concurrency (P3 pattern). Conflict → modal.
 */
export async function updateGroup(
  groupId: string,
  updates: { name?: string }
): Promise<void> {
  await assertRole(groupId, ['admin']);
  if (!updates.name) return;

  const db = getDatabase();
  const local = await db.getFirstAsync<{ name: string; version: number }>(
    `SELECT name, version FROM groups WHERE id = ?`,
    [groupId]
  );
  if (!local) throw new Error('Nhóm không tồn tại');
  const trimmed = updates.name.trim();
  if (trimmed === local.name) return;

  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE groups
          SET name = ?, version = version + 1, updated_at = ?
        WHERE id = ?`,
      [trimmed, clientCreatedAt, groupId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.UPDATE_GROUP,
      entity_type: ENTITY_TYPES.GROUP,
      entity_id: groupId,
      client_request_id: clientRequestId,
      payload: {
        group_id: groupId,
        name: trimmed,
        avatar_url: null,
        base_version: local.version,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
      },
    });
  };

  const isOnline = useAppStore.getState().isOnline;
  const hasPending = await syncQueue.hasPendingForEntity(ENTITY_TYPES.GROUP, groupId);
  if (!isOnline || hasPending) {
    await enqueueLocal();
    if (isOnline) {
      void runSync().catch(() => {});
    }
    return;
  }

  try {
    const { data, error } = await supabase.rpc('update_group', {
      p_group_id: groupId,
      p_name: trimmed,
      p_avatar_url: null,
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
        `UPDATE groups SET name = ?, version = ?, updated_at = ? WHERE id = ?`,
        [trimmed, serverRow.version, serverRow.updated_at, groupId]
      );
    }
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[updateGroup] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

// ── Group avatar (R2 upload pipeline) ─────────────
// All three calls hit Supabase Edge Functions; auth is auto-injected by the
// SDK. Errors arrive as `FunctionsHttpError` whose response body has shape
// `{ error: string, retryAfter?: number }` — see invokeAvatarFunction below.

interface AvatarFunctionError {
  error?: string;
  retryAfter?: number;
}

async function invokeAvatarFunction<T>(
  name: 'group-avatar-presign' | 'group-avatar-commit' | 'group-avatar-remove',
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    // The SDK doesn't expose the response body on errors directly; refetch.
    let parsed: AvatarFunctionError | null = null;
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        parsed = (await ctx.json()) as AvatarFunctionError;
      } catch {
        parsed = null;
      }
    }
    if (__DEV__) {
      console.error(`[avatar] ${name} failed:`, {
        rawMessage: error.message,
        status: (error as unknown as { context?: { status?: number } }).context?.status,
        parsedBody: parsed,
      });
    }
    const message = parsed?.error || error.message || 'Lỗi mạng, thử lại sau';
    const wrapped = new Error(message) as Error & { retryAfter?: number };
    if (parsed?.retryAfter) wrapped.retryAfter = parsed.retryAfter;
    throw wrapped;
  }
  return data as T;
}

export async function requestGroupAvatarUploadUrl(
  groupId: string,
  sizeBytes: number
): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string }> {
  return invokeAvatarFunction('group-avatar-presign', { groupId, sizeBytes });
}

export async function commitGroupAvatar(
  groupId: string,
  fileKey: string
): Promise<{ avatar_url: string }> {
  return invokeAvatarFunction('group-avatar-commit', { groupId, fileKey });
}

export async function removeGroupAvatar(groupId: string): Promise<void> {
  await invokeAvatarFunction('group-avatar-remove', { groupId });
}

// ── Offline-first orchestrators ─────────────
// Wrap presign+PUT+commit (upload) hoặc remove Edge Function với offline staging.
// Worker drain pending khi online.

export interface SaveGroupAvatarResult {
  /** URL hiện hành để UI cập nhật ngay (R2 public URL nếu online; file:// nếu pending). */
  avatarUrl: string;
  /** true = đang chờ worker upload R2. */
  pending: boolean;
}

export interface RemoveGroupAvatarResult {
  /** true = đang chờ worker gọi remove Edge Function. */
  pending: boolean;
  /** true = vừa hủy pending upload (revert về avatar server), KHÔNG queue remove. */
  revertedPending: boolean;
}

/**
 * Offline-first: lưu avatar nhóm.
 * - Online OK: upload R2 ngay + UPDATE local groups.avatar_url + trả R2 URL.
 * - Online network fail giữa chừng → stage local + queue → trả local path.
 * - Offline: stage local + queue → trả local path.
 *
 * Quota/permission/size errors (non-network) bubble lên cho UI hiển thị.
 */
export async function saveGroupAvatar(
  groupId: string,
  processed: { uri: string; sizeBytes: number }
): Promise<SaveGroupAvatarResult> {
  await assertRole(groupId, ['admin']);

  const enqueueLocal = async (): Promise<SaveGroupAvatarResult> => {
    const stagedPath = await stageGroupAvatar(
      groupId,
      processed.uri,
      processed.sizeBytes
    );
    return { avatarUrl: stagedPath, pending: true };
  };

  if (!useAppStore.getState().isOnline) {
    return enqueueLocal();
  }

  try {
    const presign = await requestGroupAvatarUploadUrl(
      groupId,
      processed.sizeBytes
    );
    const file = new File(processed.uri);
    const arrayBuffer = await file.arrayBuffer();
    const putRes = await fetch(presign.uploadUrl, {
      method: 'PUT',
      body: arrayBuffer,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    if (!putRes.ok) {
      throw new Error(`Upload thất bại (${putRes.status})`);
    }
    const result = await commitGroupAvatar(groupId, presign.fileKey);

    // Update local mirror để pull lần sau không downgrade (server cũng đã có
    // URL mới; ghi idempotent vào local).
    const db = getDatabase();
    await db.runAsync(
      `UPDATE groups SET avatar_url = ?, updated_at = ? WHERE id = ?`,
      [result.avatar_url, new Date().toISOString(), groupId]
    );
    return { avatarUrl: result.avatar_url, pending: false };
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__)
        console.warn('[saveGroupAvatar] network fail, staging offline');
      return enqueueLocal();
    }
    throw err;
  }
}

/**
 * Offline-first: xóa avatar nhóm.
 * - Đang có pending upload → hủy pending (xóa file local + remove row),
 *   KHÔNG queue remove. UI tự revert về avatar server.
 * - Không có pending + online: gọi Edge Function ngay.
 * - Không có pending + offline (hoặc network fail): queue op='remove'.
 */
export async function removeGroupAvatarOfflineFirst(
  groupId: string
): Promise<RemoveGroupAvatarResult> {
  await assertRole(groupId, ['admin']);

  const existing = await pendingGroupAvatarUploads.getForGroup(groupId);
  if (existing?.op === 'upload') {
    await cancelStagedGroupAvatar(groupId);
    return { pending: false, revertedPending: true };
  }

  const enqueueLocal = async (): Promise<RemoveGroupAvatarResult> => {
    await pendingGroupAvatarUploads.addRemove(groupId);
    return { pending: true, revertedPending: false };
  };

  if (!useAppStore.getState().isOnline) {
    return enqueueLocal();
  }

  try {
    await removeGroupAvatar(groupId);
    const db = getDatabase();
    await db.runAsync(
      `UPDATE groups SET avatar_url = NULL, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), groupId]
    );
    return { pending: false, revertedPending: false };
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__)
        console.warn('[removeGroupAvatarOfflineFirst] network fail, queueing');
      return enqueueLocal();
    }
    throw err;
  }
}

/** Soft delete group (admin only). Offline-first: idempotent. */
export async function deleteGroup(groupId: string): Promise<void> {
  await assertRole(groupId, ['admin']);

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
      `UPDATE groups
          SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?
        WHERE id = ?`,
      [now, now, groupId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.DELETE_GROUP,
      entity_type: ENTITY_TYPES.GROUP,
      entity_id: groupId,
      client_request_id: clientRequestId,
      payload: {
        group_id: groupId,
        client_request_id: clientRequestId,
        client_created_at: now,
      },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }

  try {
    const { error } = await supabase
      .from('groups')
      .update({ deleted_at: now })
      .eq('id', groupId)
      .is('deleted_at', null);
    if (error) throw error;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[deleteGroup] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

interface BalanceInput {
  memberIdByGroup: Record<string, string>;
  trips: { id: string; group_id: string }[];
  allMembers: { id: string; group_id: string; display_name: string }[];
  expenses: {
    id: string;
    trip_id: string;
    paid_by: string;
    amount: number;
    splits: { member_id: string; amount: number }[];
  }[];
  payments: {
    trip_id: string;
    from_member_id: string;
    to_member_id: string;
    amount: number;
  }[];
}

/**
 * Pure compute: pre-index + iterate trips → tính balance của user trong từng group.
 * Tách riêng để server path (Supabase fetch) + local path (SQLite) dùng chung.
 */
function aggregateBalanceSummary(input: BalanceInput): BalanceSummary {
  const expensesByTrip = new Map<string, BalanceInput['expenses']>();
  for (const e of input.expenses) {
    const arr = expensesByTrip.get(e.trip_id) || [];
    arr.push(e);
    expensesByTrip.set(e.trip_id, arr);
  }
  const paymentsByTrip = new Map<string, BalanceInput['payments']>();
  for (const p of input.payments) {
    const arr = paymentsByTrip.get(p.trip_id) || [];
    arr.push(p);
    paymentsByTrip.set(p.trip_id, arr);
  }
  const membersByGroup = new Map<string, BalanceInput['allMembers']>();
  for (const m of input.allMembers) {
    const arr = membersByGroup.get(m.group_id) || [];
    arr.push(m);
    membersByGroup.set(m.group_id, arr);
  }

  const groupBalances: Record<string, number> = {};
  for (const trip of input.trips) {
    const tripExpenses = expensesByTrip.get(trip.id) || [];
    const tripPayments = paymentsByTrip.get(trip.id) || [];
    const tripMembers = membersByGroup.get(trip.group_id) || [];

    const expenseData: ExpenseData[] = tripExpenses.map((e) => ({
      paidBy: e.paid_by,
      amount: e.amount,
      splits: e.splits.map((s) => ({ memberId: s.member_id, amount: s.amount })),
    }));
    const paymentData: PaymentData[] = tripPayments.map((p) => ({
      fromMemberId: p.from_member_id,
      toMemberId: p.to_member_id,
      amount: p.amount,
    }));
    const memberList = tripMembers.map((m) => ({
      id: m.id,
      displayName: m.display_name,
    }));

    const balances = computeBalancesPure(memberList, expenseData, paymentData);
    const userMemberId = input.memberIdByGroup[trip.group_id];
    const myBalance = balances.find((b) => b.memberId === userMemberId)?.balance ?? 0;
    groupBalances[trip.group_id] = (groupBalances[trip.group_id] ?? 0) + myBalance;
  }

  const total = Object.values(groupBalances).reduce((sum, b) => sum + b, 0);
  return { total, groupBalances };
}

/**
 * F-22 / BR-10: Tính số dư của user trên tất cả chuyến đang mở.
 * Trả về: tổng balance + balance riêng từng group.
 * Online: 4 queries song song qua Supabase. Offline: same shape từ SQLite mirror.
 */
export async function fetchUserBalanceSummary(): Promise<BalanceSummary> {
  const userId = await getAuthUserId();
  if (!userId) return { total: 0, groupBalances: {} };

  return tryServerThenLocal<BalanceSummary>(
    async () => {
      // Query 1: group_member records của user (memberId per group)
      const { data: memberships, error: memErr } = await supabase
        .from('group_members')
        .select('id, group_id')
        .eq('user_id', userId)
        .is('left_at', null);
      if (memErr) throw memErr;
      if (!memberships?.length) return { total: 0, groupBalances: {} };

      const memberIdByGroup: Record<string, string> = {};
      const groupIds: string[] = [];
      memberships.forEach((m) => {
        memberIdByGroup[m.group_id] = m.id;
        groupIds.push(m.group_id);
      });

      // Query 2 + 3 song song: open trips + all active members per group
      const [tripsRes, allMembersRes] = await Promise.all([
        supabase
          .from('trips')
          .select('id, group_id')
          .in('group_id', groupIds)
          .eq('status', 'open')
          .is('deleted_at', null),
        supabase
          .from('group_members')
          .select('id, group_id, display_name')
          .in('group_id', groupIds)
          .is('left_at', null),
      ]);
      if (tripsRes.error) throw tripsRes.error;
      if (allMembersRes.error) throw allMembersRes.error;

      const trips = tripsRes.data || [];
      if (!trips.length) return { total: 0, groupBalances: {} };
      const tripIds = trips.map((t) => t.id);

      // Query 4 + 5 song song: expenses (với nested splits) + payments
      const [expensesRes, paymentsRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('id, trip_id, paid_by, amount, expense_splits(member_id, amount)')
          .in('trip_id', tripIds)
          .is('deleted_at', null),
        supabase
          .from('payments')
          .select('trip_id, from_member_id, to_member_id, amount')
          .in('trip_id', tripIds)
          .is('deleted_at', null),
      ]);
      if (expensesRes.error) throw expensesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const expenses = (expensesRes.data || []).map((e) => ({
        id: e.id as string,
        trip_id: e.trip_id as string,
        paid_by: e.paid_by as string,
        amount: e.amount as number,
        splits:
          ((e.expense_splits as { member_id: string; amount: number }[]) || []).map(
            (s) => ({ member_id: s.member_id, amount: s.amount })
          ),
      }));

      return aggregateBalanceSummary({
        memberIdByGroup,
        trips: trips.map((t) => ({ id: t.id as string, group_id: t.group_id as string })),
        allMembers: (allMembersRes.data || []).map((m) => ({
          id: m.id as string,
          group_id: m.group_id as string,
          display_name: m.display_name as string,
        })),
        expenses,
        payments: (paymentsRes.data || []).map((p) => ({
          trip_id: p.trip_id as string,
          from_member_id: p.from_member_id as string,
          to_member_id: p.to_member_id as string,
          amount: p.amount as number,
        })),
      });
    },
    async () => {
      const db = getDatabase();
      const memberships = await db.getAllAsync<{ id: string; group_id: string }>(
        `SELECT id, group_id FROM group_members
          WHERE user_id = ? AND left_at IS NULL`,
        [userId]
      );
      if (!memberships.length) return { total: 0, groupBalances: {} };

      const memberIdByGroup: Record<string, string> = {};
      const groupIds: string[] = [];
      memberships.forEach((m) => {
        memberIdByGroup[m.group_id] = m.id;
        groupIds.push(m.group_id);
      });

      const groupPh = groupIds.map(() => '?').join(',');
      const [trips, allMembers] = await Promise.all([
        db.getAllAsync<{ id: string; group_id: string }>(
          `SELECT id, group_id FROM trips
            WHERE group_id IN (${groupPh})
              AND status = 'open'
              AND deleted_at IS NULL`,
          groupIds
        ),
        db.getAllAsync<{ id: string; group_id: string; display_name: string }>(
          `SELECT id, group_id, display_name FROM group_members
            WHERE group_id IN (${groupPh}) AND left_at IS NULL`,
          groupIds
        ),
      ]);
      if (!trips.length) return { total: 0, groupBalances: {} };

      const tripIds = trips.map((t) => t.id);
      const tripPh = tripIds.map(() => '?').join(',');

      const [expenseRows, splitRows, payments] = await Promise.all([
        db.getAllAsync<{ id: string; trip_id: string; paid_by: string; amount: number }>(
          `SELECT id, trip_id, paid_by, amount FROM expenses
            WHERE trip_id IN (${tripPh}) AND deleted_at IS NULL`,
          tripIds
        ),
        db.getAllAsync<{ expense_id: string; member_id: string; amount: number }>(
          `SELECT s.expense_id, s.member_id, s.amount
             FROM expense_splits s
             INNER JOIN expenses e ON e.id = s.expense_id
            WHERE e.trip_id IN (${tripPh}) AND e.deleted_at IS NULL`,
          tripIds
        ),
        db.getAllAsync<{
          trip_id: string;
          from_member_id: string;
          to_member_id: string;
          amount: number;
        }>(
          `SELECT trip_id, from_member_id, to_member_id, amount FROM payments
            WHERE trip_id IN (${tripPh}) AND deleted_at IS NULL`,
          tripIds
        ),
      ]);

      // Group splits by expense_id (server returned nested expense_splits qua join)
      const splitsByExpense = new Map<string, { member_id: string; amount: number }[]>();
      for (const s of splitRows) {
        const arr = splitsByExpense.get(s.expense_id) || [];
        arr.push({ member_id: s.member_id, amount: s.amount });
        splitsByExpense.set(s.expense_id, arr);
      }
      const expenses = expenseRows.map((e) => ({
        id: e.id,
        trip_id: e.trip_id,
        paid_by: e.paid_by,
        amount: e.amount,
        splits: splitsByExpense.get(e.id) || [],
      }));

      return aggregateBalanceSummary({
        memberIdByGroup,
        trips,
        allMembers,
        expenses,
        payments,
      });
    }
  );
}

// ── Helpers ─────────────────────────────────
export type Role = 'admin' | 'member';

/**
 * Assert user has one of `allowed` roles. Local-only — đọc role từ SQLite mirror,
 * KHÔNG gọi server. Đây là UX layer fail-fast; server `is_admin()`/`is_member()`
 * SECURITY DEFINER ở mỗi RPC mới là security thật sự.
 *
 * Assumption: admin role STATIC (1 admin/nhóm, không tự rời/bị xóa).
 * Revisit khi thêm Transfer Admin: cần đảm bảo local mirror sync kịp hoặc
 * refresh local check on online.
 */
export async function assertRole(
  groupId: string,
  allowed: Role[]
): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const role = await groupMemberRepo.getRole(groupId, userId);
  if (!role || !allowed.includes(role)) {
    throw new Error('Bạn không có quyền thực hiện hành động này');
  }
}
