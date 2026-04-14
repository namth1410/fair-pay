import { create } from 'zustand';
import {
  fetchMyGroups,
  createGroup,
  joinGroupByCode,
  fetchGroupMembers,
  updateMemberRole,
  removeMember,
  deleteGroup,
  type GroupWithMemberCount,
  type GroupMember,
} from '../services/group.service';

interface GroupState {
  groups: GroupWithMemberCount[];
  currentGroupMembers: GroupMember[];
  isLoading: boolean;

  loadGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  joinByCode: (code: string) => Promise<void>;
  loadMembers: (groupId: string) => Promise<void>;
  changeRole: (memberId: string, role: 'admin' | 'member') => Promise<void>;
  kickMember: (memberId: string, groupId: string) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroupMembers: [],
  isLoading: false,

  loadGroups: async () => {
    set({ isLoading: true });
    try {
      const groups = await fetchMyGroups();
      set({ groups });
    } finally {
      set({ isLoading: false });
    }
  },

  createGroup: async (name) => {
    await createGroup(name);
    await get().loadGroups();
  },

  joinByCode: async (code) => {
    await joinGroupByCode(code);
    await get().loadGroups();
  },

  loadMembers: async (groupId) => {
    const members = await fetchGroupMembers(groupId);
    set({ currentGroupMembers: members });
  },

  changeRole: async (memberId, role) => {
    await updateMemberRole(memberId, role);
    // Reload members for the current group
    const members = get().currentGroupMembers;
    if (members.length > 0) {
      await get().loadMembers(members[0].group_id);
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
