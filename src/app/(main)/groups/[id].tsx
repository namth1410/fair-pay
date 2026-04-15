import { Stack, useFocusEffect,useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import { MapPin, Share2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import {
  AppCard,
  AppText,
  AppTextField,
  Avatar,
  CategoryIcon,
  ChipPicker,
  EmptyState,
  FormReveal,
  ListSkeleton,
  SectionTabs,
} from '../../../components/ui';
import { supabase } from '../../../config/supabase';
import { useAppTheme } from '../../../hooks/useAppTheme';
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

const TRIP_TYPE_LABELS: Record<string, string> = {
  travel: 'Du lịch',
  meal: 'Ăn uống',
  event: 'Sự kiện',
  other: 'Khác',
};

const TRIP_TYPE_OPTIONS = [
  { key: 'travel' as const, label: 'Du lịch' },
  { key: 'meal' as const, label: 'Ăn uống' },
  { key: 'event' as const, label: 'Sự kiện' },
  { key: 'other' as const, label: 'Khác' },
];

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useAppTheme();

  const {
    groups, currentGroupMembers, pendingJoinRequests,
    loadMembers, loadPendingRequests, approveRequest, rejectRequest,
    changeRole, kickMember, removeGroup,
  } = useGroupStore();
  const { trips, isLoading: tripsLoading, loadTrips, addTrip, toggleTripStatus } =
    useTripStore();
  const { user } = useAuthStore();

  const [tab, setTab] = useState<Tab>('trips');
  const [myRole, setMyRole] = useState<Role>('member');
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripType, setNewTripType] = useState<Trip['type']>('other');

  const group = groups.find((g) => g.id === id);

  // Role-based pill colors (từ theme tokens)
  const roleColor: Record<Role, string> = {
    owner: c.warning,
    admin: c.primaryStrong,
    member: c.muted,
  };

  useEffect(() => {
    if (!id) return;
    loadMembers(id);
    loadTrips(id);
  }, [id]);

  useEffect(() => {
    if (!user || !currentGroupMembers.length) return;
    const findMyRole = async () => {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single();
      if (data) {
        const me = currentGroupMembers.find((m) => m.user_id === data.id);
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

  const handleCreateTrip = async () => {
    if (!newTripName.trim() || !id) return;
    try {
      await addTrip(id, newTripName.trim(), newTripType);
      setNewTripName('');
      setShowCreateTrip(false);
    } catch (e: any) {
      Alert.alert('Lỗi', getErrorMessage(e));
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
    Alert.alert('Thay đổi vai trò', `Đổi ${member.display_name} thành ${ROLE_LABELS[newRole as Role]}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xác nhận', onPress: () => changeRole(member.id, newRole) },
    ]);
  };

  const handleKick = (member: GroupMember) => {
    Alert.alert('Xóa thành viên', `Xóa ${member.display_name} khỏi nhóm?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => kickMember(member.id, id!) },
    ]);
  };

  const handleApprove = (req: JoinRequest) => {
    Alert.alert('Duyệt yêu cầu', `Cho phép ${req.display_name} tham gia nhóm?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Duyệt', onPress: () => approveRequest(req.id, id!) },
    ]);
  };

  const handleReject = (req: JoinRequest) => {
    Alert.alert('Từ chối', `Từ chối ${req.display_name}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Từ chối', style: 'destructive', onPress: () => rejectRequest(req.id, id!) },
    ]);
  };

  const handleDeleteGroup = () => {
    Alert.alert('Xóa nhóm', `Bạn có chắc muốn xóa nhóm "${group?.name}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          await removeGroup(id!);
          router.back();
        },
      },
    ]);
  };

  // ── Role pill ──
  const RolePill = ({ role }: { role: Role }) => (
    <View style={[styles.rolePill, { backgroundColor: roleColor[role] + '22', borderColor: roleColor[role] }]}>
      <AppText variant="meta" weight="semibold" style={{ color: roleColor[role] }}>
        {ROLE_LABELS[role]}
      </AppText>
    </View>
  );

  // ── Render helpers ──
  const renderTrip = ({ item }: { item: Trip }) => (
    <AppCard
      title={item.name}
      subtitle={`${TRIP_TYPE_LABELS[item.type]} · ${item.status === 'open' ? 'Đang mở' : 'Đã đóng'}`}
      onPress={() => router.push(`/(main)/trips/${item.id}`)}
      leading={<CategoryIcon kind="trip" value={item.type} size={40} />}
      trailing={
        isAdmin ? (
          <Pressable
            onPress={() => toggleTripStatus(item)}
            accessibilityRole="button"
            accessibilityLabel={item.status === 'open' ? 'Đóng' : 'Mở lại'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <AppText variant="caption" weight="semibold" tone={item.status === 'open' ? 'danger' : 'success'}>
              {item.status === 'open' ? 'Đóng' : 'Mở lại'}
            </AppText>
          </Pressable>
        ) : undefined
      }
    />
  );

  const getChangeRoleColor = (member: GroupMember): string => {
    if (member.role === 'admin') return c.danger;
    if (hasAdmin) return c.divider;
    return c.primaryStrong;
  };

  const renderMember = ({ item }: { item: GroupMember }) => (
    <AppCard
      title={`${item.display_name}${item.is_virtual ? ' (ảo)' : ''}`}
      leading={<Avatar seed={item.id} label={item.display_name} size={40} />}
      trailing={
        <View style={styles.memberTrailing}>
          <RolePill role={item.role as Role} />
          {isAdmin && item.role !== 'owner' ? (
            <View style={styles.memberActions}>
              {isOwner && (
                <Pressable
                  onPress={() => handleChangeRole(item)}
                  disabled={item.role === 'member' && hasAdmin}
                  accessibilityRole="button"
                  accessibilityLabel={item.role === 'admin' ? 'Hạ quyền' : 'Lên admin'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <AppText
                    variant="meta"
                    weight="medium"
                    style={{ color: getChangeRoleColor(item) }}
                  >
                    {item.role === 'admin' ? 'Hạ quyền' : 'Lên admin'}
                  </AppText>
                </Pressable>
              )}
              <Pressable
                onPress={() => handleKick(item)}
                accessibilityRole="button"
                accessibilityLabel="Xóa"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <AppText variant="meta" weight="medium" tone="danger">Xóa</AppText>
              </Pressable>
            </View>
          ) : null}
        </View>
      }
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: group?.name || 'Nhóm' }} />

      {/* Tabs */}
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

      {/* ── Tab: Trips ── */}
      {tab === 'trips' && (
        <View style={styles.tabContent}>
          {isAdmin && (
            <View style={styles.sectionActions}>
              <Button variant="primary" size="sm" onPress={() => setShowCreateTrip(!showCreateTrip)}>
                <Button.Label>{showCreateTrip ? 'Hủy' : 'Tạo chuyến'}</Button.Label>
              </Button>
            </View>
          )}

          <FormReveal isOpen={showCreateTrip}>
            <AppTextField
              placeholder="Tên chuyến (VD: Đà Lạt T4/2026)"
              value={newTripName}
              onChangeText={setNewTripName}
              autoFocus
            />
            <ChipPicker
              options={TRIP_TYPE_OPTIONS}
              selected={newTripType}
              onSelect={setNewTripType}
            />
            <Button variant="primary" size="sm" onPress={handleCreateTrip}>
              <Button.Label>Tạo</Button.Label>
            </Button>
          </FormReveal>

          {tripsLoading && trips.length === 0 ? (
            <ListSkeleton count={3} />
          ) : (
            <FlatList
              data={trips}
              keyExtractor={(item) => item.id}
              renderItem={renderTrip}
              contentContainerStyle={trips.length === 0 ? styles.emptyContainer : styles.list}
              ListEmptyComponent={<EmptyState icon={MapPin} title="Chưa có chuyến đi nào" />}
            />
          )}
        </View>
      )}

      {/* ── Tab: Members ── */}
      {tab === 'members' && (
        <View style={styles.tabContent}>
          {/* Invite banner — gradient pink */}
          <Pressable
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Chia sẻ mã mời"
            style={styles.inviteBanner}
          >
            <Svg
              width="100%"
              height="100%"
              style={StyleSheet.absoluteFill}
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <Defs>
                <LinearGradient id="inviteGrad" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor={c.accentSoft} />
                  <Stop offset="100%" stopColor={c.tint} />
                </LinearGradient>
              </Defs>
              <Rect width="100" height="100" fill="url(#inviteGrad)" />
            </Svg>
            <View style={styles.inviteInner}>
              <View style={{ flex: 1 }}>
                <AppText variant="meta" tone="muted">
                  Mã mời
                </AppText>
                <AppText variant="title" weight="bold" tone="primary" style={{ letterSpacing: 2 }}>
                  {group?.invite_code}
                </AppText>
              </View>
              <Share2 size={22} color={c.primaryStrong} />
            </View>
          </Pressable>

          {/* Pending join requests — chỉ hiện cho Admin/Owner (F-23) */}
          {isAdmin && pendingJoinRequests.length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
              <AppText variant="label" tone="muted" style={styles.pendingLabel}>
                Yêu cầu tham gia ({pendingJoinRequests.length})
              </AppText>
              {pendingJoinRequests.map((req) => (
                <AppCard
                  key={req.id}
                  title={req.display_name}
                  subtitle="Đang chờ duyệt"
                  borderLeft={{ width: 3, color: c.warning }}
                  trailing={
                    <View style={styles.memberActions}>
                      <Pressable
                        onPress={() => handleApprove(req)}
                        accessibilityRole="button"
                        accessibilityLabel="Duyệt"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <AppText variant="caption" weight="semibold" tone="success">Duyệt</AppText>
                      </Pressable>
                      <Pressable
                        onPress={() => handleReject(req)}
                        accessibilityRole="button"
                        accessibilityLabel="Từ chối"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <AppText variant="caption" weight="medium" tone="danger">Từ chối</AppText>
                      </Pressable>
                    </View>
                  }
                />
              ))}
            </View>
          )}

          <FlatList
            data={currentGroupMembers}
            keyExtractor={(item) => item.id}
            renderItem={renderMember}
            contentContainerStyle={styles.list}
          />
        </View>
      )}

      {/* ── Tab: Settings ── */}
      {tab === 'settings' && isAdmin && (
        <View style={styles.settingsContent}>
          {/* Group info cards */}
          <View style={[styles.infoCard, { backgroundColor: c.surface, borderColor: c.divider }]}>
            <View style={styles.infoRow}>
              <AppText variant="body" tone="muted">Tổng thành viên</AppText>
              <AppText variant="body" weight="semibold">{currentGroupMembers.length}</AppText>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: c.divider }]} />
            <View style={styles.infoRow}>
              <AppText variant="body" tone="muted">Thành viên ảo</AppText>
              <AppText variant="body" weight="semibold">
                {currentGroupMembers.filter((m) => m.is_virtual).length}
              </AppText>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: c.divider }]} />
            <View style={styles.infoRow}>
              <AppText variant="body" tone="muted">Tổng chuyến đi</AppText>
              <AppText variant="body" weight="semibold">{trips.length}</AppText>
            </View>
          </View>

          {isOwner && (
            <Button variant="danger" size="md" onPress={handleDeleteGroup}>
              <Button.Label>Xóa nhóm</Button.Label>
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabContent: { flex: 1 },
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },

  memberActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  memberTrailing: { alignItems: 'flex-end', gap: 6 },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },

  inviteBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  inviteInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },

  pendingLabel: { marginBottom: 8, marginTop: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center' },

  settingsContent: { padding: 16, gap: 16 },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 36,
  },
  infoDivider: {
    height: 1,
    marginVertical: 8,
  },
});
