import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { formatVND } from '../../../utils/format';
import { AppText } from '../../ui';

// Dải ghim dưới header luồng chuyến đi: số dư của bạn + tổng quan, chạm để xem cách tính.
interface TripBalanceBannerProps {
  /** null khi user không còn là thành viên (không có số dư). */
  myBalance: number | null;
  totalExpenses: number;
  expenseCount: number;
  memberCount: number;
  onPress: () => void;
}

export const TripBalanceBanner = memo(function TripBalanceBanner({
  myBalance,
  totalExpenses,
  expenseCount,
  memberCount,
  onPress,
}: TripBalanceBannerProps) {
  const c = useAppTheme();

  // Quy ước dấu: '+' được nhận, '-' đang nợ, 0 → cân bằng.
  let balanceText = 'Bạn đang cân bằng';
  let balanceColor = c.foreground;
  if (myBalance !== null && myBalance !== 0) {
    balanceText = `Số dư của bạn ${myBalance > 0 ? '+' : '-'}${formatVND(Math.abs(myBalance))}`;
    balanceColor = myBalance > 0 ? c.success : c.danger;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${balanceText}. Tổng chi ${formatVND(totalExpenses)}, ${expenseCount} khoản, ${memberCount} người. Xem cách tính`}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: c.brandSoft, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.texts}>
        <AppText variant="body" weight="bold" style={{ color: balanceColor }}>
          {balanceText}
        </AppText>
        <AppText variant="meta" tone="muted" numberOfLines={1}>
          Tổng chi {formatVND(totalExpenses)} · {expenseCount} khoản · {memberCount} người
        </AppText>
      </View>
      <View style={styles.link}>
        <AppText variant="caption" weight="bold" style={{ color: c.primary }}>
          Cách tính
        </AppText>
        <ChevronRight size={16} color={c.primary} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  texts: { flex: 1, minWidth: 0 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
