import { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { BottomSheet } from 'heroui-native';
import { ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { fetchTrips, type Trip } from '../../services/trip.service';
import { useGroupStore } from '../../stores/group.store';
import { useUIStore } from '../../stores/ui.store';
import { getErrorMessage } from '../../utils/error';
import { type ProcessedAvatar } from '../../utils/imageProcessing';
import { AppText, Avatar, EmptyState } from '../ui';

interface GroupTripPickerSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  image: ProcessedAvatar | null;
}

type PickerStep =
  | { kind: 'group' }
  | { kind: 'trips'; groupId: string; groupName: string };

export function GroupTripPickerSheet({
  isOpen,
  onOpenChange,
  image,
}: GroupTripPickerSheetProps) {
  const c = useAppTheme();
  const groups = useGroupStore((s) => s.groups);
  const setCreateJoinOpen = useUIStore((s) => s.setCreateJoinOpen);

  const [step, setStep] = useState<PickerStep>({ kind: 'group' });
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setStep({ kind: 'group' });
      setTrips([]);
      setTripsError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (step.kind !== 'trips') return;
    let cancelled = false;
    setTripsLoading(true);
    setTripsError('');
    fetchTrips(step.groupId)
      .then((data) => {
        if (cancelled) return;
        setTrips(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setTripsError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setTripsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  const handlePickGroup = (groupId: string, groupName: string) => {
    setStep({ kind: 'trips', groupId, groupName });
  };

  const handleBack = () => {
    setStep({ kind: 'group' });
  };

  const handleCreateGroup = () => {
    onOpenChange(false);
    setCreateJoinOpen(true);
  };

  const handlePickTrip = (trip: Trip) => {
    const expenseId = Crypto.randomUUID();
    onOpenChange(false);
    const params = new URLSearchParams();
    params.set('expenseId', expenseId);
    if (image) {
      params.set('imageUri', image.uri);
      params.set('imageSizeBytes', String(image.sizeBytes));
    }
    router.push(
      `/trips/${trip.id}/expenses/new?${params.toString()}` as never,
    );
  };

  const handleCreateTrip = () => {
    if (step.kind !== 'trips') return;
    onOpenChange(false);
    router.push(`/groups/${step.groupId}` as never);
  };

  const activeTrips = trips.filter((t) => t.status === 'open');
  const closedTrips = trips.filter((t) => t.status === 'closed');

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content enableDynamicSizing={false} snapPoints={['70%']}>
          <BottomSheetView style={styles.container}>
            <View style={styles.header}>
              {step.kind === 'trips' ? (
                <Pressable
                  onPress={handleBack}
                  accessibilityRole="button"
                  accessibilityLabel="Quay lại danh sách nhóm"
                  hitSlop={8}
                  style={styles.backBtn}
                >
                  <ChevronLeft size={22} color={c.foreground} />
                </Pressable>
              ) : null}
              <BottomSheet.Title>
                {step.kind === 'group'
                  ? 'Chọn nhóm'
                  : `${step.groupName} — chọn chuyến`}
              </BottomSheet.Title>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {step.kind === 'group' ? (
                groups.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="Chưa có nhóm nào"
                    subtitle="Tạo nhóm mới để bắt đầu chia tiền"
                    action={{ label: 'Tạo nhóm', onPress: handleCreateGroup }}
                  />
                ) : (
                  <View style={styles.list}>
                    {groups.map((g) => (
                      <Pressable
                        key={g.id}
                        onPress={() => handlePickGroup(g.id, g.name)}
                        accessibilityRole="button"
                        accessibilityLabel={`Chọn nhóm ${g.name}`}
                        android_ripple={{ color: c.divider }}
                        style={({ pressed }) => [
                          styles.row,
                          {
                            backgroundColor: c.surfaceAlt,
                            borderColor: c.divider,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Avatar
                          seed={g.id}
                          label={g.name}
                          photoUrl={g.avatar_url}
                          size={40}
                        />
                        <View style={styles.rowText}>
                          <AppText
                            variant="body"
                            weight="semibold"
                            numberOfLines={1}
                          >
                            {g.name}
                          </AppText>
                          <AppText variant="caption" tone="muted">
                            {g.member_count} thành viên
                          </AppText>
                        </View>
                        <ChevronRight size={18} color={c.muted} />
                      </Pressable>
                    ))}
                  </View>
                )
              ) : tripsLoading ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator color={c.foreground} />
                  <AppText variant="body" tone="muted">
                    Đang tải chuyến...
                  </AppText>
                </View>
              ) : tripsError ? (
                <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                  <AppText variant="caption" tone="danger">
                    {tripsError}
                  </AppText>
                </View>
              ) : trips.length === 0 ? (
                <EmptyState
                  icon={Plus}
                  title="Nhóm chưa có chuyến"
                  subtitle="Tạo chuyến mới trong trang nhóm để thêm khoản chi"
                  action={{ label: 'Mở nhóm', onPress: handleCreateTrip }}
                />
              ) : (
                <View style={styles.list}>
                  {activeTrips.map((t) => (
                    <TripRow
                      key={t.id}
                      trip={t}
                      onPress={() => handlePickTrip(t)}
                      c={c}
                    />
                  ))}
                  {closedTrips.length > 0 ? (
                    <>
                      <AppText
                        variant="caption"
                        tone="muted"
                        style={styles.sectionLabel}
                      >
                        ĐÃ ĐÓNG
                      </AppText>
                      {closedTrips.map((t) => (
                        <TripRow
                          key={t.id}
                          trip={t}
                          onPress={() => handlePickTrip(t)}
                          c={c}
                          dim
                        />
                      ))}
                    </>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </BottomSheetView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

interface TripRowProps {
  trip: Trip;
  onPress: () => void;
  c: ReturnType<typeof useAppTheme>;
  dim?: boolean;
}

function TripRow({ trip, onPress, c, dim }: TripRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Chọn chuyến ${trip.name}`}
      android_ripple={{ color: c.divider }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: c.surfaceAlt,
          borderColor: c.divider,
          opacity: pressed ? 0.7 : dim ? 0.65 : 1,
        },
      ]}
    >
      <View style={styles.rowText}>
        <AppText variant="body" weight="semibold" numberOfLines={1}>
          {trip.name}
        </AppText>
        <AppText variant="caption" tone="muted">
          {trip.status === 'open' ? 'Đang mở' : 'Đã đóng'}
        </AppText>
      </View>
      <ChevronRight size={18} color={c.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  busyRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 2,
    letterSpacing: 1,
  },
});
