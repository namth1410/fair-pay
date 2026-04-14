import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  useColorScheme,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Button } from 'heroui-native';
import { useGroupStore } from '../../../stores/group.store';
import { useAuthStore } from '../../../stores/auth.store';
import { colors } from '../../../config/theme';
import { supabase } from '../../../config/supabase';
import type { GroupMember } from '../../../services/group.service';

type Tab = 'members' | 'trips' | 'settings';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Chủ nhóm',
  admin: 'Quản trị',
  member: 'Thành viên',
};

const ROLE_COLORS = {
  owner: '#D97706',
  admin: '#1D6FA8',
  member: '#64748B',
};

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  const { groups, currentGroupMembers, loadMembers, changeRole, kickMember, removeGroup } =
    useGroupStore();
  const { user } = useAuthStore();

  const [tab, setTab] = useState<Tab>('members');
  const [myRole, setMyRole] = useState<string>('member');
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const group = groups.find((g) => g.id === id);

  useEffect(() => {
    if (!id) return;
    loadMembers(id);

    // Get group info
    if (group) {
      setGroupName(group.name);
      setInviteCode(group.invite_code);
    }
  }, [id, group?.name]);

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

  const handleShare = async () => {
    await Share.share({
      message: `Tham gia nhóm "${groupName}" trên SplitVN!\nMã mời: ${inviteCode}`,
    });
  };

  const handleChangeRole = (member: GroupMember) => {
    if (member.role === 'owner') return; // Can't change owner role
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    Alert.alert(
      'Thay đổi vai trò',
      `Đổi ${member.display_name} thành ${ROLE_LABELS[newRole]}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: () => changeRole(member.id, newRole),
        },
      ]
    );
  };

  const handleKick = (member: GroupMember) => {
    Alert.alert(
      'Xóa thành viên',
      `Xóa ${member.display_name} khỏi nhóm?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => kickMember(member.id, id!),
        },
      ]
    );
  };

  const handleDeleteGroup = () => {
    Alert.alert('Xóa nhóm', `Bạn có chắc muốn xóa nhóm "${groupName}"?`, [
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

  const renderMember = ({ item }: { item: GroupMember }) => (
    <View style={[styles.memberRow, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: c.foreground }]}>
          {item.display_name}
          {item.is_virtual ? ' (ảo)' : ''}
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

  const tabTextStyle = (t: Tab) => ({
    color: tab === t ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
    fontSize: 14,
    fontWeight: '500' as const,
  });

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: groupName || 'Nhóm' }} />

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable style={tabStyle('members')} onPress={() => setTab('members')}>
          <Text style={tabTextStyle('members')}>
            Thành viên ({currentGroupMembers.length})
          </Text>
        </Pressable>
        <Pressable style={tabStyle('trips')} onPress={() => setTab('trips')}>
          <Text style={tabTextStyle('trips')}>Chuyến đi</Text>
        </Pressable>
        {isAdmin && (
          <Pressable style={tabStyle('settings')} onPress={() => setTab('settings')}>
            <Text style={tabTextStyle('settings')}>Cài đặt</Text>
          </Pressable>
        )}
      </View>

      {/* Tab: Members */}
      {tab === 'members' && (
        <View style={styles.tabContent}>
          {/* Invite code banner */}
          <Pressable
            onPress={handleShare}
            style={[styles.inviteBanner, { backgroundColor: isDark ? '#1E293B' : '#F0F9FF' }]}
          >
            <Text style={[styles.inviteLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Mã mời:
            </Text>
            <Text style={[styles.inviteCode, { color: c.primary }]}>
              {inviteCode}
            </Text>
            <Text style={[styles.inviteTap, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Nhấn để chia sẻ
            </Text>
          </Pressable>

          <FlatList
            data={currentGroupMembers}
            keyExtractor={(item) => item.id}
            renderItem={renderMember}
            contentContainerStyle={styles.memberList}
          />
        </View>
      )}

      {/* Tab: Trips (placeholder for Phase 2) */}
      {tab === 'trips' && (
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, { color: c.foreground, opacity: 0.4 }]}>
            Chuyến đi sẽ có ở đây (Phase 2)
          </Text>
        </View>
      )}

      {/* Tab: Settings (admin/owner only) */}
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
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabContent: { flex: 1 },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
  },
  inviteLabel: { fontSize: 13 },
  inviteCode: { fontSize: 16, fontWeight: '700', flex: 1 },
  inviteTap: { fontSize: 12 },
  memberList: { paddingHorizontal: 16, paddingBottom: 24 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '500' },
  roleBadge: { fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 12 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 16 },
  settingsContent: { padding: 16, gap: 12 },
});
