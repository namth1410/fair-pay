import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import Pencil from 'lucide-react-native/dist/esm/icons/pencil';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { AddMemberSheet } from '../../../components/common/AddMemberSheet';
import { ApproveJoinRequestSheet } from '../../../components/group/ApproveJoinRequestSheet';
import { GroupEditSheet } from '../../../components/group/GroupEditSheet';
import { GroupSettingsTab } from '../../../components/group/GroupSettingsTab';
import { MembersTab } from '../../../components/group/MembersTab';
import { RenameMemberSheet } from '../../../components/group/RenameMemberSheet';
import { TripsTab } from '../../../components/group/TripsTab';
import { TripActionSheet } from '../../../components/trip/TripActionSheet';
import { Avatar, BouncyDialog, SectionTabs } from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { getAuthUserId } from '../../../services/auth.helper';
import type {
  GroupInvitation,
  GroupMember,
  JoinRequest,
} from '../../../services/group.service';
import type { Trip } from '../../../services/trip.service';
import { useAuthStore } from '../../../stores/auth.store';
import { useGroupStore } from '../../../stores/group.store';
import { useTripStore } from '../../../stores/trip.store';
import * as syncBus from '../../../sync/syncBus';
import { isPendingInviteCode } from '../../../utils/inviteCode';
import { showError, showSuccess, showWarning } from '../../../utils/toast';

type Tab = 'trips' | 'members' | 'settings';
type Role = 'admin' | 'member';

const TAB_ANIM = { duration: 280, easing: Easing.out(Easing.cubic) } as const;
const SWIPE_VELOCITY_THRESHOLD = 500;

interface ConfirmState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  onConfirm: () => void;
}

