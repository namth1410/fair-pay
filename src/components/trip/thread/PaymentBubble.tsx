import ArrowRight from 'lucide-react-native/dist/esm/icons/arrow-right';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fonts } from '../../../config/fonts';
import { useAppTheme } from '../../../hooks/useAppTheme';
import type { Payment } from '../../../services/payment.service';
import { formatVND } from '../../../utils/format';
import { AppText, Avatar } from '../../ui';

// Bong bóng tin "chuyển tiền" (thanh toán) — viền + nền xanh nhạt để khác khoản chi.
interface PaymentBubbleProps {
  payment: Payment;
  isMine: boolean;
  senderName: string;
  /** Vd "Đã chuyển cho bạn", "Bạn đã chuyển cho Hà". */
  headline: string;
  onLongPress?: (payment: Payment) => void;
  /** false khi tin liền trên (cũ hơn) cùng người gửi → ẩn tên. */
  showSender?: boolean;
  /** false khi tin liền dưới (mới hơn) cùng người gửi → ẩn avatar, giữ chỗ để thẳng hàng. */
  showAvatar?: boolean;
}

export const PaymentBubble = memo(function PaymentBubble({
  payment,
  isMine,
  senderName,
  headline,
  onLongPress,
  showSender = true,
  showAvatar = true,
}: PaymentBubbleProps) {
  const c = useAppTheme();

  const bubble = (
    <Pressable
      onLongPress={onLongPress ? () => onLongPress(payment) : undefined}
      delayLongPress={350}
      accessibilityRole="text"
      accessibilityLabel={`${isMine ? 'Bạn' : senderName}: ${headline} ${formatVND(payment.amount)}`}
      accessibilityHint={onLongPress ? 'Nhấn giữ để xoá thanh toán' : undefined}
      style={[
        styles.bubble,
        isMine ? styles.tailRight : styles.tailLeft,
        { backgroundColor: c.brandSoft, borderColor: c.brandBorder },
      ]}
    >
      <View style={styles.head}>
        <ArrowRight size={15} color={c.success} strokeWidth={2.4} />
        <AppText variant="caption" weight="bold" style={{ color: c.success }}>
          {headline}
        </AppText>
      </View>
      <AppText style={[styles.amount, { color: c.foreground }]}>
        {formatVND(payment.amount)}
      </AppText>
      {payment.note ? (
        <AppText variant="meta" tone="muted" numberOfLines={2} style={styles.note}>
          {payment.note}
        </AppText>
      ) : null}
    </Pressable>
  );

  if (isMine) {
    return <View style={styles.mineRow}>{bubble}</View>;
  }

  return (
    <View style={styles.otherRow}>
      {showAvatar ? (
        <Avatar seed={payment.from_member_id} label={senderName} size={28} />
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
  otherCol: { flexShrink: 1 },
  avatarSpacer: { width: 28 },
  sender: { marginLeft: 12, marginBottom: 3 },
  bubble: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 11,
    flexShrink: 1,
  },
  tailRight: { borderBottomRightRadius: 6 },
  tailLeft: { borderBottomLeftRadius: 6 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  amount: {
    marginTop: 3,
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  note: { marginTop: 2 },
});
