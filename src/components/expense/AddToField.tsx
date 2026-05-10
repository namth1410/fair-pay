import { Plus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { fetchAllUserTrips, type Trip } from '../../services/trip.service';
import { useGroupStore } from '../../stores/group.store';
import { useUIStore } from '../../stores/ui.store';
import { getRecentTrips } from '../../utils/recentTrips';
import { AddToPickerSheet } from '../common/AddToPickerSheet';
import { AppText, Avatar } from '../ui';

interface AddToFieldProps {
  currentTripId?: string;
  currentGroupId?: string;
  currentTripName?: string;
  currentGroupName?: string;
  onPick: (
    groupId: string,
    groupName: string,
    tripId: string,
    tripName: string,
  ) => void;
  onClear: () => void;
}

export function AddToField({
  currentTripId,
  currentGroupName,
  currentTripName,
  onPick,
  onClear,
}: AddToFieldProps) {
  const c = useAppTheme();
  const groups = useGroupStore((s) => s.groups);
  const setCreateJoinOpen = useUIStore((s) => s.setCreateJoinOpen);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (groups.length === 0) return;
    let cancelled = false;
    fetchAllUserTrips()
      .then((data) => {
        if (!cancelled) setTrips(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [groups.length]);

  // State B — đã chọn
  if (currentTripId && currentTripName && currentGroupName) {
    return (
      <View style={styles.wrap}>
        <AppText variant="meta" tone="muted" style={styles.label}>
          Thêm vào
        </AppText>
        <View
          style={[
            styles.selectedChip,
            { backgroundColor: c.primarySoft, borderColor: c.primary },
          ]}
        >
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Đổi nhóm/chuyến — đang chọn ${currentTripName}`}
            android_ripple={{ color: c.divider }}
            style={styles.selectedTapArea}
          >
            <Avatar
              seed={currentTripId}
              label={currentTripName}
              size={36}
            />
            <View style={styles.selectedText}>
              <AppText variant="body" weight="semibold" numberOfLines={1}>
                {currentTripName}
              </AppText>
              <AppText variant="caption" tone="muted" numberOfLines={1}>
                {currentGroupName}
              </AppText>
            </View>
          </Pressable>
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Bỏ chọn nhóm/chuyến"
            hitSlop={10}
            style={styles.clearBtn}
          >
            <X size={18} color={c.muted} />
          </Pressable>
        </View>
        <AddToPickerSheet
          isOpen={pickerOpen}
          onOpenChange={setPickerOpen}
          selectedTripId={currentTripId}
          onPick={onPick}
        />
      </View>
    );
  }

  // State D — chưa có group nào
  if (groups.length === 0) {
    return (
      <View style={styles.wrap}>
        <AppText variant="meta" tone="muted" style={styles.label}>
          Thêm vào
        </AppText>
        <View
          style={[
            styles.emptyBox,
            { borderColor: c.divider },
          ]}
        >
          <AppText variant="body" tone="muted" center>
            Bạn chưa có nhóm nào
          </AppText>
          <Pressable
            onPress={() => setCreateJoinOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Tạo nhóm mới"
            android_ripple={{ color: c.divider }}
            style={({ pressed }) => [
              styles.createGroupBtn,
              { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <AppText variant="body" weight="semibold" tone="inverse">
              Tạo nhóm mới
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  // State A & C — chips (nếu có) + row "Tạo chuyến mới hoặc chọn từ nhóm"
  const recent = getRecentTrips(trips, groups, 3);

  return (
    <View style={styles.wrap}>
      <AppText variant="meta" tone="muted" style={styles.label}>
        Thêm vào  <AppText variant="meta" tone="danger">(bắt buộc)</AppText>
      </AppText>

      {recent.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {recent.map((rt) => (
            <Pressable
              key={rt.trip.id}
              onPress={() => onPick(rt.trip.group_id, rt.groupName, rt.trip.id, rt.trip.name)}
              accessibilityRole="button"
              accessibilityLabel={`Chọn ${rt.trip.name} trong ${rt.groupName}`}
              android_ripple={{ color: c.divider }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: c.surfaceAlt,
                  borderColor: c.divider,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Avatar
                seed={rt.trip.group_id}
                label={rt.groupName}
                photoUrl={rt.groupAvatarUrl}
                size={28}
              />
              <View style={styles.chipText}>
                <AppText variant="caption" weight="semibold" numberOfLines={1}>
                  {rt.trip.name}
                </AppText>
                <AppText variant="meta" tone="muted" numberOfLines={1}>
                  {rt.groupName}
                </AppText>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Pressable
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Tạo chuyến mới hoặc chọn từ nhóm"
        android_ripple={{ color: c.divider }}
        style={({ pressed }) => [
          styles.createOrPickRow,
          {
            borderColor: c.divider,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Plus size={18} color={c.muted} />
        <AppText variant="body" tone="muted" style={styles.createOrPickText}>
          Tạo chuyến mới hoặc chọn từ nhóm
        </AppText>
      </Pressable>

      <AddToPickerSheet
        isOpen={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedTripId={currentTripId}
        onPick={onPick}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    marginBottom: -2,
  },
  chipRow: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 140,
    maxWidth: 200,
  },
  chipText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  createOrPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  createOrPickText: {
    flex: 1,
    minWidth: 0,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  selectedText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  emptyBox: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 12,
    alignItems: 'center',
  },
  createGroupBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
});
