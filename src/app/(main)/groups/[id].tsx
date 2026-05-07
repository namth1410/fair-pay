import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, useToast } from 'heroui-native';
import { Pencil } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import type { EntryAnimationsValues } from 'react-native-reanimated';
import Animated, { withTiming } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { AddVirtualMemberSheet } from '../../../components/common/AddVirtualMemberSheet';
import { GroupEditSheet } from '../../../components/group/GroupEditSheet';
import { GroupSettingsTab } from '../../../components/group/GroupSettingsTab';
import { MembersTab } from '../../../components/group/MembersTab';
import { TripsTab } from '../../../components/group/TripsTab';
import { AppText, Avatar, BouncyDialog, ConfirmDialog, SectionTabs, VoroConfirmDialog } from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { getAuthUserId } from '../../../services/auth.helper';
import type { GroupMember, JoinRequest } from '../../../services/group.service';
import type { Trip } from '../../../services/trip.service';
import { useAuthStore } from '../../../stores/auth.store';
import { useGroupStore } from '../../../stores/group.store';
import { useTripStore } from '../../../stores/trip.store';
import { getErrorMessage } from '../../../utils/error';

type Tab = 'trips' | 'members' | 'settings';
type Role = 'admin' | 'member';

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

  // Selectors gộp qua useShallow — chỉ re-render khi shape của object subscribe đổi,
  // tránh re-render theo các field không liên quan (vd `balanceSummary`).
  const {
    groups, currentGroupMembers, pendingJoinRequests,
    loadMembers, loadPendingRequests, approveRequest, rejectRequest,
    kickMember, removeGroup,
  } = useGroupStore(
    useShallow((s) => ({
      groups: s.groups,
      currentGroupMembers: s.currentGroupMembers,
      pendingJoinRequests: s.pendingJoinRequests,
      loadMembers: s.loadMembers,
      loadPendingRequests: s.loadPendingRequests,
      approveRequest: s.approveRequest,
      rejectRequest: s.rejectRequest,
      kickMember: s.kickMember,
      removeGroup: s.removeGroup,
    }))
  );
  const {
    trips, tripsLoading, loadTrips, addTrip, toggleTripStatus,
  } = useTripStore(
    useShallow((s) => ({
      trips: s.trips,
      tripsLoading: s.isLoading,
      loadTrips: s.loadTrips,
      addTrip: s.addTrip,
      toggleTripStatus: s.toggleTripStatus,
    }))
  );
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>('trips');
  const prevTabRef = useRef<Tab>(tab);
  const [myRole, setMyRole] = useState<Role>('member');
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_CLOSED);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [addVirtualOpen, setAddVirtualOpen] = useState(false);
  const [tripToToggle, setTripToToggle] = useState<Trip | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
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
    if (!group || sharingRef.current) return;
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

  const handleToggleTripRequest = (trip: Trip) => setTripToToggle(trip);

  const confirmToggleTrip = async () => {
    const trip = tripToToggle;
    if (!trip) return;
    try {
      await toggleTripStatus(trip);
      toast.show({
        variant: 'success',
        label: trip.status === 'open' ? 'Đã đóng chuyến' : 'Đã mở lại chuyến',
        description: trip.name,
      });
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    }
  };

  const handleDeleteGroup = () => setDeleteGroupOpen(true);

  const confirmDeleteGroup = async () => {
    setDeleteGroupOpen(false);
    try {
      await removeGroup(id!);
      router.back();
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    }
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
          <AppText
            variant="title"
            weight="semibold"
            numberOfLines={1}
            style={styles.heroName}
          >
            {group.name}
          </AppText>
          <AppText variant="caption" tone="muted">
            {currentGroupMembers.length} thành viên · {trips.length} chuyến đi
          </AppText>
        </Pressable>
      ) : null}

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
            onToggleStatus={handleToggleTripRequest}
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
            onShare={handleShare}
            onKick={handleKick}
            onApprove={handleApprove}
            onReject={handleReject}
            onAddVirtual={() => setAddVirtualOpen(true)}
          />
        </Animated.View>
      )}

      {tab === 'settings' && isAdmin && (
        <Animated.View key="settings" entering={tabEntering} style={styles.settingsContent}>
          <GroupSettingsTab
            memberCount={currentGroupMembers.length}
            virtualMemberCount={currentGroupMembers.filter((m) => m.is_virtual).length}
            tripCount={trips.length}
            onEditGroup={() => setEditSheetOpen(true)}
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

      {id ? (
        <AddVirtualMemberSheet
          isOpen={addVirtualOpen}
          onOpenChange={setAddVirtualOpen}
          groupId={id}
          onSuccess={(name) =>
            toast.show({
              variant: 'success',
              label: 'Đã thêm thành viên ảo',
              description: name,
            })
          }
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

      <VoroConfirmDialog
        isOpen={tripToToggle !== null}
        onClose={() => setTripToToggle(null)}
        title={tripToToggle?.status === 'open' ? 'Đóng chuyến đi' : 'Mở lại chuyến đi'}
        description={
          tripToToggle?.status === 'open'
            ? `Đóng chuyến "${tripToToggle?.name}"? Bạn vẫn có thể mở lại sau.`
            : `Mở lại chuyến "${tripToToggle?.name}" để tiếp tục ghi chi phí.`
        }
        confirmLabel={tripToToggle?.status === 'open' ? 'Đóng chuyến' : 'Mở lại'}
        destructive={tripToToggle?.status === 'open'}
        onConfirm={confirmToggleTrip}
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
  tabContent: { flex: 1 },
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
  heroName: {
    maxWidth: '85%',
    textAlign: 'center',
  },
});
