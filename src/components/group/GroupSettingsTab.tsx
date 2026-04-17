import { Button } from 'heroui-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui';

interface GroupSettingsTabProps {
  memberCount: number;
  virtualMemberCount: number;
  tripCount: number;
  onDeleteGroup: () => void;
}

export const GroupSettingsTab = React.memo(function GroupSettingsTab({
  memberCount, virtualMemberCount, tripCount, onDeleteGroup,
}: GroupSettingsTabProps) {
  const c = useAppTheme();

  return (
    <>
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
