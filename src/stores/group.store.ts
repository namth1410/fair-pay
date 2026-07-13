import { create } from 'zustand';

import {
  addVirtualMember,
  approveJoinRequest,
  type BalanceSummary,
  createGroup,
  deleteGroup,
  fetchGroupMembers,
  fetchMyGroups,
  fetchMyPendingInvitations,
  fetchMyPendingJoinRequests,
  fetchPendingInvitations,
  fetchPendingJoinRequests,
  fetchUserBalanceSummary,
  type GroupInvitation,
  type GroupMember,
  type GroupWithMemberCount,
  inviteMemberByEmail,
  joinGroupByCode,
  type JoinPreview,
  type JoinRequest,
  type JoinResult,
  type MyPendingInvitation,
  type MyPendingJoinRequest,
  previewJoinByCode,
  rejectJoinRequest,
  removeMember,
  renameMember,
  respondToInvitation,
  revokeInvitation,
  updateGroup,
  updateMemberRole,
} from '../services/group.service';

interface GroupState {
  groups: GroupWithMemberCount[];
  currentGroupMembers: GroupMember[];
  pendingJoinRequests: JoinRequest[];
  myPendingJoinRequests: MyPendingJoinRequest[];
  /** Admin-only: invitations đang chờ của currentGroupId */
  pendingInvitations: GroupInvitation[];
  isLoadingPendingInvitations: boolean;
  /** Invitations đang mời chính user hiện tại (cross-group, dùng cho Home banner + dialog confirm) */
  myPendingInvitations: MyPendingInvitation[];
  isLoadingMyPendingInvitations: boolean;
  balanceSummary: BalanceSummary;
  isLoading: boolean;
  /**
   * Id of the group whose `currentGroupMembers` + `pendingJoinRequests`
   * are currently cached. Used by the notification realtime router to decide
   * whether a realtime event for group X should refetch (only when user is
   * actively viewing X — otherwise we'd clobber the user's current view).
   */
  currentGroupId: string | null;

  loadGroups: (opts?: { quiet?: boolean }) => Promise<void>;
  loadBalanceSummary: () => Promise<void>;
  loadMyPendingJoinRequests: () => Promise<void>;
  loadMyPendingInvitations: () => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  joinByCode: (code: string, claimMemberId?: string | null) => Promise<JoinResult>;
  /** Preview nhóm + thành viên ảo có thể nhận theo mã mời (không tạo request). */
  previewJoinByCode: (code: string) => Promise<JoinPreview>;
  loadMembers: (groupId: string) => Promise<void>;
  loadPendingRequests: (groupId: string) => Promise<void>;
  loadPendingInvitations: (groupId: string) => Promise<void>;
  approveRequest: (
    requestId: string,
    groupId: string,
    adoptMemberId?: string | null
  ) => Promise<void>;
  rejectRequest: (requestId: string, groupId: string) => Promise<void>;
  inviteMember: (groupId: string, email: string) => Promise<void>;
  respondToInvitationAction: (
    invitationId: string,
    action: 'accept' | 'decline'
  ) => Promise<{ group_id: string; group_name: string; status: string }>;
  revokeInvite: (invitationId: string, groupId: string) => Promise<void>;
  /**
   * Helper được hook realtime gọi khi nhận payload từ `group_invitations`.
   * Patch state local mà không cần refetch toàn bộ list.
   */
  applyInvitationRealtime: (
    row: GroupInvitation,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    invitedUserId: string | null
  ) => void;
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
  pendingInvitations: [],
  isLoadingPendingInvitations: false,
  myPendingInvitations: [],
  isLoadingMyPendingInvitations: false,
  balanceSummary: EMPTY_SUMMARY,
  isLoading: false,
  currentGroupId: null,

