import { supabase } from '../config/supabase';

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
}

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

/** Join a group by invite code */
export async function joinGroupByCode(code: string): Promise<Group> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  // Find group by invite code
  const { data: group, error: grpErr } = await supabase
    .from('groups')
    .select('*')
    .eq('invite_code', code.trim().toLowerCase())
    .is('deleted_at', null)
    .single();

  if (grpErr || !group) throw new Error('Mã mời không hợp lệ');

  // Check if already a member
  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) throw new Error('Bạn đã là thành viên nhóm này');

  // Get user display name
  const { data: user } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .single();

  // Insert as member
  const { error: memErr } = await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: userId,
    display_name: user?.display_name || 'Thành viên',
    role: 'member',
  });

  if (memErr) throw memErr;

  return group;
}

/** Fetch members of a group */
export async function fetchGroupMembers(
  groupId: string
): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('role', { ascending: true }) // owner first
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/** Update a member's role (admin/owner only) */
export async function updateMemberRole(
  memberId: string,
  newRole: 'admin' | 'member'
): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .update({ role: newRole })
    .eq('id', memberId);

  if (error) throw error;
}

/** Remove a member from group (admin/owner only) */
export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
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
