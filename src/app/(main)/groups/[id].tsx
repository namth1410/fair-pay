import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  useColorScheme,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Button } from 'heroui-native';
import { useGroupStore } from '../../../stores/group.store';
import { useTripStore } from '../../../stores/trip.store';
import { useAuthStore } from '../../../stores/auth.store';
import { colors } from '../../../config/theme';
import { getErrorMessage } from '../../../utils/error';
import { supabase } from '../../../config/supabase';
import type { GroupMember } from '../../../services/group.service';
import type { Trip } from '../../../services/trip.service';

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

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  const { groups, currentGroupMembers, loadMembers, changeRole, kickMember, removeGroup } =
    useGroupStore();
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
    <Pressable
      onPress={() => router.push(`/(main)/trips/${item.id}`)}
      style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}
    >
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: c.foreground }]}>{item.name}</Text>
        <Text style={[styles.cardMeta, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          {TRIP_TYPE_LABELS[item.type]} · {item.status === 'open' ? 'Đang mở' : 'Đã đóng'}
        </Text>
      </View>
      {isAdmin && (
        <Pressable onPress={() => toggleTripStatus(item)}>
          <Text style={{ color: item.status === 'open' ? c.danger : c.success, fontSize: 13 }}>
            {item.status === 'open' ? 'Đóng' : 'Mở lại'}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );

  const renderMember = ({ item }: { item: GroupMember }) => (
    <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: c.foreground }]}>
          {item.display_name}{item.is_virtual ? ' (ảo)' : ''}
        </Text>
        <Text style={[styles.roleBadge, { color: ROLE_COLORS[item.role] }]}>
          {ROLE_LABELS[item.role]}
        </Text>
      </View>
      {isAdmin && item.role !== 'owner' && (
        <View style={styles.memberActions}>
          {isOwner && (
            <Pressable onPress={() => handleChangeRole(item)}>
              <Text style={{ color: c.primary, fontSize: 13 }}>
                {item.role === 'admin' ? 'Hạ quyền' : 'Lên admin'}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={() => handleKick(item)}>
            <Text style={{ color: c.danger, fontSize: 13 }}>Xóa</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const tabStyle = (t: Tab) => [
    styles.tab,
    {
      backgroundColor: tab === t ? c.primary : 'transparent',
      borderColor: tab === t ? c.primary : isDark ? '#334155' : '#E2E8F0',
    },
  ];

  const tabText = (t: Tab) => ({
    color: tab === t ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
    fontSize: 14,
    fontWeight: '500' as const,
  });

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: group?.name || 'Nhóm' }} />

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable style={tabStyle('trips')} onPress={() => setTab('trips')}>
          <Text style={tabText('trips')}>Chuyến đi ({trips.length})</Text>
        </Pressable>
        <Pressable style={tabStyle('members')} onPress={() => setTab('members')}>
          <Text style={tabText('members')}>Thành viên ({currentGroupMembers.length})</Text>
        </Pressable>
        {isAdmin && (
          <Pressable style={tabStyle('settings')} onPress={() => setTab('settings')}>
            <Text style={tabText('settings')}>Cài đặt</Text>
          </Pressable>
        )}
      </View>

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

          {showCreateTrip && (
            <View style={[styles.formCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <TextInput
                style={[styles.input, {
                  color: c.foreground,
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                }]}
                placeholder="Tên chuyến (VD: Đà Lạt T4/2026)"
                placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                value={newTripName}
                onChangeText={setNewTripName}
                autoFocus
              />
              {/* Type picker */}
              <View style={styles.typePicker}>
                {(['travel', 'meal', 'event', 'other'] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setNewTripType(t)}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: newTripType === t ? c.primary : 'transparent',
                        borderColor: newTripType === t ? c.primary : isDark ? '#334155' : '#E2E8F0',
                      },
                    ]}
                  >
                    <Text style={{ color: newTripType === t ? '#FFF' : isDark ? '#94A3B8' : '#64748B', fontSize: 13 }}>
                      {TRIP_TYPE_LABELS[t]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Button variant="primary" size="sm" onPress={handleCreateTrip}>
                <Button.Label>Tạo</Button.Label>
              </Button>
            </View>
          )}

          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            renderItem={renderTrip}
            contentContainerStyle={trips.length === 0 ? styles.emptyContainer : styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: c.foreground, opacity: 0.4 }]}>
                  Chưa có chuyến đi nào
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* ── Tab: Members ── */}
      {tab === 'members' && (
        <View style={styles.tabContent}>
          <Pressable
            onPress={handleShare}
            style={[styles.inviteBanner, { backgroundColor: isDark ? '#1E293B' : '#F0F9FF' }]}
          >
            <Text style={[styles.inviteLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Mã mời:</Text>
            <Text style={[styles.inviteCode, { color: c.primary }]}>{group?.invite_code}</Text>
            <Text style={[styles.inviteTap, { color: isDark ? '#94A3B8' : '#64748B' }]}>Nhấn để chia sẻ</Text>
          </Pressable>
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
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabContent: { flex: 1 },
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  formCard: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, gap: 8 },
  input: { height: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  typePicker: { flexDirection: 'row', gap: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 6 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '500' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  roleBadge: { fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 12 },
  inviteBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 10 },
  inviteLabel: { fontSize: 13 },
  inviteCode: { fontSize: 16, fontWeight: '700', flex: 1 },
  inviteTap: { fontSize: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16 },
  settingsContent: { padding: 16, gap: 12 },
});
