import { Button } from 'heroui-native';
import Lock from 'lucide-react-native/dist/esm/icons/lock';
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin';
import Pin from 'lucide-react-native/dist/esm/icons/pin';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { Trip } from '../../services/trip.service';
import { useTripStore } from '../../stores/trip.store';
import { hapticLight } from '../../utils/haptics';
import { pickPastel } from '../../utils/seedGradient';
import { CreateTripSheet } from '../trip/CreateTripSheet';
import {
  AppText,
  EmptyState,
  RowsSkeleton,
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

// Danh sách chuyến của nhóm như các "luồng" chat (giao diện "Hội thoại" 2026-10).
export const TripsTab = React.memo(function TripsTab({
  trips, isLoading, isAdmin, groupId, onTripPress, onToggleStatus, onTripLongPress, onCreateSuccess,
}: TripsTabProps) {
  const c = useAppTheme();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const pinnedTripIds = useTripStore((s) => s.pinnedTripIds);

  const renderTrip = ({ item, index }: { item: Trip; index: number }) => {
    const isPinned = pinnedTripIds.has(item.id);
    const isClosed = item.status !== 'open';
    const pastel = pickPastel(item.id, c.isDark);
    const isLast = index === trips.length - 1;
    return (
      <Pressable
        onPress={() => {
          hapticLight();
          onTripPress(item.id);
        }}
        onLongPress={onTripLongPress ? () => onTripLongPress(item) : undefined}
        accessibilityRole="button"
        accessibilityLabel={`Chuyến ${item.name}, ${isClosed ? 'đã đóng' : 'đang mở'}${isPinned ? ', đã ghim' : ''}`}
        android_ripple={{ color: c.surfaceAlt }}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceAlt }]}
      >
        <View style={[styles.icon, { backgroundColor: pastel.bg }]}>
          <MapPin size={22} color={pastel.fg} strokeWidth={2} />
          {!isClosed ? (
            <View style={[styles.liveDot, { backgroundColor: c.success, borderColor: c.surface }]} />
          ) : null}
        </View>
        <View
          style={[
            styles.content,
            !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
          ]}
        >
          <View style={styles.titleRow}>
            <AppText variant="subtitle" weight="bold" numberOfLines={1} style={styles.flex}>
              {item.name}
            </AppText>
            {isPinned ? <Pin size={14} color={c.muted} strokeWidth={2.2} /> : null}
          </View>
          <View style={styles.metaRow}>
            {isClosed ? <Lock size={12} color={c.muted} strokeWidth={2.4} /> : null}
            <AppText variant="caption" tone="muted" style={styles.flex} numberOfLines={1}>
              {isClosed ? 'Đã đóng' : 'Đang mở'}
            </AppText>
            {isAdmin ? (
              <Pressable
                onPress={() => onToggleStatus(item)}
                accessibilityRole="button"
                accessibilityLabel={isClosed ? `Mở lại chuyến ${item.name}` : `Đóng chuyến ${item.name}`}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <AppText variant="caption" weight="semibold" tone={isClosed ? 'success' : 'danger'}>
                  {isClosed ? 'Mở lại' : 'Đóng'}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      {isLoading && trips.length === 0 ? (
        <RowsSkeleton count={3} leading="tile" leadingSize={52} minHeight={74} />
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={renderTrip}
          contentContainerStyle={trips.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={<EmptyState icon={MapPin} title="Chưa có chuyến đi nào" />}
        />
      )}

      {/* Mọi member đều tạo được chuyến đi (quản lý trip vẫn chỉ admin). */}
      <View style={[styles.footer, { borderTopColor: c.divider, backgroundColor: c.surface }]}>
        <Button variant="primary" onPress={() => setIsSheetOpen(true)}>
          <Button.Label>Tạo chuyến đi mới</Button.Label>
        </Button>
      </View>

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
  list: { paddingBottom: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    minHeight: 74,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    paddingRight: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  flex: { flex: 1, minWidth: 0 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
