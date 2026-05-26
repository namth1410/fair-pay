import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheet } from 'heroui-native';
import { Check, MapPin, Pin } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MAX_PINNED_TRIPS } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTripStore } from '../../stores/trip.store';
import type { TripWithGroup } from '../../types/database.types';
import { hapticLight } from '../../utils/haptics';
import { showError, showWarning } from '../../utils/toast';
import { AppText } from '../ui';

interface PinPickerSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const SNAP_POINTS = ['70%', '90%'];

export function PinPickerSheet({ isOpen, onOpenChange }: PinPickerSheetProps) {
  const c = useAppTheme();

  const allUserTrips = useTripStore((s) => s.allUserTrips);
  const isLoadingAllTrips = useTripStore((s) => s.isLoadingAllUserTrips);
  const loadAllUserTrips = useTripStore((s) => s.loadAllUserTrips);
  const pinnedTripIds = useTripStore((s) => s.pinnedTripIds);
  const pinnedCount = useTripStore((s) => s.pinnedTrips.length);
  const togglePin = useTripStore((s) => s.togglePin);

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadAllUserTrips();
    }
  }, [isOpen, loadAllUserTrips]);

  // Group by group_name
  const sections = useMemo(() => {
    if (!allUserTrips) return [];
    const groups = new Map<string, TripWithGroup[]>();
    for (const trip of allUserTrips) {
      const existing = groups.get(trip.group_name) ?? [];
      existing.push(trip);
      groups.set(trip.group_name, existing);
    }
    return Array.from(groups.entries())
      .map(([groupName, trips]) => ({ groupName, trips }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName, 'vi'));
  }, [allUserTrips]);

  const handleRowPress = async (trip: TripWithGroup) => {
    const isPinned = pinnedTripIds.has(trip.id);
    if (!isPinned && pinnedCount >= MAX_PINNED_TRIPS) {
      showWarning(
        'Đã ghim tối đa 2 chuyến đi',
        'Bỏ ghim 1 chuyến trước khi thêm chuyến mới.'
      );
      return;
    }
    if (pendingIds.has(trip.id)) return;
    setPendingIds((prev) => new Set(prev).add(trip.id));
    try {
      await togglePin(trip.id);
      hapticLight();
    } catch (err) {
      showError(err, 'Không thể thực hiện');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={SNAP_POINTS}
          enableDynamicSizing={false}
          enableOverDrag={false}
          contentContainerClassName="h-full"
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>Ghim chuyến đi</BottomSheet.Title>
              <AppText variant="caption" tone="muted">
                Đã ghim {pinnedCount}/{MAX_PINNED_TRIPS} chuyến
              </AppText>
            </View>

            {isLoadingAllTrips && !allUserTrips ? (
              <View style={styles.loading}>
                <ActivityIndicator color={c.foreground} />
              </View>
            ) : sections.length === 0 ? (
              <View style={styles.empty}>
                <Pin size={40} color={c.muted} strokeWidth={1.5} />
                <AppText variant="caption" tone="muted">
                  Bạn chưa có chuyến đi nào
                </AppText>
              </View>
            ) : (
              <BottomSheetScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
              {sections.map((section) => (
                <View key={section.groupName} style={styles.section}>
                  <AppText
                    variant="meta"
                    tone="muted"
                    weight="semibold"
                    style={styles.sectionLabel}
                  >
                    {section.groupName.toUpperCase()}
                  </AppText>
                  {section.trips.map((trip) => {
                    const isPinned = pinnedTripIds.has(trip.id);
                    const isPending = pendingIds.has(trip.id);
                    const disabled = !isPinned && pinnedCount >= MAX_PINNED_TRIPS;
                    const isClosed = trip.status === 'closed';
                    return (
                      <Pressable
                        key={trip.id}
                        onPress={() => handleRowPress(trip)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isPinned, disabled }}
                        accessibilityLabel={`${trip.name}, ${isPinned ? 'đã ghim' : 'chưa ghim'}`}
                        style={({ pressed }) => [
                          styles.row,
                          {
                            backgroundColor: c.surface,
                            borderColor: c.divider,
                            opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        <View style={[styles.tripIcon, { backgroundColor: c.surfaceAlt }]}>
                          <MapPin size={16} color={c.muted} strokeWidth={2} />
                        </View>
                        <View style={styles.tripText}>
                          <AppText variant="body" weight="semibold" numberOfLines={1}>
                            {trip.name}
                          </AppText>
                          {isClosed ? (
                            <AppText variant="meta" tone="muted">
                              Đã đóng
                            </AppText>
                          ) : null}
                        </View>
                        {isPending ? (
                          <ActivityIndicator size="small" color={c.foreground} />
                        ) : (
                          <View
                            style={[
                              styles.checkbox,
                              {
                                borderColor: isPinned
                                  ? c.primaryStrong
                                  : disabled
                                    ? c.divider
                                    : c.muted,
                                backgroundColor: isPinned ? c.primaryStrong : 'transparent',
                              },
                            ]}
                          >
                            {isPinned ? (
                              <Check size={14} color={c.background} strokeWidth={3} />
                            ) : null}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </BottomSheetScrollView>
          )}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 4,
  },
  section: {
    marginBottom: 12,
    gap: 6,
  },
  sectionLabel: {
    letterSpacing: 1,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tripIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
});
