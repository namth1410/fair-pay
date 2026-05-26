import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { BottomSheet } from 'heroui-native';
import { Check, CheckCheck } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';

import { TabHeader } from '../../../components/header/TabHeader';
import { InvitationConfirmDialog } from '../../../components/group/InvitationConfirmDialog';
import { NotificationRow } from '../../../components/notifications/NotificationRow';
import { AppText, EmptyState, ListSkeleton } from '../../../components/ui';
import { SkiaFireBorder } from '../../../components/ui/skia';
import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  fetchMyGroups,
  fetchMyPendingInvitations,
  type GroupWithMemberCount,
  type MyPendingInvitation,
} from '../../../services/group.service';
import type { Notification } from '../../../services/notification.service';
import { useGroupStore } from '../../../stores/group.store';
import { useNotificationStore } from '../../../stores/notification.store';
import { hapticLight } from '../../../utils/haptics';
import { showError, showSuccess, showWarning } from '../../../utils/toast';

type Bucket = 'today' | 'yesterday' | 'this_week' | 'older';
const BUCKET_LABEL: Record<Bucket, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  this_week: 'Tuần này',
  older: 'Cũ hơn',
};

function bucketOf(iso: string): Bucket {
  const t = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = t.getTime();
  if (ts >= startToday) return 'today';
  if (ts >= startToday - 86400_000) return 'yesterday';
  if (ts >= startToday - 7 * 86400_000) return 'this_week';
  return 'older';
}

function groupBySection(items: Notification[]) {
  const map: Record<Bucket, Notification[]> = {
    today: [],
    yesterday: [],
    this_week: [],
    older: [],
  };
  for (const n of items) map[bucketOf(n.created_at)].push(n);
  const order: Bucket[] = ['today', 'yesterday', 'this_week', 'older'];
  return order
    .filter((k) => map[k].length > 0)
    .map((k) => ({ title: BUCKET_LABEL[k], data: map[k] }));
}

