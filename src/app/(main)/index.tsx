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
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollShadow } from 'heroui-native';

import { CreateJoinSheet } from '../../components/common/CreateJoinSheet';
import { SettingsSheet } from '../../components/common/SettingsSheet';
import {
  AnimatedEntrance,
  AppCard,
  AppText,
  Avatar,
  EmptyState,
  GradientHero,
  ListSkeleton,
  Money,
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

  // ── Hero debt card (BR-10) ──
  // Always rendered when user has at least one group — shows owed / owing /
  // settled variants. Previously hid when total=0, causing layout jumps that
  // felt like the UI was "reacting" to the user settling up.
  const renderHeroDebt = () => {
    if (groups.length === 0) return null;

    const { total } = balanceSummary;
    const isSettled = total === 0;
    const isPositive = total > 0;

    let label: string;
    let tone: 'success' | 'danger' | undefined;
    let gradFrom: string;
    if (isSettled) {
      label = 'Đã thanh toán đầy đủ';
      tone = undefined;
      gradFrom = c.accentSoft;
    } else if (isPositive) {
      label = 'Bạn đang được nợ';
      tone = 'success';
      gradFrom = c.successSoft;
    } else {
      label = 'Bạn đang nợ';
      tone = 'danger';
      gradFrom = c.dangerSoft;
    }
    const gradTo = c.tint ?? c.surface;
    const footnote = isSettled ? 'Không còn khoản nào cần thanh toán' : 'trên tất cả các nhóm';

    return (
      <AnimatedEntrance delay={0}>
        <GradientHero fromColor={gradFrom} toColor={gradTo} style={styles.heroWrap}>
          <View style={styles.heroInner}>
            <AppText variant="label" tone="muted">
              {label}
            </AppText>
            <View style={styles.heroAmount}>
              <Money value={Math.abs(total)} variant="hero" tone={tone} animate />
            </View>
            <AppText variant="meta" tone="muted">
              {footnote}
            </AppText>
          </View>
        </GradientHero>
      </AnimatedEntrance>
    );
  };

  // ── Per-group balance pill ──
  const renderGroupBalance = (groupId: string) => {
    const balance = balanceSummary.groupBalances[groupId];
    if (balance === undefined || balance === 0) return null;
    const isPositive = balance > 0;
    return (
      <Money
        value={Math.abs(balance)}
        variant="compact"
        tone={isPositive ? 'success' : 'danger'}
        showSign
      />
    );
  };

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
          trailing={renderGroupBalance(item.id)}
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
      {renderHeroDebt()}

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
        <ScrollShadow LinearGradientComponent={LinearGradient}>
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
        </ScrollShadow>
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

  // Hero debt card
  heroWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  heroInner: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
  },
  heroAmount: {
    marginVertical: 2,
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
