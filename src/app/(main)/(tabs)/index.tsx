import { useFocusEffect, useRouter } from 'expo-router';
import { Plus, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateJoinSheet } from '../../../components/common/CreateJoinSheet';
import { GroupCarousel } from '../../../components/home/GroupCarousel';
import { GroupRow } from '../../../components/home/GroupRow';
import { HeroDebt } from '../../../components/home/HeroDebt';
import { HomeViewToggle } from '../../../components/home/HomeViewToggle';
import { PendingRibbon } from '../../../components/home/PendingRibbon';
import { SectionHeader } from '../../../components/home/SectionHeader';
import {
  AnimatedEntrance,
  EmptyState,
  ListSkeleton,
} from '../../../components/ui';
import { SuckTarget, useBlackHole } from '../../../contexts/BlackHoleTransition';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useGroupStore } from '../../../stores/group.store';
import { useNotificationStore } from '../../../stores/notification.store';
import { useUIStore } from '../../../stores/ui.store';
import { hapticLight } from '../../../utils/haptics';
import { setHomeViewMode, useHomeViewMode } from '../../../utils/userPreferences';

export default function HomeScreen() {
  const router = useRouter();
  const c = useAppTheme();
  const insets = useSafeAreaInsets();
  const blackHole = useBlackHole();
  const viewMode = useHomeViewMode();

  const { groups, balanceSummary, isLoading, loadGroups } = useGroupStore();

  const [joinPendingGroup, setJoinPendingGroup] = useState<string | null>(null);
  const createJoinOpen = useUIStore((s) => s.createJoinOpen);
  const setCreateJoinOpen = useUIStore((s) => s.setCreateJoinOpen);

  useEffect(() => {
    loadGroups();
  }, []);

  // Refresh unread badge mỗi lần home screen focus (polling on focus —
  // không setInterval để tránh drain pin).
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount();
    }, [refreshUnreadCount])
  );

  const handleViewModeChange = useCallback((mode: 'list' | 'carousel') => {
    void setHomeViewMode(mode);
  }, []);

  const handleOpenCreateJoin = useCallback(() => {
    hapticLight();
    setCreateJoinOpen(true);
  }, [setCreateJoinOpen]);

  const showHero = groups.length > 0;
  const showToggle = groups.length > 0;
  let groupsTagline: string | undefined;
  if (groups.length === 0) {
    groupsTagline = undefined;
  } else if (viewMode === 'carousel') {
    groupsTagline = 'Vuốt qua lại để duyệt vòng tròn các nhóm';
  } else {
    groupsTagline = 'Chạm vào một nhóm để xem chi tiết · vuốt để làm mới';
  }

  const showSkeleton = isLoading && groups.length === 0;
  const isEmpty = !showSkeleton && groups.length === 0;

  let listBody;
  if (isEmpty) {
    listBody = (
      <EmptyState
        icon={Users}
        title="Chưa có nhóm nào"
        subtitle="Tạo nhóm mới hoặc nhập mã mời để bắt đầu"
        action={{
          label: 'Tạo nhóm',
          onPress: () => setCreateJoinOpen(true),
        }}
      />
    );
  } else if (viewMode === 'carousel') {
    listBody = (
      <GroupCarousel
        groups={groups}
        groupBalances={balanceSummary.groupBalances}
      />
    );
  } else {
    listBody = (
      <View>
        {groups.map((item, index) => (
          <AnimatedEntrance key={item.id} delay={Math.min(index * 45, 450)}>
            <View style={styles.rowGutter}>
              <SuckTarget radius={16}>
                <GroupRow
                  id={item.id}
                  name={item.name}
                  avatarUrl={item.avatar_url}
                  memberCount={item.member_count}
                  balance={balanceSummary.groupBalances[item.id] ?? 0}
                  onPress={() =>
                    blackHole.suck({
                      onCovered: () =>
                        router.push(`/(main)/groups/${item.id}`),
                    })
                  }
                />
              </SuckTarget>
            </View>
          </AnimatedEntrance>
        ))}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.background, paddingTop: insets.top },
      ]}
    >
      {showSkeleton ? (
        <ListSkeleton count={4} />
      ) : (
        <ScrollView
          contentContainerStyle={isEmpty ? styles.emptyContainer : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={loadGroups}
              tintColor={c.primaryStrong}
            />
          }
        >
          {showHero && (
            <View style={styles.heroGutter}>
              <SuckTarget radius={24}>
                <HeroDebt total={balanceSummary.total} />
              </SuckTarget>
            </View>
          )}
          {joinPendingGroup && (
            <SuckTarget radius={14}>
              <PendingRibbon
                groupName={joinPendingGroup}
                onDismiss={() => setJoinPendingGroup(null)}
              />
            </SuckTarget>
          )}
          {showHero && (
            <SuckTarget>
              <SectionHeader
                title="NHÓM CỦA BẠN"
                count={groups.length}
                tagline={groupsTagline}
                right={
                  <View style={styles.headerRight}>
                    {showToggle && (
                      <HomeViewToggle
                        value={viewMode}
                        onChange={handleViewModeChange}
                      />
                    )}
                    <Pressable
                      onPress={handleOpenCreateJoin}
                      accessibilityRole="button"
                      accessibilityLabel="Thêm nhóm mới"
                      accessibilityHint="Mở bảng tạo nhóm hoặc nhập mã mời"
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.addBtn,
                        {
                          backgroundColor: c.primary,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Plus
                        size={16}
                        color={c.inverseForeground}
                        strokeWidth={2.4}
                      />
                    </Pressable>
                  </View>
                }
              />
            </SuckTarget>
          )}

          {listBody}
        </ScrollView>
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

  list: { paddingTop: 4, paddingBottom: 120 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  rowGutter: { marginHorizontal: 16 },

  // Margin nằm NGOÀI SuckTarget — xem comment trong BlackHoleTransition.tsx
  // (SuckTarget bounds phải khớp với visual rect, không bao gồm margin).
  heroGutter: { marginHorizontal: 16, marginTop: 12, marginBottom: 10 },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
