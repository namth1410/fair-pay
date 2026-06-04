import { Button } from 'heroui-native';
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { Trip } from '../../services/trip.service';
import { useTripStore } from '../../stores/trip.store';
import { CreateTripSheet } from '../trip/CreateTripSheet';
import {
  AppCard,
  AppText,
  EmptyState,
  ListSkeleton,
} from '../ui';

interface TripsTabProps {
  trips: Trip[];
  isLoading: boolean;
  isAdmin: boolean;
  groupId: string;
  onTripPress: (tripId: string) => void;
  onToggleStatus: (trip: Trip) => void;
  onTripLongPress?: (trip: Trip) => void;
  onCreateSuccess?: (name: string) => void;
}

export const TripsTab = React.memo(function TripsTab({
  trips, isLoading, isAdmin, groupId, onTripPress, onToggleStatus, onTripLongPress, onCreateSuccess,
}: TripsTabProps) {
  const c = useAppTheme();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const pinnedTripIds = useTripStore((s) => s.pinnedTripIds);

  const renderTrip = ({ item }: { item: Trip }) => {
    const isPinned = pinnedTripIds.has(item.id);
    const statusLabel = item.status === 'open' ? 'Đang mở' : 'Đã đóng';
    return (
    <AppCard
      title={item.name}
      subtitle={isPinned ? `📌 ${statusLabel}` : statusLabel}
      onPress={() => onTripPress(item.id)}
      onLongPress={onTripLongPress ? () => onTripLongPress(item) : undefined}
      leading={
        <View style={[styles.iconWrap, { backgroundColor: c.primarySoft }]}>
          <MapPin size={20} color={c.foreground} strokeWidth={1.75} />
        </View>
      }
      trailing={
        isAdmin ? (
          <Pressable
            onPress={() => onToggleStatus(item)}
            accessibilityRole="button"
            accessibilityLabel={item.status === 'open' ? 'Đóng' : 'Mở lại'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <AppText variant="caption" weight="semibold" tone={item.status === 'open' ? 'danger' : 'success'}>
              {item.status === 'open' ? 'Đóng' : 'Mở lại'}
            </AppText>
          </Pressable>
        ) : undefined
      }
    />
    );
  };

  return (
    <>
      {/* Mọi member đều tạo được chuyến đi (quản lý trip vẫn chỉ admin). */}
      <View style={styles.sectionActions}>
        <Button variant="primary" size="sm" onPress={() => setIsSheetOpen(true)}>
          <Button.Label>Tạo chuyến</Button.Label>
        </Button>
      </View>

      {isLoading && trips.length === 0 ? (
        <ListSkeleton count={3} />
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={renderTrip}
          contentContainerStyle={trips.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={<EmptyState icon={MapPin} title="Chưa có chuyến đi nào" />}
        />
      )}

      <CreateTripSheet
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        groupId={groupId}
        onSuccess={onCreateSuccess}
      />
    </>
  );
});

const styles = StyleSheet.create({
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
