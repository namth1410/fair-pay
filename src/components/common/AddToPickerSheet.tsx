import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { BottomSheet } from 'heroui-native';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Users,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { fetchAllUserTrips, type Trip } from '../../services/trip.service';
import { useGroupStore } from '../../stores/group.store';
import { useUIStore } from '../../stores/ui.store';
import { getErrorMessage } from '../../utils/error';
import {
  filterTripsBySearch,
  groupTripsByGroup,
} from '../../utils/recentTrips';
import { AppText, Avatar, EmptyState } from '../ui';

interface AddToPickerSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTripId?: string;
  onPick: (
    groupId: string,
    groupName: string,
    tripId: string,
    tripName: string,
  ) => void;
}

const AUTO_EXPAND_THRESHOLD = 3;

export function AddToPickerSheet({
  isOpen,
  onOpenChange,
  selectedTripId,
  onPick,
}: AddToPickerSheetProps) {
  const c = useAppTheme();
  const groups = useGroupStore((s) => s.groups);
  const setCreateJoinOpen = useUIStore((s) => s.setCreateJoinOpen);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [resetKey, setResetKey] = useState(0);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setResetKey((k) => k + 1);
    setError('');

    let cancelled = false;
    setLoading(true);
    fetchAllUserTrips()
      .then((data) => {
        if (cancelled) return;
        setTrips(data);
        const initialExpanded: Record<string, boolean> = {};
        const tripsByGroupMap = new Map<string, number>();
        for (const t of data) {
          tripsByGroupMap.set(t.group_id, (tripsByGroupMap.get(t.group_id) ?? 0) + 1);
        }
        for (const g of groups) {
          const count = tripsByGroupMap.get(g.id) ?? 0;
          initialExpanded[g.id] = count > 0 && count <= AUTO_EXPAND_THRESHOLD;
        }
        if (selectedTripId) {
          const sel = data.find((t) => t.id === selectedTripId);
          if (sel) initialExpanded[sel.group_id] = true;
        }
        setExpanded(initialExpanded);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, groups, selectedTripId]);

  const handleChangeSearch = (text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(text);
    }, 200);
  };

  const isSearching = searchQuery.trim().length > 0;

  const filteredTrips = useMemo(
    () => filterTripsBySearch(trips, groups, searchQuery),
    [trips, groups, searchQuery],
  );

  const groupedTrips = useMemo(
    () => groupTripsByGroup(filteredTrips, groups),
    [filteredTrips, groups],
  );

  const groupNameMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  const handlePickTrip = (trip: Trip, groupName: string) => {
    onOpenChange(false);
    onPick(trip.group_id, groupName, trip.id, trip.name);
  };

  const handleCreateGroup = () => {
    onOpenChange(false);
    setCreateJoinOpen(true);
  };

  const handleCreateTrip = (groupId: string) => {
    onOpenChange(false);
    router.push(`/groups/${groupId}` as never);
  };

  const toggleGroup = (groupId: string) => {
    setExpanded((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['75%', '95%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>Chọn nhóm và chuyến</BottomSheet.Title>
            </View>

            <View
              style={[
                styles.searchWrap,
                { backgroundColor: c.surfaceAlt, borderColor: c.divider },
              ]}
            >
              <Search size={18} color={c.muted} />
              <BottomSheetTextInput
                key={resetKey}
                defaultValue=""
                onChangeText={handleChangeSearch}
                placeholder="Tìm nhóm hoặc chuyến..."
                placeholderTextColor={c.muted}
                style={[styles.searchInput, { color: c.foreground }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {loading ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={c.foreground} />
                <AppText variant="body" tone="muted">
                  Đang tải...
                </AppText>
              </View>
            ) : error ? (
              <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                <AppText variant="caption" tone="danger">
                  {error}
                </AppText>
              </View>
            ) : groups.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Chưa có nhóm nào"
                subtitle="Tạo nhóm mới để bắt đầu chia tiền"
                action={{ label: 'Tạo nhóm', onPress: handleCreateGroup }}
              />
            ) : (
              <BottomSheetScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {isSearching ? (
                  <FlatTripCard
                    trips={filteredTrips}
                    selectedTripId={selectedTripId}
                    onPick={handlePickTrip}
                    groupNameMap={groupNameMap}
                    c={c}
                  />
                ) : (
                  <View style={styles.groupsList}>
                      {groupedTrips.map(({ group, trips: gtrips }) => {
                        const isExpanded = !!expanded[group.id];
                        return (
                          <View
                            key={group.id}
                            style={[
                              styles.card,
                              { backgroundColor: c.surfaceAlt, borderColor: c.divider },
                            ]}
                          >
                            <Pressable
                              onPress={() => toggleGroup(group.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`${isExpanded ? 'Thu gọn' : 'Mở rộng'} nhóm ${group.name}`}
                              android_ripple={{ color: c.divider }}
                              style={({ pressed }) => [
                                styles.groupHeader,
                                { opacity: pressed ? 0.7 : 1 },
                              ]}
                            >
                              <Avatar
                                seed={group.id}
                                label={group.name}
                                photoUrl={group.avatar_url}
                                size={36}
                              />
                              <View style={styles.groupHeaderText}>
                                <AppText
                                  variant="body"
                                  weight="semibold"
                                  numberOfLines={1}
                                >
                                  {group.name}
                                </AppText>
                              </View>
                              <View
                                style={[
                                  styles.countBadge,
                                  { backgroundColor: c.background },
                                ]}
                              >
                                <AppText variant="meta" tone="muted" weight="medium">
                                  {gtrips.length}
                                </AppText>
                              </View>
                              {isExpanded ? (
                                <ChevronDown size={18} color={c.muted} />
                              ) : (
                                <ChevronRight size={18} color={c.muted} />
                              )}
                            </Pressable>

                            {isExpanded ? (
                              <View
                                style={[styles.divider, { backgroundColor: c.divider }]}
                              />
                            ) : null}

                            {isExpanded ? (
                              <View>
                                {gtrips.map((t, idx) => (
                                  <CompactTripRow
                                    key={t.id}
                                    tripName={t.name}
                                    status={t.status}
                                    selected={t.id === selectedTripId}
                                    onPress={() => handlePickTrip(t, group.name)}
                                    showDivider={idx < gtrips.length - 1}
                                    c={c}
                                  />
                                ))}
                                {gtrips.length > 0 ? (
                                  <View
                                    style={[styles.divider, { backgroundColor: c.divider }]}
                                  />
                                ) : null}
                                <Pressable
                                  onPress={() => handleCreateTrip(group.id)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Tạo chuyến mới trong ${group.name}`}
                                  android_ripple={{ color: c.divider }}
                                  style={({ pressed }) => [
                                    styles.createTripRow,
                                    { opacity: pressed ? 0.7 : 1 },
                                  ]}
                                >
                                  <Plus size={14} color={c.muted} />
                                  <AppText variant="caption" tone="muted">
                                    Tạo chuyến mới
                                  </AppText>
                                </Pressable>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                  </View>
                )}
              </BottomSheetScrollView>
            )}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

interface FlatTripCardProps {
  trips: Trip[];
  selectedTripId?: string;
  groupNameMap: Map<string, string>;
  onPick: (trip: Trip, groupName: string) => void;
  c: ReturnType<typeof useAppTheme>;
}

function FlatTripCard({ trips, selectedTripId, groupNameMap, onPick, c }: FlatTripCardProps) {
  if (trips.length === 0) {
    return (
      <View style={styles.emptySearchBox}>
        <AppText variant="body" tone="muted" center>
          Không tìm thấy chuyến nào phù hợp
        </AppText>
      </View>
    );
  }

  return (
    <View
      style={[styles.card, { backgroundColor: c.surfaceAlt, borderColor: c.divider }]}
    >
      {trips.map((t, idx) => {
        const groupName = groupNameMap.get(t.group_id) ?? '';
        return (
          <RecentTripRow
            key={t.id}
            tripName={t.name}
            groupName={groupName}
            groupAvatarSeed={t.group_id}
            groupAvatarUrl={null}
            status={t.status}
            selected={t.id === selectedTripId}
            onPress={() => onPick(t, groupName)}
            showDivider={idx < trips.length - 1}
            c={c}
          />
        );
      })}
    </View>
  );
}

interface RecentTripRowProps {
  tripName: string;
  groupName: string;
  groupAvatarSeed: string;
  groupAvatarUrl: string | null;
  status: 'open' | 'closed';
  selected: boolean;
  onPress: () => void;
  showDivider: boolean;
  c: ReturnType<typeof useAppTheme>;
}

function RecentTripRow({
  tripName,
  groupName,
  groupAvatarSeed,
  groupAvatarUrl,
  status,
  selected,
  onPress,
  showDivider,
  c,
}: RecentTripRowProps) {
  return (
    <>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Chọn chuyến ${tripName} trong ${groupName}`}
        android_ripple={{ color: c.divider }}
        style={({ pressed }) => [
          styles.recentRow,
          { opacity: pressed ? 0.7 : 1 },
          selected && { backgroundColor: c.primarySoft },
        ]}
      >
        <Avatar
          seed={groupAvatarSeed}
          label={groupName}
          photoUrl={groupAvatarUrl}
          size={36}
        />
        <View style={styles.recentText}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>
            {tripName}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {groupName} · {status === 'open' ? 'Đang mở' : 'Đã đóng'}
          </AppText>
        </View>
        {selected ? <Check size={18} color={c.primary} /> : null}
      </Pressable>
      {showDivider ? (
        <View style={[styles.divider, { backgroundColor: c.divider, marginLeft: 60 }]} />
      ) : null}
    </>
  );
}

interface CompactTripRowProps {
  tripName: string;
  status: 'open' | 'closed';
  selected: boolean;
  onPress: () => void;
  showDivider: boolean;
  c: ReturnType<typeof useAppTheme>;
}

function CompactTripRow({
  tripName,
  status,
  selected,
  onPress,
  showDivider,
  c,
}: CompactTripRowProps) {
  return (
    <>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Chọn chuyến ${tripName}`}
        android_ripple={{ color: c.divider }}
        style={({ pressed }) => [
          styles.compactRow,
          { opacity: pressed ? 0.7 : 1 },
          selected && { backgroundColor: c.primarySoft },
        ]}
      >
        <View
          style={[
            styles.bullet,
            { backgroundColor: status === 'open' ? c.success : c.muted },
          ]}
        />
        <AppText
          variant="body"
          numberOfLines={1}
          style={[styles.compactName, status === 'closed' && { opacity: 0.65 }]}
        >
          {tripName}
        </AppText>
        <AppText variant="meta" tone="muted">
          {status === 'open' ? 'Đang mở' : 'Đã đóng'}
        </AppText>
        {selected ? (
          <Check size={16} color={c.primary} style={styles.compactCheck} />
        ) : null}
      </Pressable>
      {showDivider ? (
        <View style={[styles.divider, { backgroundColor: c.divider, marginLeft: 36 }]} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    flex: 1,
  },
  header: {
    paddingVertical: 8,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  busyRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  groupsList: {
    gap: 10,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  groupHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  countBadge: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  recentText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 12,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
  compactName: {
    flex: 1,
    minWidth: 0,
  },
  compactCheck: {
    marginLeft: 4,
  },
  createTripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 12,
  },
  emptySearchBox: {
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
});
