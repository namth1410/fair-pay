import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatVND } from '../../utils/format';
import { AppText } from '../ui';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- ảnh tĩnh RN phải nạp qua require
const DRAGON = require('../../../assets/mascot/dragon-receipt.png');

const AVATAR = 40;

interface DragonSummaryBubbleProps {
  /** Tổng số dư ròng (+ được nhận, - đang nợ). */
  total: number;
  /** Tổng các nhóm đang được nhận (>= 0). */
  owed: number;
  /** Tổng các nhóm đang nợ, giá trị tuyệt đối (>= 0). */
  owing: number;
  groupCount: number;
}

// Tin nhắn tổng kết từ "Rồng Fair Pay" ở đầu trang chủ — thay HeroDebt (giao diện "Hội thoại").
export const DragonSummaryBubble = memo(function DragonSummaryBubble({
  total,
  owed,
  owing,
  groupCount,
}: DragonSummaryBubbleProps) {
  const c = useAppTheme();
  const settled = owed === 0 && owing === 0;
  // Quy ước dấu: '+' được nhận, '-' đang nợ (góc nhìn user).
  const sign = total >= 0 ? '+' : '-';

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: c.brandSoft }]}>
        <Image
          source={DRAGON}
          style={styles.dragon}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      </View>
      <View
        style={[styles.bubble, { backgroundColor: c.bubbleOther }]}
        accessible
        accessibilityLabel={
          settled
            ? `Rồng Fair Pay: bạn đang cân bằng ở cả ${groupCount} nhóm`
            : `Rồng Fair Pay: được nhận ${formatVND(owed)}, đang nợ ${formatVND(owing)}, còn lại ${sign}${formatVND(Math.abs(total))}`
        }
      >
        <AppText variant="meta" weight="bold" tone="muted">
          Rồng Fair Pay
        </AppText>
        {settled ? (
          <AppText variant="body" style={styles.text}>
            Bạn đang cân bằng ở cả {groupCount} nhóm. Không ai nợ ai!
          </AppText>
        ) : (
          <>
            <AppText variant="body" style={styles.text}>
              Tổng kết {groupCount} nhóm: bạn được nhận{' '}
              <AppText variant="body" weight="bold" style={styles.text}>
                {formatVND(owed)}
              </AppText>
              , đang nợ{' '}
              <AppText variant="body" weight="bold" style={styles.text}>
                {formatVND(owing)}
              </AppText>
              .
            </AppText>
            <AppText
              style={[
                styles.total,
                { color: total >= 0 ? c.success : c.danger },
              ]}
            >
              Còn lại {sign}
              {formatVND(Math.abs(total))}
            </AppText>
          </>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
  },
  // Phóng to + đẩy lên để khung tròn 40px lấy phần đầu rồng (ảnh gốc là cả thân).
  dragon: {
    width: AVATAR * 1.5,
    height: AVATAR * 1.48,
    marginTop: 1,
  },
  bubble: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 2,
  },
  total: {
    marginTop: 8,
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
});
