import { LinearGradient } from 'expo-linear-gradient';
import { Button, ScrollShadow } from 'heroui-native';
import { MapPin } from 'lucide-react-native';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { Trip } from '../../services/trip.service';
import {
  AppCard,
  AppText,
  AppTextField,
  CategoryIcon,
  ChipPicker,
  EmptyState,
  FormReveal,
  ListSkeleton,
} from '../ui';

const TRIP_TYPE_LABELS: Record<string, string> = {
  travel: 'Du lịch',
  meal: 'Ăn uống',
  event: 'Sự kiện',
  other: 'Khác',
};

const TRIP_TYPE_OPTIONS = [
  { key: 'travel' as const, label: 'Du lịch' },
  { key: 'meal' as const, label: 'Ăn uống' },
  { key: 'event' as const, label: 'Sự kiện' },
  { key: 'other' as const, label: 'Khác' },
];

interface TripsTabProps {
  trips: Trip[];
  isLoading: boolean;
  isAdmin: boolean;
  onTripPress: (tripId: string) => void;
  onToggleStatus: (trip: Trip) => void;
  onCreateTrip: (name: string, type: Trip['type']) => Promise<void>;
}

export const TripsTab = React.memo(function TripsTab({
  trips, isLoading, isAdmin, onTripPress, onToggleStatus, onCreateTrip,
}: TripsTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Trip['type']>('other');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onCreateTrip(newName.trim(), newType);
    setNewName('');
    setShowForm(false);
  };

  const renderTrip = ({ item }: { item: Trip }) => (
    <AppCard
      title={item.name}
      subtitle={`${TRIP_TYPE_LABELS[item.type]} · ${item.status === 'open' ? 'Đang mở' : 'Đã đóng'}`}
      onPress={() => onTripPress(item.id)}
      leading={<CategoryIcon kind="trip" value={item.type} size={40} />}
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

  return (
    <>
      {isAdmin && (
        <View style={styles.sectionActions}>
          <Button variant="primary" size="sm" onPress={() => setShowForm(!showForm)}>
            <Button.Label>{showForm ? 'Hủy' : 'Tạo chuyến'}</Button.Label>
          </Button>
        </View>
      )}

      <FormReveal isOpen={showForm}>
        <AppTextField
          placeholder="Tên chuyến (VD: Đà Lạt T4/2026)"
          value={newName}
          onChangeText={setNewName}
          autoFocus
        />
        <ChipPicker
          options={TRIP_TYPE_OPTIONS}
          selected={newType}
          onSelect={setNewType}
        />
        <Button variant="primary" size="sm" onPress={handleCreate}>
          <Button.Label>Tạo</Button.Label>
        </Button>
      </FormReveal>

      {isLoading && trips.length === 0 ? (
        <ListSkeleton count={3} />
      ) : (
        <ScrollShadow LinearGradientComponent={LinearGradient}>
          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            renderItem={renderTrip}
            contentContainerStyle={trips.length === 0 ? styles.emptyContainer : styles.list}
            ListEmptyComponent={<EmptyState icon={MapPin} title="Chưa có chuyến đi nào" />}
          />
        </ScrollShadow>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
