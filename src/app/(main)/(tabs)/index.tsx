import { useFocusEffect, useRouter } from 'expo-router';
import SquarePen from 'lucide-react-native/dist/esm/icons/square-pen';
import Users from 'lucide-react-native/dist/esm/icons/users';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { CreateJoinSheet } from '../../../components/common/CreateJoinSheet';
import { WelcomeDialog } from '../../../components/common/WelcomeDialog';
import { HeaderIconButton, LargeTitleHeader } from '../../../components/header/LargeTitleHeader';
import { DragonSummaryBubble } from '../../../components/home/DragonSummaryBubble';
import { GroupChatRow } from '../../../components/home/GroupChatRow';
import { HomeSkeleton } from '../../../components/home/HomeSkeleton';
import { PendingRibbon } from '../../../components/home/PendingRibbon';
import { PinPickerSheet } from '../../../components/home/PinPickerSheet';
import { TripStoriesRow } from '../../../components/home/TripStoriesRow';
import {
  AnimatedEntrance,
  EmptyState,
} from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useAuthStore } from '../../../stores/auth.store';
import { useGroupStore } from '../../../stores/group.store';
import { useNotificationStore } from '../../../stores/notification.store';
import { useTripStore } from '../../../stores/trip.store';
import { useUIStore } from '../../../stores/ui.store';
import * as syncBus from '../../../sync/syncBus';
import { hasWelcomed, markWelcomed } from '../../../utils/welcomeFlag';

// Trang chủ giao diện "Hội thoại" (2026-10): danh sách nhóm như danh sách đoạn chat,
// chuyến đã ghim là hàng "story", rồng Fair Pay gửi tin tổng kết số dư.
export default function HomeScreen() {
  const router = useRouter();
  const c = useAppTheme();

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

  // Tổng được nhận / đang nợ tính trên các nhóm đang hiện — để câu tổng kết của rồng
  // luôn khớp với danh sách bên dưới.
  const { owed, owing } = useMemo(() => {
    let pos = 0;
    let neg = 0;
    for (const g of groups) {
      const b = balanceSummary.groupBalances[g.id] ?? 0;
      if (b > 0) pos += b;
      else if (b < 0) neg += -b;
    }
    return { owed: pos, owing: neg };
  }, [groups, balanceSummary.groupBalances]);

  const hasGroups = groups.length > 0;
  const showSkeleton = isLoading && !hasGroups;
  const isEmpty = !showSkeleton && !hasGroups;

  return (
    <View
      style={[styles.container, { backgroundColor: c.surface }]}
    >
      <LargeTitleHeader
        title="Nhóm"
        right={
          <HeaderIconButton
            Icon={SquarePen}
            accessibilityLabel="Tạo nhóm hoặc nhập mã mời"
            onPress={() => setCreateJoinOpen(true)}
          />
        }
      />

      {showSkeleton ? (
        <HomeSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={isEmpty ? styles.emptyContainer : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={loadGroups}
              tintColor={c.primary}
              colors={[c.primary]}
            />
          }
        >
          {isEmpty ? (
            <EmptyState
              icon={Users}
              title="Chưa có nhóm nào"
              subtitle="Tạo nhóm mới hoặc nhập mã mời để bắt đầu"
              action={{
                label: 'Tạo nhóm',
                onPress: () => setCreateJoinOpen(true),
              }}
            />
          ) : (
            <>
              <TripStoriesRow onPinPress={() => setPinPickerOpen(true)} />

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

              <View style={styles.summary}>
                <DragonSummaryBubble
                  total={owed - owing}
                  owed={owed}
                  owing={owing}
                  groupCount={groups.length}
                />
              </View>

              <View style={styles.rows}>
                {groups.map((item, index) => (
                  <AnimatedEntrance key={item.id} delay={Math.min(index * 45, 450)}>
                    <GroupChatRow
                      id={item.id}
                      name={item.name}
                      avatarUrl={item.avatar_url}
                      memberCount={item.member_count}
                      balance={balanceSummary.groupBalances[item.id] ?? 0}
                      isLast={index === groups.length - 1}
                      onPress={() => router.push(`/(main)/groups/${item.id}`)}
                    />
                  </AnimatedEntrance>
                ))}
              </View>
            </>
          )}
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

  list: { paddingTop: 2, paddingBottom: 120 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  summary: { marginTop: 18, marginBottom: 8 },
  rows: { marginTop: 4 },
});
