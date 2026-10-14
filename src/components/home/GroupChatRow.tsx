import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { formatShortVND, formatVND } from '../../utils/format';
import { hapticLight } from '../../utils/haptics';
import { AppText, Avatar } from '../ui';

// Hàng nhóm kiểu danh sách đoạn chat (giao diện "Hội thoại"): avatar to, tên đậm, dòng
// xem trước + số dư gọn ở cuối. Đường kẻ chỉ chạy dưới phần chữ (không dưới avatar).
const AVATAR_SIZE = 54;

interface GroupChatRowProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  memberCount: number;
  balance: number;
  /** Dòng xem trước dưới tên; mặc định "N thành viên". */
  preview?: string;
  isLast?: boolean;
  onPress: () => void;
}

export const GroupChatRow = memo(function GroupChatRow({
  id,
  name,
  avatarUrl,
  memberCount,
  balance,
  preview,
  isLast = false,
  onPress,
}: GroupChatRowProps) {
  const c = useAppTheme();

  const isSettled = balance === 0;
  // Quy ước dấu: '+' được nhận (success), '-' đang nợ (danger), 0 → "Cân bằng".
  let balanceLabel = 'Cân bằng';
  let balanceColor = c.muted;
  let a11yBalance = 'cân bằng';
  if (balance > 0) {
    balanceLabel = `+${formatShortVND(balance)}`;
    balanceColor = c.success;
    a11yBalance = `được nhận ${formatVND(balance)}`;
  } else if (balance < 0) {
    balanceLabel = `-${formatShortVND(balance)}`;
    balanceColor = c.danger;
    a11yBalance = `cần trả ${formatVND(-balance)}`;
  }

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${memberCount} thành viên, ${a11yBalance}`}
      android_ripple={{ color: c.surfaceAlt }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: c.surfaceAlt },
      ]}
    >
      <Avatar seed={id} label={name} photoUrl={avatarUrl ?? null} size={AVATAR_SIZE} />
      <View
        style={[
          styles.content,
          !isLast && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.divider,
          },
        ]}
      >
        <AppText variant="subtitle" weight="bold" numberOfLines={1}>
          {name}
        </AppText>
        <View style={styles.bottomLine}>
          <AppText
            variant="caption"
            tone="muted"
            numberOfLines={1}
            style={styles.preview}
          >
            {preview ?? `${memberCount} thành viên`}
          </AppText>
          <AppText
            variant="caption"
            weight={isSettled ? 'medium' : 'bold'}
            style={{ color: balanceColor }}
          >
            {balanceLabel}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    minHeight: 76,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    paddingRight: 16,
  },
  bottomLine: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  preview: {
    flex: 1,
    minWidth: 0,
  },
});
