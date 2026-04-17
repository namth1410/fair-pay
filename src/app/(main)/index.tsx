import { Stack, useRouter } from 'expo-router';
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
import { GroupRow } from '../../components/home/GroupRow';
import { HeroDebt } from '../../components/home/HeroDebt';
import { PendingRibbon } from '../../components/home/PendingRibbon';
import { SectionHeader } from '../../components/home/SectionHeader';
import {
  AnimatedEntrance,
  EmptyState,
  ListSkeleton,
} from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupWithMemberCount } from '../../services/group.service';
import { useGroupStore } from '../../stores/group.store';

export default function HomeScreen() {
  const router = useRouter();
  const c = useAppTheme();

  const { groups, balanceSummary, isLoading, loadGroups } = useGroupStore();

  const [joinPendingGroup, setJoinPendingGroup] = useState<string | null>(null);
  const [createJoinOpen, setCreateJoinOpen] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  const renderGroup = ({
    item,
    index,
  }: {
    item: GroupWithMemberCount;
    index: number;
  }) => (
    <AnimatedEntrance delay={Math.min(index * 45, 450)}>
      <View style={styles.rowGutter}>
        <GroupRow
          id={item.id}
          name={item.name}
          memberCount={item.member_count}
          balance={balanceSummary.groupBalances[item.id] ?? 0}
          onPress={() => router.push(`/(main)/groups/${item.id}`)}
        />
      </View>
    </AnimatedEntrance>
  );

  const showHero = groups.length > 0;
  const groupsTagline =
    groups.length > 0
      ? 'Chạm vào một nhóm để xem chi tiết · vuốt để làm mới'
      : undefined;

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
                styles.headerLeftButton,
                pressed && {
                  opacity: 0.45,
                  backgroundColor: c.divider,
                  borderRadius: 22,
                },
              ]}
            >
              <Plus size={22} color={c.foreground} strokeWidth={2.2} />
            </Pressable>
          ),
        }}
      />

      {isLoading && groups.length === 0 ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          ListHeaderComponent={
            <View>
              {showHero && <HeroDebt total={balanceSummary.total} />}
              {joinPendingGroup && (
                <PendingRibbon
                  groupName={joinPendingGroup}
                  onDismiss={() => setJoinPendingGroup(null)}
                />
              )}
              {showHero && (
                <SectionHeader
                  title="NHÓM CỦA BẠN"
                  count={groups.length}
                  tagline={groupsTagline}
                />
              )}
            </View>
          }
          contentContainerStyle={
            groups.length === 0 ? styles.emptyContainer : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={loadGroups}
              tintColor={c.primaryStrong}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title="Chưa có nhóm nào"
              subtitle="Tạo nhóm mới hoặc nhập mã mời để bắt đầu"
              action={{
                label: 'Tạo nhóm',
                onPress: () => setCreateJoinOpen(true),
              }}
            />
          }
        />
      )}

      <CreateJoinSheet
        isOpen={createJoinOpen}
        onOpenChange={setCreateJoinOpen}
        onJoinPending={setJoinPendingGroup}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerLeftButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
  },

  list: { paddingTop: 4, paddingBottom: 28 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  rowGutter: { marginHorizontal: 16 },
});
