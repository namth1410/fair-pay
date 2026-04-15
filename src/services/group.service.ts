import { supabase } from '../config/supabase';
import { computeBalances as computeBalancesPure, type ExpenseData, type PaymentData } from '../utils/balance';
import { logAction } from './audit.service';

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
  owner_id: string;
  invite_code: string;
  created_at: string;
  deleted_at: string | null;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  role: 'owner' | 'admin' | 'member';
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

  // Get group IDs the user is a member of
  const { data: memberships, error: memErr } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

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

  // Count members per group
  const { data: counts, error: cntErr } = await supabase
    .from('group_members')
    .select('group_id')
    .in('group_id', groupIds);

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

/** Create a new group — caller becomes owner */
export async function createGroup(name: string): Promise<Group> {
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
    .insert({ name, owner_id: userId })
    .select()
    .single();

  if (grpErr) throw grpErr;

  // Add creator as owner member
  const { error: memErr } = await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: userId,
    display_name: user?.display_name || 'Chủ nhóm',
    role: 'owner',
  });

  if (memErr) throw memErr;

  return group;
}

/**
 * BR-09: Tạo join request thay vì join trực tiếp.
 * Mọi trường hợp (kể cả rejoin) đều cần Owner/Admin duyệt.
 * Dùng upsert để handle: first-time, rejoin, re-request sau rejection.
 */
export async function joinGroupByCode(code: string): Promise<JoinResult> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  // Tìm group theo invite code
  const { data: group, error: grpErr } = await supabase
    .from('groups')
    .select('*')
    .eq('invite_code', code.trim().toLowerCase())
    .is('deleted_at', null)
    .single();

  if (grpErr || !group) throw new Error('Mã mời không hợp lệ');

  // Nếu đang là active member → không cần join lại
  const { data: activeMember } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();

  if (activeMember) throw new Error('Bạn đã là thành viên nhóm này');

  // Lấy display_name của user
  const { data: user } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .single();
  const displayName = user?.display_name || 'Thành viên';

  // Upsert join_request (handle: first-time, rejoin, re-request sau rejection)
  const { data: request, error: reqErr } = await supabase
    .from('join_requests')
    .upsert(
      {
        group_id: group.id,
        user_id: userId,
        status: 'pending',
        display_name: displayName,
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'group_id,user_id' }
    )
    .select('id')
    .single();

  if (reqErr) throw reqErr;
  return { type: 'pending', group, requestId: request.id };
}

/** F-23: Lấy danh sách join requests đang pending của một nhóm (cho Owner/Admin) */
export async function fetchPendingJoinRequests(
  groupId: string
): Promise<JoinRequest[]> {
  const { data, error } = await supabase
    .from('join_requests')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/** F-23: Owner/Admin duyệt join request → thêm vào group_members */
export async function approveJoinRequest(
  requestId: string,
  groupId: string
): Promise<void> {
  const reviewerId = await getAuthUserId();
  if (!reviewerId) throw new Error('Chưa đăng nhập');

  // Fetch request
  const { data: req, error: fetchErr } = await supabase
    .from('join_requests')
    .select('user_id, display_name')
    .eq('id', requestId)
    .eq('status', 'pending')
    .single();
  if (fetchErr || !req) throw new Error('Yêu cầu không tồn tại hoặc đã được xử lý');

  // Kiểm tra xem user có record cũ không (đã từng là member, đã rời)
  const { data: oldMember } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', req.user_id)
    .not('left_at', 'is', null)
    .maybeSingle();

  if (oldMember) {
    // Rejoin: reset left_at, giữ nguyên member ID → kế thừa lịch sử (BR-04)
    const { error: rejoinErr } = await supabase
      .from('group_members')
      .update({ left_at: null })
      .eq('id', oldMember.id);
    if (rejoinErr) throw rejoinErr;
  } else {
    // New member: insert
    const { error: memErr } = await supabase.from('group_members').insert({
      group_id: groupId,
      user_id: req.user_id,
      display_name: req.display_name,
      role: 'member',
    });
    // code 23505 = duplicate key — user đã được duyệt bởi admin khác (race condition)
    if (memErr && memErr.code !== '23505') throw memErr;
  }

  // Đánh dấu approved
  await supabase
    .from('join_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  await logAction({
    groupId,
    action: 'member.join_approved',
    targetId: req.user_id,
    afterData: { display_name: req.display_name, request_id: requestId },
  });
}

