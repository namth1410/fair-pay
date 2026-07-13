import { useFocusEffect, useRouter } from 'expo-router';
import Plus from 'lucide-react-native/dist/esm/icons/plus';
import Users from 'lucide-react-native/dist/esm/icons/users';
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
import { WelcomeDialog } from '../../../components/common/WelcomeDialog';
import { GroupArcCarousel } from '../../../components/home/GroupArcCarousel';
import { GroupCarousel } from '../../../components/home/GroupCarousel';
import { GroupRow } from '../../../components/home/GroupRow';
import { HeroDebt } from '../../../components/home/HeroDebt';
import { HomeViewToggle } from '../../../components/home/HomeViewToggle';
import { PendingRibbon } from '../../../components/home/PendingRibbon';
import { PinnedTripsSection } from '../../../components/home/PinnedTripsSection';
import { PinPickerSheet } from '../../../components/home/PinPickerSheet';
import { SectionHeader } from '../../../components/home/SectionHeader';
import {
  AnimatedEntrance,
  EmptyState,
  ListSkeleton,
} from '../../../components/ui';
import { MIN_GROUPS_FOR_CAROUSEL } from '../../../config/constants';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useAppStore } from '../../../stores/app.store';
import { useAuthStore } from '../../../stores/auth.store';
import { useGroupStore } from '../../../stores/group.store';
import { useNotificationStore } from '../../../stores/notification.store';
import { useTripStore } from '../../../stores/trip.store';
import { useUIStore } from '../../../stores/ui.store';
import * as syncBus from '../../../sync/syncBus';
import { hapticLight } from '../../../utils/haptics';
import { setHomeViewMode, useHomeViewMode } from '../../../utils/userPreferences';
import { hasWelcomed, markWelcomed } from '../../../utils/welcomeFlag';

export default function HomeScreen() {
  const router = useRouter();
  const c = useAppTheme();
  const insets = useSafeAreaInsets();
  const bannerVisible = useAppStore((s) => s.bannerVisible);
  const viewMode = useHomeViewMode();

  const { groups, balanceSummary, isLoading, loadGroups, myPendingJoinRequests } =
    useGroupStore();

  // Dismiss per-session: ẩn ribbon nào user đã đóng trong session hiện tại.
  // Server vẫn giữ status='pending' — ribbon sẽ quay lại ở lần app khởi động sau
  // cho đến khi admin duyệt/từ chối.
  const [dismissedRequestIds, setDismissedRequestIds] = useState<Set<string>>(
    () => new Set()
  );
  const visiblePendingRequests = myPendingJoinRequests.filter(
    (r) => !dismissedRequestIds.has(r.request_id)
  );
  const createJoinOpen = useUIStore((s) => s.createJoinOpen);
  const setCreateJoinOpen = useUIStore((s) => s.setCreateJoinOpen);

  const authId = useAuthStore((s) => s.user?.id);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  // Revalidate khi sync nền pull về thay đổi (resume từ background sau lâu,
  // offline→online, hoặc thay đổi từ thiết bị khác). quiet=true → không nháy
  // skeleton/spinner, chỉ âm thầm cập nhật. Trước đây home KHÔNG tự cập nhật khi
  // resume vì useFocusEffect không fire qua AppState (không có navigation focus)
  // → đứng yên data cũ cho tới khi user rời màn rồi quay lại / kéo refresh tay.
  useEffect(() => {
    return syncBus.subscribe(() => {
      void useGroupStore.getState().loadGroups({ quiet: true });
    });
  }, []);

  useEffect(() => {
    if (!authId) return;
    let cancelled = false;
    (async () => {
      const seen = await hasWelcomed(authId);
      if (!cancelled && !seen) setShowWelcome(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authId]);

  const handleDismissWelcome = useCallback(() => {
    setShowWelcome(false);
    if (authId) {
      void markWelcomed(authId);
    }
  }, [authId]);

  // Refresh unread badge mỗi lần home screen focus (polling on focus —
  // không setInterval để tránh drain pin).
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
  const loadPinnedTrips = useTripStore((s) => s.loadPinnedTrips);
  const loadBalanceSummary = useGroupStore((s) => s.loadBalanceSummary);
  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount();
      loadPinnedTrips();
      loadBalanceSummary();
    }, [refreshUnreadCount, loadPinnedTrips, loadBalanceSummary])
  );

  const [pinPickerOpen, setPinPickerOpen] = useState(false);

  const handleViewModeChange = useCallback(
    (mode: 'list' | 'carousel' | 'arc') => {
      void setHomeViewMode(mode);
    },
    [],
  );

  const handleOpenCreateJoin = useCallback(() => {
    hapticLight();
    setCreateJoinOpen(true);
  }, [setCreateJoinOpen]);

  const showHero = groups.length > 0;
  // Carousel/arc chỉ có nghĩa khi đủ nhóm để vuốt (≥ MIN_GROUPS_FOR_CAROUSEL).
  // Dưới ngưỡng: ẩn toggle + ép `list` cho gọn, nhưng GIỮ preference trong cache
  // (useHomeViewMode) → tự áp lại khi user đạt đủ nhóm, không mất lựa chọn.
  const canUseCarousel = groups.length >= MIN_GROUPS_FOR_CAROUSEL;
  const showToggle = canUseCarousel;
  const effectiveViewMode = canUseCarousel ? viewMode : 'list';

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
  } else if (effectiveViewMode === 'carousel') {
    listBody = (
      <GroupCarousel
        groups={groups}
        groupBalances={balanceSummary.groupBalances}
      />
    );
  } else if (effectiveViewMode === 'arc') {
    listBody = (
      <GroupArcCarousel
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
              <GroupRow
                id={item.id}
                name={item.name}
                avatarUrl={item.avatar_url}
                memberCount={item.member_count}
                balance={balanceSummary.groupBalances[item.id] ?? 0}
                onPress={() => router.push(`/(main)/groups/${item.id}`)}
              />
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
        {
          backgroundColor: c.background,
          // Banner đã cover status bar area khi visible → bỏ insets.top để
          // tránh whitespace redundant dưới banner.
          paddingTop: bannerVisible ? 0 : insets.top,
        },
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
              <HeroDebt total={balanceSummary.total} />
            </View>
          )}
          {visiblePendingRequests.map((req) => (
            <PendingRibbon
              key={req.request_id}
              groupName={req.group_name}
              onDismiss={() =>
                setDismissedRequestIds((prev) => {
                  const next = new Set(prev);
                  next.add(req.request_id);
                  return next;
                })
              }
            />
          ))}
          {showHero && (
            <PinnedTripsSection onManagePress={() => setPinPickerOpen(true)} />
          )}
          {showHero && (
            <SectionHeader
              title="NHÓM CỦA BẠN"
              count={groups.length}
              right={
                <View style={styles.headerRight}>
                  {showToggle && (
                    <HomeViewToggle
                      value={effectiveViewMode}
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
          )}

          {listBody}
        </ScrollView>
      )}

      <CreateJoinSheet
        isOpen={createJoinOpen}
        onOpenChange={setCreateJoinOpen}
      />

      <PinPickerSheet
        isOpen={pinPickerOpen}
        onOpenChange={setPinPickerOpen}
      />

      <WelcomeDialog isOpen={showWelcome} onClose={handleDismissWelcome} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  list: { paddingTop: 4, paddingBottom: 120 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  rowGutter: { marginHorizontal: 16 },

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