  loadGroups: async (opts) => {
    // quiet=true (revalidate nền sau sync / resume): KHÔNG bật isLoading → không
    // nháy skeleton/spinner refresh, chỉ âm thầm cập nhật list khi data về.
    const quiet = opts?.quiet ?? false;
    if (!quiet) set({ isLoading: true });
    try {
      // Danh sách nhóm là nội dung chính → load TRƯỚC + unblock skeleton ngay
      // khi có. Balance summary (RPC) + ribbon (pending requests/invitations) là
      // phụ → load nền, mỗi cái set state riêng khi về, KHÔNG chặn render list.
      const groups = await fetchMyGroups();
      set({ groups });
    } finally {
      if (!quiet) set({ isLoading: false });
    }

    // Secondary loads — fire-and-forget, mỗi promise tự set slice của nó để
    // hero/ribbon nhảy vào ngay khi sẵn sàng (không chờ lẫn nhau).
    void fetchUserBalanceSummary()
      .then((balanceSummary) => set({ balanceSummary }))
      .catch(() => {});
    void fetchMyPendingJoinRequests()
      .then((myPendingJoinRequests) => set({ myPendingJoinRequests }))
      .catch(() => {});
    void fetchMyPendingInvitations()
      .then((myPendingInvitations) => set({ myPendingInvitations }))
      .catch(() => {});
  },

  loadBalanceSummary: async () => {
    const balanceSummary = await fetchUserBalanceSummary();
    set({ balanceSummary });
  },

  loadMyPendingJoinRequests: async () => {
    const myPendingJoinRequests = await fetchMyPendingJoinRequests();
    set({ myPendingJoinRequests });
  },

  loadMyPendingInvitations: async () => {
    set({ isLoadingMyPendingInvitations: true });
    try {
      const myPendingInvitations = await fetchMyPendingInvitations();
      set({ myPendingInvitations });
    } finally {
      set({ isLoadingMyPendingInvitations: false });
    }
  },

  createGroup: async (name) => {
    await createGroup(name);
    await get().loadGroups();
  },

  joinByCode: async (code, claimMemberId) => {
    const result = await joinGroupByCode(code, claimMemberId);
    // Refresh pending list để Home render ribbon từ server state
    await get().loadMyPendingJoinRequests();
    return result;
  },

  previewJoinByCode: async (code) => previewJoinByCode(code),

  loadMembers: async (groupId) => {
    // Khi đổi group: clear toàn bộ data của group cũ (members + pending) TRƯỚC fetch
    // để screen detail không render data group trước. Race-guard sau await tránh
    // fetch chậm ghi đè data của group mới.
    const isSwitchingGroup = get().currentGroupId !== groupId;
    if (isSwitchingGroup) {
      set({
        currentGroupId: groupId,
        currentGroupMembers: [],
        pendingJoinRequests: [],
        pendingInvitations: [],
      });
    }
    const members = await fetchGroupMembers(groupId);
    if (get().currentGroupId !== groupId) return;
    set({ currentGroupMembers: members });
  },

  loadPendingRequests: async (groupId) => {
    const requests = await fetchPendingJoinRequests(groupId);
    if (get().currentGroupId !== groupId) return;
    set({ pendingJoinRequests: requests });
  },

