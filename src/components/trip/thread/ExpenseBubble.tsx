import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { fonts } from '../../../config/fonts';
import { useAppTheme } from '../../../hooks/useAppTheme';
import type { ExpenseWithSplits } from '../../../services/expense.service';
import { formatVND } from '../../../utils/format';
import { AppText, Avatar } from '../../ui';

// Bong bóng tin "khoản chi" trong luồng chuyến đi. Người gửi = người TRẢ tiền
// (tiền đi từ người đó); khoản do mình trả nằm bên phải, màu thương hiệu.
interface ExpenseBubbleProps {
  expense: ExpenseWithSplits;
  isMine: boolean;
  senderName: string;
  /** Dòng phụ dưới số tiền (cách chia, phần của bạn, người ghi...). */
  detail: string;
  onPress: (expense: ExpenseWithSplits) => void;
  onLongPress?: (expense: ExpenseWithSplits) => void;
  /** false khi tin liền trên (cũ hơn) cùng người gửi → ẩn tên. */
  showSender?: boolean;
  /** false khi tin liền dưới (mới hơn) cùng người gửi → ẩn avatar, giữ chỗ để thẳng hàng. */
  showAvatar?: boolean;
}

export const ExpenseBubble = memo(function ExpenseBubble({
  expense,
  isMine,
  senderName,
  detail,
  onPress,
  onLongPress,
  showSender = true,
  showAvatar = true,
}: ExpenseBubbleProps) {
  const c = useAppTheme();
  const fg = isMine ? c.onBubbleMine : c.foreground;
  const sub = isMine ? c.onBubbleMineMuted : c.muted;

  const bubble = (
    <Pressable
      onPress={() => onPress(expense)}
      onLongPress={onLongPress ? () => onLongPress(expense) : undefined}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${isMine ? 'Bạn' : senderName} trả ${formatVND(expense.amount)} cho ${expense.title}. ${detail}`}
      accessibilityHint={onLongPress ? 'Nhấn giữ để xoá' : undefined}
      style={({ pressed }) => [
        styles.bubble,
        isMine ? styles.tailRight : styles.tailLeft,
        { backgroundColor: isMine ? c.bubbleMine : c.bubbleOther },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.bubbleRow}>
        <View style={styles.texts}>
          <AppText
            variant="body"
            weight="semibold"
            numberOfLines={2}
            style={{ color: fg }}
          >
            {expense.title}
          </AppText>
          <AppText style={[styles.amount, { color: fg }]}>
            {formatVND(expense.amount)}
          </AppText>
        </View>
        {expense.image_url ? (
          <Image
            source={{ uri: expense.image_url }}
            style={styles.thumb}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <AppText variant="meta" style={[styles.detail, { color: sub }]}>
        {detail}
      </AppText>
    </Pressable>
  );

  if (isMine) {
    return <View style={styles.mineRow}>{bubble}</View>;
  }

  return (
    <View style={styles.otherRow}>
      {showAvatar ? (
        <Avatar seed={expense.paid_by} label={senderName} size={28} />
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      <View style={styles.otherCol}>
        {showSender ? (
          <AppText variant="meta" weight="semibold" tone="muted" style={styles.sender}>
            {senderName}
          </AppText>
        ) : null}
        {bubble}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  mineRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 4,
    paddingLeft: 56,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 4,
    paddingRight: 48,
  },
  otherCol: {
    flexShrink: 1,
  },
  avatarSpacer: { width: 28 },
  sender: {
    marginLeft: 12,
    marginBottom: 3,
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 11,
    flexShrink: 1,
  },
  tailRight: { borderBottomRightRadius: 6 },
  tailLeft: { borderBottomLeftRadius: 6 },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  texts: {
    flexShrink: 1,
  },
  amount: {
    marginTop: 3,
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  detail: {
    marginTop: 2,
  },
});
