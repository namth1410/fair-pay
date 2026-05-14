import { DISPLAY_NAME_MAX_LENGTH } from '../config/constants';
import { supabase } from '../config/supabase';
import { computeBalances as computeBalancesPure, type ExpenseData, type PaymentData } from '../utils/balance';
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

/** Fetch all groups the current user belongs to */
export async function fetchMyGroups(): Promise<GroupWithMemberCount[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  // Get group IDs the user is an active member of
  const { data: memberships, error: memErr } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .is('left_at', null);

  if (memErr) throw memErr;
  if (!memberships?.length) return [];

  const groupIds = memberships.map((m) => m.group_id);

  // Fetch groups
  const { data: groups, error: grpErr } = await supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (grpErr) throw grpErr;

  // Count active members per group (exclude those who left)
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
}

/** Create a new group — caller becomes admin */
export async function createGroup(name: string): Promise<Group> {
  const nameErr = validateName(name, 'Tên nhóm');
  if (nameErr) throw new Error(nameErr);

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  // Get user display name
  const { data: user } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .single();

  // Create group
  const { data: group, error: grpErr } = await supabase
    .from('groups')
    .insert({ name, created_by: userId })
    .select()
    .single();

  if (grpErr) throw grpErr;

  // Add creator as admin
  const { error: memErr } = await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: userId,
    display_name: user?.display_name || 'Admin',
    role: 'admin',
  });

  if (memErr) throw memErr;

  return group;
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
 */
export async function fetchMyPendingJoinRequests(): Promise<MyPendingJoinRequest[]> {
  const { data, error } = await supabase.rpc('get_my_pending_join_requests');
  if (error) throw error;
  return (data as MyPendingJoinRequest[] | null) ?? [];
}