export default function NotificationsScreen() {
  const c = useAppTheme();
  const navigation = useNavigation();

  const items = useNotificationStore((s) => s.items);
  const isLoading = useNotificationStore((s) => s.isLoading);
  const isRefreshing = useNotificationStore((s) => s.isRefreshing);
  const filter = useNotificationStore((s) => s.filter);
  const refresh = useNotificationStore((s) => s.refresh);
  const loadMore = useNotificationStore((s) => s.loadMore);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const remove = useNotificationStore((s) => s.remove);
  const setFilter = useNotificationStore((s) => s.setFilter);

  const [groups, setGroups] = useState<GroupWithMemberCount[]>([]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [confirmInvitation, setConfirmInvitation] = useState<MyPendingInvitation | null>(null);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  // Initial load + throttle: re-focus trong vòng 30s chỉ refresh badge,
  // không re-fetch toàn bộ list (tránh flash + cost network).
  const lastRefreshRef = useRef(0);
  const REFRESH_THROTTLE_MS = 30_000;
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) {
        refreshUnreadCount();
        return;
      }
      lastRefreshRef.current = now;
      refresh().catch((e) => {
        showError(e);
      });
    }, [refresh, refreshUnreadCount])
  );

  useEffect(() => {
    fetchMyGroups()
      .then(setGroups)
      .catch(() => undefined);
  }, []);

  // Header right: "Đọc tất cả" — phụ thuộc unreadCount thay vì array items
  // để tránh re-set headerRight mỗi lần list thay đổi (không cần thiết).
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        unreadCount > 0 ? (
          <Pressable
            onPress={async () => {
              hapticLight();
              await markAllAsRead();
              showSuccess('Đã đánh dấu tất cả đã đọc');
            }}
            accessibilityRole="button"
            accessibilityLabel="Đánh dấu tất cả đã đọc"
            hitSlop={8}
            style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}
          >
            <CheckCheck size={18} color={c.foreground} />
            <AppText variant="meta" weight="semibold">
              Đọc tất cả
            </AppText>
          </Pressable>
        ) : null,
    });
  }, [navigation, unreadCount, markAllAsRead, c.foreground]);

  const sections = useMemo(() => groupBySection(items), [items]);

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  const selectedGroupIds = filter.groupIds ?? [];
  const groupCount = selectedGroupIds.length;
  const isGroupActive = groupCount > 0;

  const groupChipLabel = useMemo(() => {
    if (groupCount === 0) return 'Theo nhóm';
    if (groupCount === 1) {
      return groupNameById.get(selectedGroupIds[0] ?? '') ?? 'Theo nhóm';
    }
    return `${groupCount} nhóm`;
  }, [groupCount, selectedGroupIds, groupNameById]);

  const toggleGroup = useCallback(
    (id: string) => {
      hapticLight();
      const current = selectedGroupIds;
      const next = current.includes(id)
        ? current.filter((g) => g !== id)
        : [...current, id];
      setFilter({ scope: filter.scope ?? 'all', groupIds: next });
    },
    [selectedGroupIds, setFilter, filter.scope]
  );

  const clearGroupFilter = useCallback(() => {
    hapticLight();
    setFilter({ scope: filter.scope ?? 'all', groupIds: [] });
  }, [setFilter, filter.scope]);

  // Stable callbacks — nhận id thay vì closure-of-item, lookup từ store snapshot.
  // Lý do: renderItem inline với `() => handlePress(item)` sẽ tạo function mới
  // mỗi render → React.memo trên NotificationRow bị bypass → cả list re-render
  // khi 1 row thay đổi (vd mark-as-read).
  const handlePressById = useCallback(
    async (id: string) => {
      const n = useNotificationStore.getState().items.find((x) => x.id === id);
      if (!n) return;
      if (!n.read_at) {
        await markAsRead([id]);
      }
      const data = (n.data ?? {}) as Record<string, unknown>;

      // Invite received: mở dialog confirm thay vì navigate.
      if (n.type === 'member.invite_received') {
        const invitationId = data.invitation_id as string | undefined;
        if (!invitationId) return;
        // Lookup ở store trước (đã được load qua loadGroups/realtime)
        let inv = useGroupStore
          .getState()
          .myPendingInvitations.find((x) => x.invitation_id === invitationId);
        // Fallback fetch nếu user offline lúc invite tới
        if (!inv) {
          try {
            const fresh = await fetchMyPendingInvitations();
            useGroupStore.setState({ myPendingInvitations: fresh });
            inv = fresh.find((x) => x.invitation_id === invitationId);
          } catch {
            // ignore — handle missing dưới
          }
        }
        if (inv) {
          setConfirmInvitation(inv);
        } else {
          showWarning(
            'Lời mời không còn hiệu lực',
            'Có thể đã bị thu hồi hoặc bạn đã trả lời ở thiết bị khác.'
          );
        }
        return;
      }

      const tripId = (data.trip_id as string | undefined) ?? n.trip_id;
      const groupId = (data.group_id as string | undefined) ?? n.group_id;
      if (tripId) router.push(`/trips/${tripId}`);
      else if (groupId) router.push(`/groups/${groupId}`);
    },
    [markAsRead]
  );

  const handleDeleteById = useCallback(
    (id: string) => {
      remove(id);
    },
    [remove]
  );

  const renderNotification = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationRow
        notification={item}
        onPress={handlePressById}
        onDelete={handleDeleteById}
      />
    ),
    [handlePressById, handleDeleteById]
  );

  const keyExtractor = useCallback((item: Notification) => item.id, []);

  const scopeKey: 'all' | 'unread' = filter.scope === 'unread' ? 'unread' : 'all';

  const handleScopePress = (key: 'all' | 'unread') => {
    hapticLight();
    setFilter({ scope: key, groupIds: selectedGroupIds });
  };

  const handleGroupChipPress = () => {
    hapticLight();
    setGroupPickerOpen(true);
  };

  const renderScopeChip = (key: 'all' | 'unread', label: string) => {
    const isSelected = scopeKey === key;
    return (
      <Pressable
        key={key}
        onPress={() => handleScopePress(key)}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={label}
        style={[
          styles.chip,
          {
            backgroundColor: isSelected ? c.accentSoft : 'transparent',
            borderColor: isSelected ? c.primaryStrong : c.divider,
          },
        ]}
      >
        <AppText
          variant="caption"
          weight={isSelected ? 'semibold' : 'medium'}
          style={{ color: isSelected ? c.primaryStrong : c.muted }}
        >
          {label}
        </AppText>
      </Pressable>
    );
  };

  const groupChip = (
    <Pressable
      onPress={handleGroupChipPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isGroupActive }}
      accessibilityLabel={`Lọc theo nhóm${isGroupActive ? `, đang chọn ${groupCount}` : ''}`}
      style={[
        styles.chip,
        {
          backgroundColor: isGroupActive ? c.accentSoft : 'transparent',
          borderColor: isGroupActive ? c.primaryStrong : c.divider,
        },
      ]}
    >
      <AppText
        variant="caption"
        weight={isGroupActive ? 'semibold' : 'medium'}
        style={{ color: isGroupActive ? c.primaryStrong : c.muted }}
      >
        {groupChipLabel}
      </AppText>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <TabHeader routeName="notifications" title="Thông báo" />
      {/* Filter chips */}
      <View style={styles.filterBar}>
        <View style={styles.chipRow}>
          {renderScopeChip('all', 'Tất cả')}
          {renderScopeChip('unread', 'Chưa đọc')}
          {isGroupActive ? (
            <SkiaFireBorder thickness={8} intensity={1.0}>
              {groupChip}
            </SkiaFireBorder>
          ) : (
            groupChip
          )}
        </View>
        {isGroupActive ? (
          <View style={styles.scopeRow}>
            <AppText variant="meta" tone="muted">
              {groupCount === 1
                ? `Đang xem 1 nhóm`
                : `Đang xem ${groupCount} nhóm`}
            </AppText>
            <Pressable
              onPress={clearGroupFilter}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Bỏ lọc nhóm"
            >
              <AppText variant="meta" tone="primary" weight="semibold">
                Bỏ lọc
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* List */}
      {(() => {
        if (isRefreshing && items.length === 0) {
          return <ListSkeleton count={8} />;
        }
        if (items.length === 0) {
          return (
            <View style={styles.emptyWrap}>
              <EmptyState
                title="Chưa có thông báo nào"
                subtitle="Hoạt động trong nhóm sẽ xuất hiện ở đây."
              />
            </View>
          );
        }
        return (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: c.background }]}>
              <AppText variant="label" tone="muted">
                {section.title}
              </AppText>
            </View>
          )}
          renderItem={renderNotification}
          stickySectionHeadersEnabled={false}
          onEndReachedThreshold={0.4}
          onEndReached={() => loadMore().catch(() => undefined)}
          // Virtualization tuning — giảm số item render đầu, batch nhỏ hơn,
          // window hẹp để giảm cost mỗi lần state đổi (mark-as-read, delete).
          initialNumToRender={12}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => refresh().catch(() => undefined)}
              tintColor={c.primaryStrong}
            />
          }
          ListFooterComponent={
            isLoading ? <ListSkeleton count={2} /> : <View style={styles.footerSpace} />
          }
        />
        );
      })()}

      {/* Group picker — HeroUI Native BottomSheet (multi-select) */}
      <BottomSheet isOpen={groupPickerOpen} onOpenChange={setGroupPickerOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content snapPoints={['50%', '85%']}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleCol}>
                <AppText variant="subtitle" weight="semibold">
                  Lọc theo nhóm
                </AppText>
                <AppText variant="meta" tone="muted">
                  Chọn nhiều nhóm để xem cùng lúc
                </AppText>
              </View>
              {groupCount > 0 ? (
                <Pressable
                  onPress={clearGroupFilter}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Bỏ chọn tất cả"
                >
                  <AppText variant="meta" tone="primary" weight="semibold">
                    Bỏ chọn tất cả
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            <BottomSheetFlatList
              data={groups}
              keyExtractor={(g) => g.id}
              contentContainerStyle={styles.sheetList}
              ItemSeparatorComponent={() => (
                <View style={[styles.divider, { backgroundColor: c.divider }]} />
              )}
              renderItem={({ item }) => {
                const isSelected = selectedGroupIds.includes(item.id);
                return (
                  <Pressable
                    onPress={() => toggleGroup(item.id)}
                    style={({ pressed }) => [
                      styles.groupItem,
                      isSelected && { backgroundColor: c.accentSoft },
                      pressed && { opacity: 0.6 },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <View style={styles.groupItemMain}>
                      <AppText variant="body" weight="medium">
                        {item.name}
                      </AppText>
                      <AppText variant="meta" tone="muted">
                        {item.member_count} thành viên
                      </AppText>
                    </View>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isSelected ? c.primaryStrong : c.divider,
                          backgroundColor: isSelected ? c.primaryStrong : 'transparent',
                        },
                      ]}
                    >
                      {isSelected ? (
                        <Check
                          size={14}
                          color={c.inverseForeground}
                          strokeWidth={3}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <AppText variant="caption" tone="muted" style={styles.modalEmpty}>
                  Bạn chưa có nhóm nào.
                </AppText>
              }
            />
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>

      <InvitationConfirmDialog
        invitation={confirmInvitation}
        onClose={() => setConfirmInvitation(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filterBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  footerSpace: { height: 120 },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  // BottomSheet content
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 4,
    marginBottom: 8,
    gap: 12,
  },
  sheetTitleCol: { flex: 1, gap: 2 },
  sheetList: { paddingHorizontal: 12, paddingBottom: 24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmpty: { padding: 16, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  groupItemMain: { flex: 1, gap: 2 },
});
