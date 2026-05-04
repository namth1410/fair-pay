import { Button } from 'heroui-native';
import { Pencil } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui';

interface GroupSettingsTabProps {
  memberCount: number;
  virtualMemberCount: number;
  tripCount: number;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
}

export const GroupSettingsTab = React.memo(function GroupSettingsTab({
  memberCount, virtualMemberCount, tripCount, onEditGroup, onDeleteGroup,
}: GroupSettingsTabProps) {
  const c = useAppTheme();

  return (
    <>
      <Pressable
        onPress={onEditGroup}
        accessibilityRole="button"
        accessibilityLabel="Sửa thông tin nhóm"
        style={({ pressed }) => [
          styles.editCard,
          {
            backgroundColor: c.surface,
            borderColor: c.divider,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: c.primarySoft }]}>
          <Pencil size={18} color={c.primaryStrong} />
        </View>
        <View style={styles.editTextWrap}>
          <AppText variant="body" weight="semibold">Sửa thông tin nhóm</AppText>
          <AppText variant="caption" tone="muted">Đổi tên và ảnh đại diện</AppText>
        </View>
      </Pressable>

      <View style={[styles.infoCard, { backgroundColor: c.surface, borderColor: c.divider }]}>
        <View style={styles.infoRow}>
          <AppText variant="body" tone="muted">Tổng thành viên</AppText>
          <AppText variant="body" weight="semibold">{memberCount}</AppText>
        </View>
        <View style={[styles.infoDivider, { backgroundColor: c.divider }]} />
        <View style={styles.infoRow}>
          <AppText variant="body" tone="muted">Thành viên ảo</AppText>
          <AppText variant="body" weight="semibold">{virtualMemberCount}</AppText>
        </View>
        <View style={[styles.infoDivider, { backgroundColor: c.divider }]} />
        <View style={styles.infoRow}>
          <AppText variant="body" tone="muted">Tổng chuyến đi</AppText>
          <AppText variant="body" weight="semibold">{tripCount}</AppText>
        </View>
      </View>

      <Button variant="danger" size="md" onPress={onDeleteGroup}>
        <Button.Label>Xóa nhóm</Button.Label>
      </Button>
    </>
  );
});

const styles = StyleSheet.create({
  editCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 36,
  },
  infoDivider: {
    height: 1,
    marginVertical: 8,
  },
});
