import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  useColorScheme,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import { useGroupStore } from '../../stores/group.store';
import { useAuthStore } from '../../stores/auth.store';
import { colors } from '../../config/theme';
import { getErrorMessage } from '../../utils/error';
import type { GroupWithMemberCount } from '../../services/group.service';

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  const { groups, isLoading, loadGroups, createGroup, joinByCode } =
    useGroupStore();
  const { signOut } = useAuthStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    loadGroups();
  }, []);

  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroup(newGroupName.trim());
      setNewGroupName('');
      setShowCreate(false);
    } catch (e: any) {
      Alert.alert('Lỗi', getErrorMessage(e));
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    try {
      await joinByCode(inviteCode.trim());
      setInviteCode('');
      setShowJoin(false);
    } catch (e: any) {
      Alert.alert('Lỗi', getErrorMessage(e));
    }
  };

  const renderGroup = ({ item }: { item: GroupWithMemberCount }) => (
    <Pressable
      onPress={() => router.push(`/(main)/groups/${item.id}`)}
      style={[
        styles.groupCard,
        { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' },
      ]}
    >
      <View style={styles.groupCardContent}>
        <Text style={[styles.groupName, { color: c.foreground }]}>
          {item.name}
        </Text>
        <Text style={[styles.groupMeta, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          {item.member_count} thành viên
        </Text>
      </View>
      <Text style={[styles.groupCode, { color: c.primary }]}>
        #{item.invite_code}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          onPress={() => { setShowCreate(true); setShowJoin(false); }}
        >
          <Button.Label>Tạo nhóm</Button.Label>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => { setShowJoin(true); setShowCreate(false); }}
        >
          <Button.Label>Nhập mã mời</Button.Label>
        </Button>
      </View>

      {/* Create group form */}
      {showCreate && (
        <View style={[styles.formCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
          <TextInput
            style={[styles.input, {
              color: c.foreground,
              borderColor: isDark ? '#334155' : '#E2E8F0',
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            }]}
            placeholder="Tên nhóm mới"
            placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
            value={newGroupName}
            onChangeText={setNewGroupName}
            autoFocus
          />
          <View style={styles.formActions}>
            <Button variant="ghost" size="sm" onPress={() => setShowCreate(false)}>
              <Button.Label>Hủy</Button.Label>
            </Button>
            <Button variant="primary" size="sm" onPress={handleCreate}>
              <Button.Label>Tạo</Button.Label>
            </Button>
          </View>
        </View>
      )}

      {/* Join group form */}
      {showJoin && (
        <View style={[styles.formCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
          <TextInput
            style={[styles.input, {
              color: c.foreground,
              borderColor: isDark ? '#334155' : '#E2E8F0',
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            }]}
            placeholder="Nhập mã mời (VD: a1b2c3)"
            placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
            autoFocus
          />
          <View style={styles.formActions}>
            <Button variant="ghost" size="sm" onPress={() => setShowJoin(false)}>
              <Button.Label>Hủy</Button.Label>
            </Button>
            <Button variant="primary" size="sm" onPress={handleJoin}>
              <Button.Label>Tham gia</Button.Label>
            </Button>
          </View>
        </View>
      )}

      {/* Group list */}
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroup}
        contentContainerStyle={groups.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={loadGroups} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: c.foreground, opacity: 0.4 }]}>
              Chưa có nhóm nào
            </Text>
            <Text style={[styles.emptyHint, { color: c.foreground, opacity: 0.3 }]}>
              Tạo nhóm mới hoặc nhập mã mời để bắt đầu
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  formCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  groupCardContent: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: '600' },
  groupMeta: { fontSize: 13, marginTop: 2 },
  groupCode: { fontSize: 13, fontWeight: '500' },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, marginBottom: 4 },
  emptyHint: { fontSize: 14 },
});
