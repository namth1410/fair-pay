import { Stack, useFocusEffect,useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MapPin } from 'lucide-react-native';

import {
  AppCard,
  AppTextField,
  ChipPicker,
  EmptyState,
  FormReveal,
  ListSkeleton,
  SectionTabs,
} from '../../../components/ui';
import { fonts } from '../../../config/fonts';
import { supabase } from '../../../config/supabase';
import { useAppTheme } from '../../../hooks/useAppTheme';
import type { GroupMember, JoinRequest } from '../../../services/group.service';
import type { Trip } from '../../../services/trip.service';
import { useAuthStore } from '../../../stores/auth.store';
import { useGroupStore } from '../../../stores/group.store';
import { useTripStore } from '../../../stores/trip.store';
import { getErrorMessage } from '../../../utils/error';

type Tab = 'trips' | 'members' | 'settings';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Chủ nhóm',
  admin: 'Quản trị',
  member: 'Thành viên',
};

const ROLE_COLORS: Record<string, string> = {
  owner: '#D97706',
  admin: '#1D6FA8',
  member: '#64748B',
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
  const [myRole, setMyRole] = useState<string>('member');
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripType, setNewTripType] = useState<Trip['type']>('other');

  const group = groups.find((g) => g.id === id);

  useEffect(() => {
    if (!id) return;
    loadMembers(id);
    loadTrips(id);
  }, [id]);

  // Determine current user's role
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
        if (me) setMyRole(me.role);
      }
    };
    findMyRole();
  }, [user, currentGroupMembers]);

  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  // Kiểm tra nhóm đã có admin chưa (max 1 admin rule)
  const hasAdmin = currentGroupMembers.some((m) => m.role === 'admin' && !m.left_at);

  // Load pending requests khi admin vào màn hình (F-23)
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
      message: `Tham gia nhóm "${group.name}" trên SplitVN!\nMã mời: ${group.invite_code}`,
    });
  };

  const handleChangeRole = (member: GroupMember) => {
    if (member.role === 'owner') return;
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    Alert.alert('Thay đổi vai trò', `Đổi ${member.display_name} thành ${ROLE_LABELS[newRole]}?`, [
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

  // ── Render helpers ──
  const renderTrip = ({ item }: { item: Trip }) => (
    <AppCard
      title={item.name}
      subtitle={`${TRIP_TYPE_LABELS[item.type]} · ${item.status === 'open' ? 'Đang mở' : 'Đã đóng'}`}
      onPress={() => router.push(`/(main)/trips/${item.id}`)}
      trailing={
        isAdmin ? (
          <Pressable
            onPress={() => toggleTripStatus(item)}
            accessibilityRole="button"
            accessibilityLabel={item.status === 'open' ? 'Đóng' : 'Mở lại'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: item.status === 'open' ? c.danger : c.success, fontSize: 13 }}>
              {item.status === 'open' ? 'Đóng' : 'Mở lại'}
            </Text>
          </Pressable>
        ) : undefined
      }
    />
  );

  const renderMember = ({ item }: { item: GroupMember }) => (
    <AppCard
      title={`${item.display_name}${item.is_virtual ? ' (ảo)' : ''}`}
      subtitle={ROLE_LABELS[item.role]}
      trailing={
        isAdmin && item.role !== 'owner' ? (
          <View style={styles.memberActions}>
            {isOwner && (
              <Pressable
                onPress={() => handleChangeRole(item)}
                disabled={item.role === 'member' && hasAdmin}
                accessibilityRole="button"
                accessibilityLabel={item.role === 'admin' ? 'Hạ quyền' : 'Lên admin'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{
                  color: item.role === 'admin'
                    ? c.danger
                    : (hasAdmin ? c.divider : c.primary),
                  fontSize: 13,
                }}>
                  {item.role === 'admin' ? 'Hạ quyền' : 'Lên admin'}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => handleKick(item)}
              accessibilityRole="button"
              accessibilityLabel="Xóa"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ color: c.danger, fontSize: 13 }}>Xóa</Text>
            </Pressable>
          </View>
        ) : undefined
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
          <Pressable
            onPress={handleShare}
            style={[styles.inviteBanner, { backgroundColor: c.surfaceAlt }]}
            accessibilityRole="button"
            accessibilityLabel="Chia sẻ mã mời"
          >
            <Text style={[styles.inviteLabel, { color: c.muted }]}>Mã mời:</Text>
            <Text style={[styles.inviteCode, { color: c.primary }]}>{group?.invite_code}</Text>
            <Text style={[styles.inviteTap, { color: c.muted }]}>Nhấn để chia sẻ</Text>
          </Pressable>
          {/* Pending join requests — chỉ hiện cho Admin/Owner (F-23) */}
          {isAdmin && pendingJoinRequests.length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
              <Text style={[styles.pendingLabel, { color: c.muted }]}>
                Yêu cầu tham gia ({pendingJoinRequests.length})
              </Text>
              {pendingJoinRequests.map((req) => (
                <AppCard
                  key={req.id}
                  title={req.display_name}
                  subtitle="Đang chờ duyệt"
                  borderLeft={{ width: 3, color: '#D97706' }}
                  trailing={
                    <View style={styles.memberActions}>
                      <Pressable
                        onPress={() => handleApprove(req)}
                        accessibilityRole="button"
                        accessibilityLabel="Duyệt"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ color: c.success, fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600' }}>Duyệt</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleReject(req)}
                        accessibilityRole="button"
                        accessibilityLabel="Từ chối"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ color: c.danger, fontSize: 13 }}>Từ chối</Text>
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
  memberActions: { flexDirection: 'row', gap: 12 },
  inviteBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 10 },
  inviteLabel: { fontSize: 13 },
  inviteCode: { fontSize: 16, fontFamily: fonts.bold, fontWeight: '700', flex: 1 },
  inviteTap: { fontSize: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  settingsContent: { padding: 16, gap: 12 },
  pendingLabel: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', marginBottom: 6, marginTop: 4 },
});