/** F-23: Lấy danh sách join requests đang pending của một nhóm (cho Admin) */
export async function fetchPendingJoinRequests(
  groupId: string
): Promise<JoinRequest[]> {
  await assertRole(groupId, ['admin']);

  const { data, error } = await supabase
    .from('join_requests')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
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
 * Chỉ admin tạo được. Cho phép trùng display_name.
 */
export async function addVirtualMember(
  groupId: string,
  displayName: string
): Promise<GroupMember> {
  await assertRole(groupId, ['admin']);

  const nameErr = validateName(displayName, 'Tên thành viên');
  if (nameErr) throw new Error(nameErr);

  const { data, error } = await supabase
    .from('group_members')
    .insert({
      group_id: groupId,
      user_id: null,
      display_name: displayName,
      role: 'member',
      is_virtual: true,
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
  const { data, error } = await supabase.rpc('get_pending_invitations_for_group', {
    p_group_id: groupId,
  });
  if (error) throw error;
  return (data as GroupInvitation[] | null) ?? [];
}

/** User xem các invitation pending dành cho mình (Home banner + dialog confirm). */
export async function fetchMyPendingInvitations(): Promise<MyPendingInvitation[]> {
  const { data, error } = await supabase.rpc('get_my_pending_invitations');
  if (error) throw error;
  return (data as MyPendingInvitation[] | null) ?? [];
}

/** Fetch active members of a group (left_at IS NULL) */
export async function fetchGroupMembers(
  groupId: string
): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .is('left_at', null)
    .order('role', { ascending: true }) // admin first
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return data || [];
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
export async function removeMember(memberId: string): Promise<void> {
  const { data: target } = await supabase
    .from('group_members')
    .select('group_id, role')
    .eq('id', memberId)
    .single();

  if (!target) throw new Error('Thành viên không tồn tại');
  if (target.role === 'admin')
    throw new Error('Admin không thể rời/bị xóa khỏi nhóm. Hãy xóa nhóm thay thế.');

  await assertRole(target.group_id, ['admin']);

  const { error } = await supabase
    .from('group_members')
    .update({ left_at: new Date().toISOString() })
    .eq('id', memberId);

  if (error) throw error;
}

/**
 * Rename a member's display_name (admin only).
 * Áp dụng cho cả member thật và member ảo. KHÔNG đổi tên cho member đã rời.
 */
export async function renameMember(
  memberId: string,
  newDisplayName: string
): Promise<void> {
  const { data: target } = await supabase
    .from('group_members')
    .select('group_id, display_name, left_at')
    .eq('id', memberId)
    .single();

  if (!target) throw new Error('Thành viên không tồn tại');
  if (target.left_at)
    throw new Error('Không thể đổi tên thành viên đã rời nhóm');

  await assertRole(target.group_id, ['admin']);

  const trimmed = newDisplayName.trim();
  const nameErr = validateName(trimmed, 'Tên thành viên');
  if (nameErr) throw new Error(nameErr);
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`Tên thành viên không được quá ${DISPLAY_NAME_MAX_LENGTH} ký tự`);
  }
  if (trimmed === target.display_name) return; // no-op nếu trùng tên cũ

  const { error } = await supabase
    .from('group_members')
    .update({ display_name: trimmed })
    .eq('id', memberId);

  if (error) throw error;

  await logAction({
    groupId: target.group_id,
    action: 'member.rename',
    targetId: memberId,
    beforeData: { display_name: target.display_name },
    afterData: { display_name: trimmed },
  });
}

/** Update group name (admin only) */
export async function updateGroup(
  groupId: string,
  updates: { name?: string }
): Promise<void> {
  await assertRole(groupId, ['admin']);

  const { error } = await supabase
    .from('groups')
    .update(updates)
    .eq('id', groupId);

  if (error) throw error;
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

/** Soft delete group (admin only) */
export async function deleteGroup(groupId: string): Promise<void> {
  await assertRole(groupId, ['admin']);

  const { error } = await supabase
    .from('groups')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', groupId);

  if (error) throw error;
}

/**
 * F-22 / BR-10: Tính số dư của user trên tất cả chuyến đang mở.
 * Trả về: tổng balance + balance riêng từng group.
 * Dùng 4 queries song song — không thêm query N+1.
 */
export async function fetchUserBalanceSummary(): Promise<BalanceSummary> {
  const userId = await getAuthUserId();
  if (!userId) return { total: 0, groupBalances: {} };

  // Query 1: group_member records của user (memberId per group)
  const { data: memberships } = await supabase
    .from('group_members')
    .select('id, group_id')
    .eq('user_id', userId)
    .is('left_at', null);

  if (!memberships?.length) return { total: 0, groupBalances: {} };

  const memberIdByGroup: Record<string, string> = {};
  const groupIds: string[] = [];
  memberships.forEach((m) => {
    memberIdByGroup[m.group_id] = m.id;
    groupIds.push(m.group_id);
  });

  // Query 2–4: song song
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

  const trips = tripsRes.data || [];
  if (!trips.length) return { total: 0, groupBalances: {} };

  const tripIds = trips.map((t) => t.id);

  // Query 3–4: expenses + payments (song song)
  const [expensesRes, paymentsRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('trip_id, paid_by, amount, expense_splits(member_id, amount)')
      .in('trip_id', tripIds)
      .is('deleted_at', null),
    supabase
      .from('payments')
      .select('trip_id, from_member_id, to_member_id, amount')
      .in('trip_id', tripIds)
      .is('deleted_at', null),
  ]);

  const expenses = expensesRes.data || [];
  const payments = paymentsRes.data || [];
  const allMembers = allMembersRes.data || [];

  // Pre-index by trip_id / group_id for O(1) lookup instead of O(N) filter per trip
  const expensesByTrip = new Map<string, typeof expenses>();
  for (const e of expenses) {
    const key = e.trip_id as string;
    const arr = expensesByTrip.get(key) || [];
    arr.push(e);
    expensesByTrip.set(key, arr);
  }
  const paymentsByTrip = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = p.trip_id as string;
    const arr = paymentsByTrip.get(key) || [];
    arr.push(p);
    paymentsByTrip.set(key, arr);
  }
  const membersByGroup = new Map<string, typeof allMembers>();
  for (const m of allMembers) {
    const key = m.group_id as string;
    const arr = membersByGroup.get(key) || [];
    arr.push(m);
    membersByGroup.set(key, arr);
  }

  // Tính balance per group
  const groupBalances: Record<string, number> = {};

  for (const trip of trips) {
    const tripExpenses = expensesByTrip.get(trip.id) || [];
    const tripPayments = paymentsByTrip.get(trip.id) || [];
    const tripMembers = membersByGroup.get(trip.group_id) || [];

    const expenseData: ExpenseData[] = tripExpenses.map((e) => ({
      paidBy: e.paid_by as string,
      amount: e.amount as number,
      splits: ((e.expense_splits as { member_id: string; amount: number }[]) || []).map((s) => ({
        memberId: s.member_id,
        amount: s.amount,
      })),
    }));

    const paymentData: PaymentData[] = tripPayments.map((p) => ({
      fromMemberId: p.from_member_id as string,
      toMemberId: p.to_member_id as string,
      amount: p.amount as number,
    }));

    const memberList = tripMembers.map((m) => ({
      id: m.id as string,
      displayName: m.display_name as string,
    }));

    const balances = computeBalancesPure(memberList, expenseData, paymentData);

    const userMemberId = memberIdByGroup[trip.group_id];
    const myBalance = balances.find((b) => b.memberId === userMemberId)?.balance ?? 0;

    groupBalances[trip.group_id] = (groupBalances[trip.group_id] ?? 0) + myBalance;
  }

  const total = Object.values(groupBalances).reduce((sum, b) => sum + b, 0);
  return { total, groupBalances };
}

// ── Helpers ─────────────────────────────────
export type Role = 'admin' | 'member';

/** Assert that the current user has one of the allowed roles in the group */
export async function assertRole(
  groupId: string,
  allowed: Role[]
): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .is('left_at', null)
    .single();

  if (!data || !allowed.includes(data.role as Role)) {
    throw new Error('Bạn không có quyền thực hiện hành động này');
  }
}