  approveRequest: async (requestId, groupId, adoptMemberId) => {
    await approveJoinRequest(requestId, groupId, adoptMemberId);
    await Promise.all([
      get().loadPendingRequests(groupId),
      get().loadMembers(groupId),
    ]);
    const newCount = get().currentGroupMembers.length;
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, member_count: newCount } : g
      ),
    }));
  },

  rejectRequest: async (requestId, groupId) => {
    await rejectJoinRequest(requestId, groupId);
    await get().loadPendingRequests(groupId);
  },

  loadPendingInvitations: async (groupId) => {
    set({ isLoadingPendingInvitations: true, currentGroupId: groupId });
    try {
      const invitations = await fetchPendingInvitations(groupId);
      // Race-safe: chỉ ghi nếu vẫn đang xem group này
      if (get().currentGroupId === groupId) {
        set({ pendingInvitations: invitations });
      }
    } finally {
      set({ isLoadingPendingInvitations: false });
    }
  },

  inviteMember: async (groupId, email) => {
    await inviteMemberByEmail(groupId, email);
    // KHÔNG refresh ngay — realtime channel `group_invitations` sẽ INSERT về.
    // Nhưng nếu realtime offline, fallback bằng load để UI không stuck.
    await get().loadPendingInvitations(groupId);
  },

  respondToInvitationAction: async (invitationId, action) => {
    // Optimistic remove khỏi myPendingInvitations để dialog đóng mượt
    const prev = get().myPendingInvitations;
    set({
      myPendingInvitations: prev.filter((inv) => inv.invitation_id !== invitationId),
    });

    try {
      const result = await respondToInvitation(invitationId, action);
      // Nếu accept → group mới xuất hiện ở Home
      if (action === 'accept') {
        await get().loadGroups();
      }
      return result;
    } catch (e) {
      // Rollback optimistic update khi fail
      set({ myPendingInvitations: prev });
      throw e;
    }
  },

  revokeInvite: async (invitationId, groupId) => {
    // Optimistic remove khỏi pendingInvitations
    const prev = get().pendingInvitations;
    set({ pendingInvitations: prev.filter((inv) => inv.id !== invitationId) });

    try {
      await revokeInvitation(invitationId);
      // Realtime UPDATE sẽ confirm — vẫn refresh phòng channel offline
      await get().loadPendingInvitations(groupId);
    } catch (e) {
      // Rollback
      set({ pendingInvitations: prev });
      throw e;
    }
  },

  applyInvitationRealtime: (row, eventType, invitedUserId) => {
    const state = get();

    // ── Admin side: cập nhật pendingInvitations cho currentGroupId ────────
    if (state.currentGroupId === row.group_id) {
      if (eventType === 'INSERT' && row.status === 'pending') {
        // Prepend nếu chưa có (race với loadPendingInvitations)
        if (!state.pendingInvitations.some((inv) => inv.id === row.id)) {
          set({ pendingInvitations: [row, ...state.pendingInvitations] });
        }
      } else if (eventType === 'UPDATE') {
        // Status transition pending → terminal → remove
        if (row.status !== 'pending') {
          set({
            pendingInvitations: state.pendingInvitations.filter((inv) => inv.id !== row.id),
          });
        }
      } else if (eventType === 'DELETE') {
        set({
          pendingInvitations: state.pendingInvitations.filter((inv) => inv.id !== row.id),
        });
      }
    }

    // ── Invitee side: cập nhật myPendingInvitations nếu liên quan tới user ────
    if (invitedUserId && row.invited_user_id === invitedUserId) {
      if (eventType === 'INSERT' && row.status === 'pending') {
        // Realtime payload không có group_name/inviter_name (chỉ là row của table)
        // → trigger refetch nhẹ để có đủ data join. Acceptable: 1 row INSERT/min.
        get().loadMyPendingInvitations();
      } else if (eventType === 'UPDATE' && row.status !== 'pending') {
        // pending → terminal → remove khỏi banner
        set({
          myPendingInvitations: state.myPendingInvitations.filter(
            (inv) => inv.invitation_id !== row.id
          ),
        });
      } else if (eventType === 'DELETE') {
        set({
          myPendingInvitations: state.myPendingInvitations.filter(
            (inv) => inv.invitation_id !== row.id
          ),
        });
      }
    }
  },

  changeRole: async (memberId, role, groupId) => {
    await updateMemberRole(memberId, role);
    await get().loadMembers(groupId);
  },

  kickMember: async (memberId, groupId) => {
    await removeMember(memberId);
    await get().loadMembers(groupId);
    const newCount = get().currentGroupMembers.length;
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, member_count: newCount } : g
      ),
    }));
  },

  renameMemberInGroup: async (memberId, newName, groupId) => {
    await renameMember(memberId, newName);
    await get().loadMembers(groupId);
  },

  addVirtualMember: async (groupId, displayName) => {
    await addVirtualMember(groupId, displayName);
    await get().loadMembers(groupId);
    const newCount = get().currentGroupMembers.length;
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, member_count: newCount } : g
      ),
    }));
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
      pendingInvitations: [],
      isLoadingPendingInvitations: false,
      myPendingInvitations: [],
      isLoadingMyPendingInvitations: false,
      balanceSummary: EMPTY_SUMMARY,
      isLoading: false,
      currentGroupId: null,
    }),
}));
