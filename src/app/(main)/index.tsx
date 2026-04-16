import { Stack, useRouter } from 'expo-router';
import { Button } from 'heroui-native';
import { Plus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { CreateJoinSheet } from '../../components/common/CreateJoinSheet';
import { SettingsSheet } from '../../components/common/SettingsSheet';
import { GroupBalancePill } from '../../components/home/GroupBalancePill';
import { HeroDebt } from '../../components/home/HeroDebt';
import {
  AnimatedEntrance,
  AppCard,
  AppText,
  Avatar,
  EmptyState,
  ListSkeleton,
} from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupWithMemberCount } from '../../services/group.service';
import { useAuthStore } from '../../stores/auth.store';
import { useGroupStore } from '../../stores/group.store';

export default function HomeScreen() {
  const router = useRouter();
  const c = useAppTheme();
  const user = useAuthStore((s) => s.user);

  const { groups, balanceSummary, isLoading, loadGroups } = useGroupStore();

  const [joinPendingGroup, setJoinPendingGroup] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createJoinOpen, setCreateJoinOpen] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  const getBorderColor = (bal: number): string | undefined => {
    if (bal > 0) return c.success;
    if (bal < 0) return c.danger;
    return undefined;
  };

  const renderGroup = ({ item, index }: { item: GroupWithMemberCount; index: number }) => {
    const balance = balanceSummary.groupBalances[item.id] ?? 0;
    const borderColor = getBorderColor(balance);

    return (
      <AnimatedEntrance delay={Math.min(index * 50, 500)}>
        <AppCard
          title={item.name}
          subtitle={`${item.member_count} thành viên`}
          onPress={() => router.push(`/(main)/groups/${item.id}`)}
          leading={<Avatar seed={item.id} label={item.name} size={44} />}
          trailing={<GroupBalancePill balance={balanceSummary.groupBalances[item.id] ?? 0} />}
          borderLeft={borderColor ? { width: 3, color: borderColor } : undefined}
        />
      </AnimatedEntrance>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              onPress={() => setCreateJoinOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Tạo hoặc tham gia nhóm"
              android_ripple={{ color: c.divider, borderless: true, radius: 22 }}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && { opacity: 0.45, backgroundColor: c.divider, borderRadius: 22 },
              ]}
            >
              <Plus size={22} color={c.foreground} strokeWidth={2.2} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => setSettingsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Mở cài đặt & hồ sơ"
              android_ripple={{ color: c.divider, borderless: true, radius: 22 }}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && { opacity: 0.55 },
              ]}
            >
              <Avatar seed={user?.id ?? 'guest'} label={user?.email} size={32} />
            </Pressable>
          ),
        }}
      />

      {/* Hero: owed / owing / settled — luôn hiện khi có nhóm */}
      {groups.length > 0 && <HeroDebt total={balanceSummary.total} />}

      {/* Pending banner — khi user vừa gửi join request (BR-09) */}
      {joinPendingGroup && (
        <View style={[styles.pendingBanner, { backgroundColor: c.accentSoft }]}>
          <AppText variant="body" weight="semibold" tone="primary">
            Yêu cầu đã gửi — chờ duyệt
          </AppText>
          <AppText variant="caption" tone="muted" style={styles.pendingHint}>
            Nhóm "{joinPendingGroup}" cần xét duyệt trước khi bạn trở thành thành viên.
          </AppText>
          <View style={styles.pendingAction}>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setJoinPendingGroup(null)}
            >
              <Button.Label>Đã hiểu</Button.Label>
            </Button>
          </View>
        </View>
      )}

      {/* Group list */}
      {isLoading && groups.length === 0 ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={groups.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={loadGroups} tintColor={c.primaryStrong} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title="Chưa có nhóm nào"
              subtitle="Tạo nhóm mới hoặc nhập mã mời để bắt đầu"
              action={{ label: 'Tạo nhóm', onPress: () => setCreateJoinOpen(true) }}
            />
          }
        />
      )}

      <CreateJoinSheet
        isOpen={createJoinOpen}
        onOpenChange={setCreateJoinOpen}
        onJoinPending={setJoinPendingGroup}
      />
      <SettingsSheet isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  pendingBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
  },
  pendingHint: {
    marginTop: 4,
  },
  pendingAction: {
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