/** F-23: Owner/Admin từ chối join request */
export async function rejectJoinRequest(
  requestId: string,
  groupId: string
): Promise<void> {
  const reviewerId = await getAuthUserId();
  if (!reviewerId) throw new Error('Chưa đăng nhập');

  const { error } = await supabase
    .from('join_requests')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending');

  if (error) throw error;

  await logAction({
    groupId,
    action: 'member.join_rejected',
    targetId: requestId,
  });
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
    .order('role', { ascending: true }) // owner first
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
 * Update a member's role (owner only).
 * Max 1 admin per group — throws if promoting to admin when one already exists.
 */
export async function updateMemberRole(
  memberId: string,
  newRole: 'admin' | 'member'
): Promise<void> {
  if (newRole === 'admin') {
    // Lấy group_id của member này
    const { data: member } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('id', memberId)
      .single();

    if (member) {
      const { count } = await supabase
        .from('group_members')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', member.group_id)
        .eq('role', 'admin')
        .is('left_at', null);

      if ((count ?? 0) >= 1) {
        throw new Error(
          'Nhóm đã có quản trị viên. Hãy hạ quyền quản trị viên hiện tại trước.'
        );
      }
    }
  }

  const { error } = await supabase
    .from('group_members')
    .update({ role: newRole })
    .eq('id', memberId);

  if (error) throw error;
}

/** Soft-remove a member from group (admin/owner only) — sets left_at */
export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .update({ left_at: new Date().toISOString() })
    .eq('id', memberId);

  if (error) throw error;
}

/** Update group name (admin/owner only) */
export async function updateGroup(
  groupId: string,
  updates: { name?: string }
): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update(updates)
    .eq('id', groupId);

  if (error) throw error;
}

/** Soft delete group (owner only) */
export async function deleteGroup(groupId: string): Promise<void> {
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

  // Tính balance per group
  const groupBalances: Record<string, number> = {};

  for (const trip of trips) {
    const tripExpenses = expenses.filter((e: any) => e.trip_id === trip.id);
    const tripPayments = payments.filter((p: any) => p.trip_id === trip.id);
    const tripMembers = allMembers.filter((m: any) => m.group_id === trip.group_id);

    const expenseData: ExpenseData[] = tripExpenses.map((e: any) => ({
      paidBy: e.paid_by,
      amount: e.amount,
      splits: (e.expense_splits || []).map((s: any) => ({
        memberId: s.member_id,
        amount: s.amount,
      })),
    }));

    const paymentData: PaymentData[] = tripPayments.map((p: any) => ({
      fromMemberId: p.from_member_id,
      toMemberId: p.to_member_id,
      amount: p.amount,
    }));

    const memberList = tripMembers.map((m: any) => ({
      id: m.id,
      displayName: m.display_name,
    }));

    const balances = computeBalancesPure(memberList, expenseData, paymentData);

    const userMemberId = memberIdByGroup[trip.group_id];
    const myBalance = balances.find((b) => b.memberId === userMemberId)?.balance ?? 0;

    groupBalances[trip.group_id] = (groupBalances[trip.group_id] ?? 0) + myBalance;
  }

  const total = Object.values(groupBalances).reduce((sum, b) => sum + b, 0);
  return { total, groupBalances };
}

// ── Helper ──────────────────────────────────
async function getAuthUserId(): Promise<string | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single();

  return data?.id ?? null;
}
