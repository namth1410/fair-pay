import { create } from 'zustand';

import {
  addVirtualMember,
  approveJoinRequest,
  type BalanceSummary,
  createGroup,
  deleteGroup,
  fetchGroupMembers,
  fetchMyGroups,
  fetchMyPendingJoinRequests,
  fetchPendingJoinRequests,
  fetchUserBalanceSummary,
  type GroupMember,
  type GroupWithMemberCount,
  joinGroupByCode,
  type JoinRequest,
  type JoinResult,
  type MyPendingJoinRequest,
  rejectJoinRequest,
  removeMember,
  renameMember,
  updateGroup,
  updateMemberRole,
} from '../services/group.service';

interface GroupState {
  groups: GroupWithMemberCount[];
  currentGroupMembers: GroupMember[];
  pendingJoinRequests: JoinRequest[];
  myPendingJoinRequests: MyPendingJoinRequest[];
  balanceSummary: BalanceSummary;
  isLoading: boolean;

  loadGroups: () => Promise<void>;
  loadBalanceSummary: () => Promise<void>;
  loadMyPendingJoinRequests: () => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  joinByCode: (code: string) => Promise<JoinResult>;
  loadMembers: (groupId: string) => Promise<void>;
  loadPendingRequests: (groupId: string) => Promise<void>;
  approveRequest: (requestId: string, groupId: string) => Promise<void>;
  rejectRequest: (requestId: string, groupId: string) => Promise<void>;
  changeRole: (memberId: string, role: 'admin' | 'member', groupId: string) => Promise<void>;
  kickMember: (memberId: string, groupId: string) => Promise<void>;
  renameMemberInGroup: (memberId: string, newName: string, groupId: string) => Promise<void>;
  addVirtualMember: (groupId: string, displayName: string) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;
  setGroupAvatar: (groupId: string, avatarUrl: string | null) => void;
  setGroupName: (groupId: string, name: string) => void;
  editGroupName: (groupId: string, name: string) => Promise<void>;
  reset: () => void;
}

const EMPTY_SUMMARY: BalanceSummary = { total: 0, groupBalances: {} };

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroupMembers: [],
  pendingJoinRequests: [],
  myPendingJoinRequests: [],
  balanceSummary: EMPTY_SUMMARY,
  isLoading: false,

  loadGroups: async () => {
    set({ isLoading: true });
    try {
      const [groups, balanceSummary, myPendingJoinRequests] = await Promise.all([
        fetchMyGroups(),
        fetchUserBalanceSummary(),
        fetchMyPendingJoinRequests(),
      ]);
      set({ groups, balanceSummary, myPendingJoinRequests });
    } finally {
      set({ isLoading: false });
    }
  },

  loadBalanceSummary: async () => {
    const balanceSummary = await fetchUserBalanceSummary();
    set({ balanceSummary });
  },

  loadMyPendingJoinRequests: async () => {
    const myPendingJoinRequests = await fetchMyPendingJoinRequests();
    set({ myPendingJoinRequests });
  },

  createGroup: async (name) => {
    await createGroup(name);
    await get().loadGroups();
  },

  joinByCode: async (code) => {
    const result = await joinGroupByCode(code);
    // Refresh pending list để Home render ribbon từ server state
    await get().loadMyPendingJoinRequests();
    return result;
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

  changeRole: async (memberId, role, groupId) => {
    await updateMemberRole(memberId, role);
    await get().loadMembers(groupId);
  },

  kickMember: async (memberId, groupId) => {
    await removeMember(memberId);
    await get().loadMembers(groupId);
  },

  renameMemberInGroup: async (memberId, newName, groupId) => {
    await renameMember(memberId, newName);
    await get().loadMembers(groupId);
  },

  addVirtualMember: async (groupId, displayName) => {
    await addVirtualMember(groupId, displayName);
    await get().loadMembers(groupId);
  },

  removeGroup: async (groupId) => {
    await deleteGroup(groupId);
    await get().loadGroups();
  },

  setGroupAvatar: (groupId, avatarUrl) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, avatar_url: avatarUrl } : g
      ),
    }));
  },

  setGroupName: (groupId, name) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, name } : g
      ),
    }));
  },

  editGroupName: async (groupId, name) => {
    await updateGroup(groupId, { name });
    get().setGroupName(groupId, name);
  },

  reset: () =>
    set({
      groups: [],
      currentGroupMembers: [],
      pendingJoinRequests: [],
      myPendingJoinRequests: [],
      balanceSummary: EMPTY_SUMMARY,
      isLoading: false,
    }),
}));