const CONFIRM_CLOSED: ConfirmState = {
  isOpen: false, title: '', description: '', confirmLabel: 'Xác nhận', destructive: false, onConfirm: () => {},
};

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useAppTheme();
  const { width: W } = useWindowDimensions();

  // Selectors gộp qua useShallow — chỉ re-render khi shape của object subscribe đổi,
  // tránh re-render theo các field không liên quan (vd `balanceSummary`).
  const {
    groups, currentGroupMembers, currentGroupId, pendingJoinRequests,
    pendingInvitations, isLoadingPendingInvitations,
    loadMembers, loadPendingRequests, loadPendingInvitations,
    rejectRequest, revokeInvite,
    kickMember, removeGroup,
  } = useGroupStore(
    useShallow((s) => ({
      groups: s.groups,
      currentGroupMembers: s.currentGroupMembers,
      currentGroupId: s.currentGroupId,
      pendingJoinRequests: s.pendingJoinRequests,
      pendingInvitations: s.pendingInvitations,
      isLoadingPendingInvitations: s.isLoadingPendingInvitations,
      loadMembers: s.loadMembers,
      loadPendingRequests: s.loadPendingRequests,
      loadPendingInvitations: s.loadPendingInvitations,
      rejectRequest: s.rejectRequest,
      revokeInvite: s.revokeInvite,
      kickMember: s.kickMember,
      removeGroup: s.removeGroup,
    }))
  );
  const {
    trips, tripsLoading, loadTrips, toggleTripStatus,
  } = useTripStore(
    useShallow((s) => ({
      trips: s.trips,
      tripsLoading: s.isLoadingTrips,
      loadTrips: s.loadTrips,
      toggleTripStatus: s.toggleTripStatus,
    }))
  );
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>('trips');
  const [myRole, setMyRole] = useState<Role>('member');
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_CLOSED);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [tripToToggle, setTripToToggle] = useState<Trip | null>(null);
  const [selectedTripForAction, setSelectedTripForAction] = useState<Trip | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [memberToRename, setMemberToRename] = useState<GroupMember | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [requestToApprove, setRequestToApprove] = useState<JoinRequest | null>(null);
  const sharingRef = useRef(false);

  const group = groups.find((g) => g.id === id);

  useEffect(() => {
    if (!id) return;
    loadMembers(id);
    loadTrips(id);
  }, [id]);

  useEffect(() => {
    if (!user || !currentGroupMembers.length) return;
    const findMyRole = async () => {
      const appUserId = await getAuthUserId();
      if (appUserId) {
        const me = currentGroupMembers.find((m) => m.user_id === appUserId);
        if (me) setMyRole(me.role as Role);
      }
    };
    findMyRole();
  }, [user, currentGroupMembers]);

  const isAdmin = myRole === 'admin';

  // Tabs visible theo role: member chỉ thấy trips/members, admin thêm settings.
  const VISIBLE_KEYS = useMemo<Tab[]>(
    () => (isAdmin ? ['trips', 'members', 'settings'] : ['trips', 'members']),
    [isAdmin],
  );

  const targetIdx = Math.max(0, VISIBLE_KEYS.indexOf(tab));
  const progress = useSharedValue(targetIdx);
  const startProgress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(targetIdx, TAB_ANIM);
  }, [targetIdx, progress]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * W }],
  }));

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-20, 20])
        .onBegin(() => {
          'worklet';
          startProgress.value = progress.value;
        })
        .onUpdate((e) => {
          'worklet';
          const next = startProgress.value - e.translationX / W;
          progress.value = Math.max(0, Math.min(VISIBLE_KEYS.length - 1, next));
        })
        .onEnd((e) => {
          'worklet';
          const v = e.velocityX;
          const settled =
            v < -SWIPE_VELOCITY_THRESHOLD
              ? Math.ceil(progress.value)
              : v > SWIPE_VELOCITY_THRESHOLD
                ? Math.floor(progress.value)
                : Math.round(progress.value);
          const clamped = Math.max(
            0,
            Math.min(VISIBLE_KEYS.length - 1, settled),
          );
          progress.value = withTiming(clamped, TAB_ANIM);
          const nextKey = VISIBLE_KEYS[clamped] ?? VISIBLE_KEYS[0]!;
          if (clamped !== targetIdx) {
            runOnJS(setTab)(nextKey);
          }
        }),
    [W, progress, startProgress, targetIdx, VISIBLE_KEYS],
  );

  useFocusEffect(
    useCallback(() => {
      if (isAdmin && id) {
        loadPendingRequests(id);
        loadPendingInvitations(id);
      }
    }, [isAdmin, id])
  );

  // Revalidate khi sync nền pull về thay đổi (resume từ background sau lâu,
  // offline→online, hoặc thay đổi từ thiết bị khác). quiet → không nháy skeleton.
  // Guard currentGroupId để chỉ refresh khi vẫn đang xem đúng group này.
  useEffect(() => {
    if (!id) return;
    return syncBus.subscribe(() => {
      if (useGroupStore.getState().currentGroupId !== id) return;
      void useGroupStore.getState().loadMembers(id);
      void useTripStore.getState().loadTrips(id, { quiet: true });
      if (isAdmin) {
        void useGroupStore.getState().loadPendingRequests(id);
        void useGroupStore.getState().loadPendingInvitations(id);
      }
    });
  }, [id, isAdmin]);

  // ── Event handlers ──

  const handleShare = async () => {
    if (!group || sharingRef.current) return;
    if (isPendingInviteCode(group.invite_code)) {
      showWarning(
        'Mã mời đang đợi đồng bộ',
        'Khi nhóm sync xong với server, mã mời thật sẽ xuất hiện và có thể chia sẻ.'
      );
      return;
    }
    sharingRef.current = true;
    try {
      await Share.share({
        message: `Tham gia nhóm "${group.name}" trên Fair Pay!\nMã mời: ${group.invite_code}`,
      });
    } finally {
      setTimeout(() => { sharingRef.current = false; }, 1500);
    }
  };

  const handleKick = (member: GroupMember) => {
    setConfirm({
      isOpen: true,
      title: 'Xóa thành viên',
      description: `Xóa ${member.display_name} khỏi nhóm?`,
      confirmLabel: 'Xóa',
      destructive: true,
      onConfirm: async () => {
        try {
          await kickMember(member.id, id!);
          showSuccess('Đã xóa thành viên');
        } catch (e: unknown) {
          showError(e);
        }
      },
    });
  };

  const handleApprove = (req: JoinRequest) => {
    // Mở sheet để admin chọn: thành viên mới HOẶC gán vào thành viên ảo (kế thừa số dư).
    setRequestToApprove(req);
    setApproveOpen(true);
  };

  const handleReject = (req: JoinRequest) => {
    setConfirm({
      isOpen: true,
      title: 'Từ chối',
      description: `Từ chối ${req.display_name}?`,
      confirmLabel: 'Từ chối',
      destructive: true,
      onConfirm: async () => {
        try {
          await rejectRequest(req.id, id!);
          showSuccess('Đã từ chối yêu cầu');
        } catch (e: unknown) {
          showError(e);
        }
      },
    });
  };

  const handleRevokeInvitation = (inv: GroupInvitation) => {
    const display = inv.invited_display_name?.trim() || inv.invited_email;
    setConfirm({
      isOpen: true,
      title: 'Thu hồi lời mời',
      description: `Thu hồi lời mời gửi tới ${display}?`,
      confirmLabel: 'Thu hồi',
      destructive: true,
      onConfirm: async () => {
        if (!id) return;
        setRevokingInvitationId(inv.id);
        try {
          await revokeInvite(inv.id, id);
          showSuccess('Đã thu hồi lời mời');
        } catch (e: unknown) {
          showError(e);
        } finally {
          setRevokingInvitationId(null);
        }
      },
    });
  };

  const handleToggleTripRequest = (trip: Trip) => setTripToToggle(trip);

  const confirmToggleTrip = async () => {
    const trip = tripToToggle;
    if (!trip || toggleBusy) return;
    setToggleBusy(true);
    try {
      await toggleTripStatus(trip);
      showSuccess(
        trip.status === 'open' ? 'Đã đóng chuyến' : 'Đã mở lại chuyến',
        trip.name
      );
      setTripToToggle(null);
    } catch (e: unknown) {
      showError(e);
    } finally {
      setToggleBusy(false);
    }
  };

  const handleDeleteGroup = () => setDeleteGroupOpen(true);

  const confirmDeleteGroup = async () => {
    setDeleteGroupOpen(false);
    try {
      await removeGroup(id!);
      router.back();
    } catch (e: unknown) {
      showError(e);
    }
  };

  if (!id) return null;

  // Guard: cache trong store có thể là data của group vừa unmount trước → render
  // loading cho tới khi loadMembers/loadTrips populate xong cho group hiện tại.
  const isHydrating = currentGroupId !== id || !group;
  if (isHydrating) {
    return (
      <View style={[styles.container, styles.hydrating, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ title: group?.name || 'Nhóm' }} />
        <ActivityIndicator size="large" color={c.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: group?.name || 'Nhóm' }} />

      {group ? (
        <Pressable
          onPress={() => isAdmin && setEditSheetOpen(true)}
          disabled={!isAdmin}
          style={({ pressed }) => [
            styles.heroBlock,
            { opacity: pressed && isAdmin ? 0.7 : 1 },
          ]}
          accessibilityRole={isAdmin ? 'button' : undefined}
          accessibilityLabel={isAdmin ? 'Sửa thông tin nhóm' : undefined}
        >
          <View style={styles.heroAvatarWrap}>
            <Avatar
              seed={group.id}
              label={group.name}
              photoUrl={group.avatar_url}
              size={96}
            />
            {isAdmin ? (
              <View
                style={[
                  styles.editBadge,
                  { backgroundColor: c.primary, borderColor: c.background },
                ]}
              >
                <Pencil size={12} color={c.background} />
              </View>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      <SectionTabs
        items={[
          { key: 'trips', label: `Chuyến đi (${trips.length})` },
          {
            key: 'members',
            label: `Thành viên (${currentGroupMembers.length})`,
            badge: isAdmin
              ? pendingJoinRequests.length + pendingInvitations.length
              : undefined,
          },
          { key: 'settings', label: 'Cài đặt', hidden: !isAdmin },
        ]}
        selected={tab}
        onSelect={(key) => setTab(key as Tab)}
      />

      <View style={styles.tabViewport}>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[styles.tabRow, { width: W * VISIBLE_KEYS.length }, rowStyle]}
          >
            <View style={{ width: W }}>
              <TripsTab
                trips={trips}
                isLoading={tripsLoading}
                isAdmin={isAdmin}
                groupId={id ?? ''}
                onTripPress={(tripId) => router.push(`/(main)/trips/${tripId}`)}
                onToggleStatus={handleToggleTripRequest}
                onTripLongPress={setSelectedTripForAction}
                onCreateSuccess={(name) => showSuccess('Đã tạo chuyến đi', name)}
              />
            </View>
            <View style={{ width: W }}>
              <MembersTab
                members={currentGroupMembers}
                pendingRequests={pendingJoinRequests}
                pendingInvitations={pendingInvitations}
                isLoadingPendingInvitations={isLoadingPendingInvitations}
                inviteCode={group?.invite_code}
                isAdmin={isAdmin}
                revokingInvitationId={revokingInvitationId}
                onShare={handleShare}
                onKick={handleKick}
                onRename={(m) => { setMemberToRename(m); setRenameOpen(true); }}
                onApprove={handleApprove}
                onReject={handleReject}
                onAddMember={() => setAddMemberOpen(true)}
                onRevokeInvitation={handleRevokeInvitation}
              />
            </View>
            {isAdmin ? (
              <View style={{ width: W }}>
                <View style={styles.settingsContent}>
                  <GroupSettingsTab
                    memberCount={currentGroupMembers.length}
                    virtualMemberCount={currentGroupMembers.filter((m) => m.is_virtual).length}
                    tripCount={trips.length}
                    onEditGroup={() => setEditSheetOpen(true)}
                    onDeleteGroup={handleDeleteGroup}
                  />
                </View>
              </View>
            ) : null}
          </Animated.View>
        </GestureDetector>
      </View>

      <BouncyDialog
        isOpen={confirm.isOpen}
        onClose={() => setConfirm(CONFIRM_CLOSED)}
      >
        <BouncyDialog.Title>{confirm.title}</BouncyDialog.Title>
        <BouncyDialog.Description>{confirm.description}</BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={() => setConfirm(CONFIRM_CLOSED)}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button
            variant={confirm.destructive ? 'danger' : 'primary'}
            size="sm"
            onPress={() => {
              const fn = confirm.onConfirm;
              setConfirm(CONFIRM_CLOSED);
              fn();
            }}
          >
            <Button.Label>{confirm.confirmLabel}</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

      {id ? (
        <AddMemberSheet
          isOpen={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          groupId={id}
          onVirtualAdded={(name) => showSuccess('Đã thêm thành viên ảo', name)}
        />
      ) : null}

      {id ? (
        <RenameMemberSheet
          isOpen={renameOpen}
          onOpenChange={setRenameOpen}
          memberId={memberToRename?.id ?? ''}
          currentName={memberToRename?.display_name ?? ''}
          groupId={id}
          onSuccess={() => showSuccess('Đã đổi tên thành viên')}
        />
      ) : null}

      {id ? (
        <ApproveJoinRequestSheet
          isOpen={approveOpen}
          onOpenChange={setApproveOpen}
          request={requestToApprove}
          groupId={id}
          claimableMembers={currentGroupMembers.filter(
            (m) => m.is_virtual && !m.left_at
          )}
        />
      ) : null}

      {id && group ? (
        <GroupEditSheet
          isOpen={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          groupId={id}
          groupName={group.name}
          currentAvatarUrl={group.avatar_url}
        />
      ) : null}

      <BouncyDialog
        isOpen={tripToToggle !== null}
        onClose={() => { if (!toggleBusy) setTripToToggle(null); }}
        dismissOnBackdrop={!toggleBusy}
      >
        <BouncyDialog.Title>
          {tripToToggle?.status === 'open' ? 'Đóng chuyến đi?' : 'Mở lại chuyến đi?'}
        </BouncyDialog.Title>
        <BouncyDialog.Description>
          {tripToToggle?.status === 'open'
            ? `Đóng chuyến "${tripToToggle?.name}"? Bạn vẫn có thể mở lại sau.`
            : `Mở lại chuyến "${tripToToggle?.name}" để tiếp tục ghi chi phí.`}
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={() => setTripToToggle(null)} isDisabled={toggleBusy}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button
            variant={tripToToggle?.status === 'open' ? 'danger' : 'primary'}
            size="sm"
            onPress={confirmToggleTrip}
            isDisabled={toggleBusy}
          >
            <Button.Label>
              {toggleBusy
                ? 'Đang xử lý...'
                : tripToToggle?.status === 'open' ? 'Đóng chuyến' : 'Mở lại'}
            </Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

      <TripActionSheet
        trip={selectedTripForAction}
        isOpen={selectedTripForAction !== null}
        onOpenChange={(open) => { if (!open) setSelectedTripForAction(null); }}
      />

      <BouncyDialog
        isOpen={deleteGroupOpen}
        onClose={() => setDeleteGroupOpen(false)}
      >
        <BouncyDialog.Title>Xóa nhóm</BouncyDialog.Title>
        <BouncyDialog.Description>
          Bạn có chắc muốn xóa nhóm &quot;{group?.name}&quot;?
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={() => setDeleteGroupOpen(false)}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button variant="danger" size="sm" onPress={confirmDeleteGroup}>
            <Button.Label>Xóa</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hydrating: { justifyContent: 'center', alignItems: 'center' },
  tabViewport: { flex: 1, overflow: 'hidden' },
  tabRow: { flex: 1, flexDirection: 'row' },
  settingsContent: { padding: 16, gap: 16 },
  heroBlock: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  heroAvatarWrap: {
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
