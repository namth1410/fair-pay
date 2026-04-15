import { create } from 'zustand';

import {
  approveJoinRequest,
  type BalanceSummary,
  createGroup,
  deleteGroup,
  fetchGroupMembers,
  fetchMyGroups,
  fetchPendingJoinRequests,
  fetchUserBalanceSummary,
  type GroupMember,
  type GroupWithMemberCount,
  joinGroupByCode,
  type JoinRequest,
  type JoinResult,
  rejectJoinRequest,
  removeMember,
  updateMemberRole,
} from '../services/group.service';

interface GroupState {
  groups: GroupWithMemberCount[];
  currentGroupMembers: GroupMember[];
  pendingJoinRequests: JoinRequest[];
  balanceSummary: BalanceSummary;
  isLoading: boolean;

  loadGroups: () => Promise<void>;
  loadBalanceSummary: () => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  joinByCode: (code: string) => Promise<JoinResult>;
  loadMembers: (groupId: string) => Promise<void>;
  loadPendingRequests: (groupId: string) => Promise<void>;
  approveRequest: (requestId: string, groupId: string) => Promise<void>;
  rejectRequest: (requestId: string, groupId: string) => Promise<void>;
  changeRole: (memberId: string, role: 'admin' | 'member') => Promise<void>;
  kickMember: (memberId: string, groupId: string) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;
}

const EMPTY_SUMMARY: BalanceSummary = { total: 0, groupBalances: {} };

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroupMembers: [],
  pendingJoinRequests: [],
  balanceSummary: EMPTY_SUMMARY,
  isLoading: false,

  loadGroups: async () => {
    set({ isLoading: true });
    try {
      const [groups, balanceSummary] = await Promise.all([
        fetchMyGroups(),
        fetchUserBalanceSummary(),
      ]);
      set({ groups, balanceSummary });
    } finally {
      set({ isLoading: false });
    }
  },

  loadBalanceSummary: async () => {
    const balanceSummary = await fetchUserBalanceSummary();
    set({ balanceSummary });
  },

  createGroup: async (name) => {
    await createGroup(name);
    await get().loadGroups();
  },

  joinByCode: async (code) => {
    // Không reload groups — user chưa join được, danh sách không thay đổi
    return joinGroupByCode(code);
  },

  loadMembers: async (groupId) => {
    const members = await fetchGroupMembers(groupId);
    set({ currentGroupMembers: members });
  },

  loadPendingRequests: async (groupId) => {
    const requests = await fetchPendingJoinRequests(groupId);
    set({ pendingJoinRequests: requests });
  },

  approveRequest: async (requestId, groupId) => {
    await approveJoinRequest(requestId, groupId);
    await Promise.all([
      get().loadPendingRequests(groupId),
      get().loadMembers(groupId),
    ]);
  },

  rejectRequest: async (requestId, groupId) => {
    await rejectJoinRequest(requestId, groupId);
    await get().loadPendingRequests(groupId);
  },

  changeRole: async (memberId, role) => {
    await updateMemberRole(memberId, role);
    const members = get().currentGroupMembers;
    if (members.length > 0) {
      await get().loadMembers(members[0]!.group_id);
    }
  },

  kickMember: async (memberId, groupId) => {
    await removeMember(memberId);
    await get().loadMembers(groupId);
  },

  removeGroup: async (groupId) => {
    await deleteGroup(groupId);
    await get().loadGroups();
  },
}));
