import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useToast } from 'heroui-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Animated, { withTiming } from 'react-native-reanimated';
import type { EntryAnimationsValues } from 'react-native-reanimated';

import { GroupSettingsTab } from '../../../components/group/GroupSettingsTab';
import { MembersTab } from '../../../components/group/MembersTab';
import { TripsTab } from '../../../components/group/TripsTab';
import { ConfirmDialog, SectionTabs } from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { getAuthUserId } from '../../../services/auth.helper';
import type { GroupMember, JoinRequest } from '../../../services/group.service';
import type { Trip } from '../../../services/trip.service';
import { useAuthStore } from '../../../stores/auth.store';
import { useGroupStore } from '../../../stores/group.store';
import { useTripStore } from '../../../stores/trip.store';
import { getErrorMessage } from '../../../utils/error';

type Tab = 'trips' | 'members' | 'settings';
type Role = 'owner' | 'admin' | 'member';

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Chủ nhóm',
  admin: 'Quản trị',
  member: 'Thành viên',
};

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
  const { toast } = useToast();

  const {
    groups, currentGroupMembers, pendingJoinRequests,
    loadMembers, loadPendingRequests, approveRequest, rejectRequest,
    changeRole, kickMember, removeGroup,
  } = useGroupStore();
  const { trips, isLoading: tripsLoading, loadTrips, addTrip, toggleTripStatus } =
    useTripStore();
  const { user } = useAuthStore();

  const [tab, setTab] = useState<Tab>('trips');
  const prevTabRef = useRef<Tab>(tab);
  const [myRole, setMyRole] = useState<Role>('member');
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_CLOSED);

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

  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';
  const hasAdmin = currentGroupMembers.some((m) => m.role === 'admin' && !m.left_at);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin && id) loadPendingRequests(id);
    }, [isAdmin, id])
  );

  // ── Event handlers ──

  const handleCreateTrip = async (name: string, type: Trip['type']) => {
    if (!id) return;
    try {
      await addTrip(id, name, type);
      toast.show({ variant: 'success', label: 'Đã tạo chuyến đi', description: name });
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    }
  };

  const handleShare = async () => {
    if (!group) return;
    await Share.share({
      message: `Tham gia nhóm "${group.name}" trên Fair Pay!\nMã mời: ${group.invite_code}`,
    });
  };

  const handleChangeRole = (member: GroupMember) => {
    if (member.role === 'owner') return;
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    setConfirm({
      isOpen: true,
      title: 'Thay đổi vai trò',
      description: `Đổi ${member.display_name} thành ${ROLE_LABELS[newRole as Role]}?`,
      confirmLabel: 'Xác nhận',
      destructive: false,
      onConfirm: async () => {
        try {
          await changeRole(member.id, newRole, id);
          toast.show({ variant: 'success', label: 'Đã thay đổi vai trò' });
        } catch (e: unknown) {
          toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
        }
      },
    });
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
          toast.show({ variant: 'success', label: 'Đã xóa thành viên' });
        } catch (e: unknown) {
          toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
        }
      },
    });
  };

  const handleApprove = (req: JoinRequest) => {
    setConfirm({
      isOpen: true,
      title: 'Duyệt yêu cầu',
      description: `Cho phép ${req.display_name} tham gia nhóm?`,
      confirmLabel: 'Duyệt',
      destructive: false,
      onConfirm: async () => {
        try {
          await approveRequest(req.id, id!);
          toast.show({ variant: 'success', label: 'Đã duyệt yêu cầu' });
        } catch (e: unknown) {
          toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
        }
      },
    });
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
          toast.show({ variant: 'success', label: 'Đã từ chối yêu cầu' });
        } catch (e: unknown) {
          toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
        }
      },
    });
  };

  const handleDeleteGroup = () => {
    setConfirm({
      isOpen: true,
      title: 'Xóa nhóm',
      description: `Bạn có chắc muốn xóa nhóm "${group?.name}"?`,
      confirmLabel: 'Xóa',
      destructive: true,
      onConfirm: async () => {
        try {
          await removeGroup(id!);
          router.back();
        } catch (e: unknown) {
          toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
        }
      },
    });
  };

  const GROUP_TAB_KEYS: Tab[] = ['trips', 'members', 'settings'];
  const tabIdx = GROUP_TAB_KEYS.indexOf(tab);
  const prevIdx = GROUP_TAB_KEYS.indexOf(prevTabRef.current);
  const direction = tabIdx >= prevIdx ? 'right' : 'left';
  prevTabRef.current = tab;

  const tabEntering = (_values: EntryAnimationsValues) => {
    'worklet';
    const offset = direction === 'right' ? 40 : -40;
    return {
      initialValues: { opacity: 0, transform: [{ translateX: offset }] },
      animations: {
        opacity: withTiming(1, { duration: 200 }),
        transform: [{ translateX: withTiming(0, { duration: 200 }) }],
      },
    };
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: group?.name || 'Nhóm' }} />

      <SectionTabs
        items={[
          { key: 'trips', label: `Chuyến đi (${trips.length})` },
          {
            key: 'members',
            label: `Thành viên (${currentGroupMembers.length})`,
            badge: isAdmin ? pendingJoinRequests.length : undefined,
          },
          { key: 'settings', label: 'Cài đặt', hidden: !isAdmin },
        ]}
        selected={tab}
        onSelect={(key) => setTab(key as Tab)}
      />

      {tab === 'trips' && (
        <Animated.View key="trips" entering={tabEntering} style={styles.tabContent}>
          <TripsTab
            trips={trips}
            isLoading={tripsLoading}
            isAdmin={isAdmin}
            onTripPress={(tripId) => router.push(`/(main)/trips/${tripId}`)}
            onToggleStatus={toggleTripStatus}
            onCreateTrip={handleCreateTrip}
          />
        </Animated.View>
      )}

      {tab === 'members' && (
        <Animated.View key="members" entering={tabEntering} style={styles.tabContent}>
          <MembersTab
            members={currentGroupMembers}
            pendingRequests={pendingJoinRequests}
            inviteCode={group?.invite_code}
            isAdmin={isAdmin}
            isOwner={isOwner}
            hasAdmin={hasAdmin}
            onShare={handleShare}
            onChangeRole={handleChangeRole}
            onKick={handleKick}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </Animated.View>
      )}

      {tab === 'settings' && isAdmin && (
        <Animated.View key="settings" entering={tabEntering} style={styles.settingsContent}>
          <GroupSettingsTab
            memberCount={currentGroupMembers.length}
            virtualMemberCount={currentGroupMembers.filter((m) => m.is_virtual).length}
            tripCount={trips.length}
            isOwner={isOwner}
            onDeleteGroup={handleDeleteGroup}
          />
        </Animated.View>
      )}

      <ConfirmDialog
        isOpen={confirm.isOpen}
        onOpenChange={(open) => { if (!open) setConfirm(CONFIRM_CLOSED); }}
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.confirmLabel}
        destructive={confirm.destructive}
        onConfirm={confirm.onConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabContent: { flex: 1 },
  settingsContent: { padding: 16, gap: 16 },
});
