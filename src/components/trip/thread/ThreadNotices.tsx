import Lock from 'lucide-react-native/dist/esm/icons/lock';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { AppText } from '../../ui';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- ảnh tĩnh RN phải nạp qua require
const DRAGON = require('../../../../assets/mascot/dragon-receipt.png');

/** Vạch ngày giữa luồng: "Hôm nay", "Chủ Nhật, 11/10"... */
export const ThreadDaySeparator = memo(function ThreadDaySeparator({
  title,
}: {
  title: string;
}) {
  const c = useAppTheme();
  return (
    <View style={styles.centerRow}>
      <View style={[styles.pill, { backgroundColor: c.surfaceAlt }]}>
        <AppText variant="meta" weight="semibold" tone="muted">
          {title}
        </AppText>
      </View>
    </View>
  );
});

/** Tin hệ thống ở giữa luồng (vd "Chuyến đi đã đóng · 13/10"). */
export const ThreadSystemNotice = memo(function ThreadSystemNotice({
  text,
}: {
  text: string;
}) {
  const c = useAppTheme();
  return (
    <View style={styles.centerRow}>
      <View style={[styles.pill, styles.pillRow, { backgroundColor: c.surfaceAlt }]}>
        <Lock size={12} color={c.muted} strokeWidth={2.4} />
        <AppText variant="meta" weight="semibold" tone="muted">
          {text}
        </AppText>
      </View>
    </View>
  );
});

/** Avatar tròn của "Rồng Fair Pay" — phóng to ảnh để khung tròn lấy phần đầu. */
export function DragonAvatar({ size }: { size: number }) {
  const c = useAppTheme();
  return (
    <View
      style={[
        styles.dragonWrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.brandSoft },
      ]}
    >
      <Image
        source={DRAGON}
        style={{ width: size * 1.5, height: size * 1.48, marginTop: 1 }}
        accessible={false}
      />
    </View>
  );
}

/** Tin của rồng trong luồng: lời nhắn + (tuỳ chọn) 1 nút hành động. */
export const DragonMessage = memo(function DragonMessage({
  title,
  text,
  actionLabel,
  onAction,
}: {
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const c = useAppTheme();
  return (
    <View style={styles.dragonRow}>
      <DragonAvatar size={28} />
      <View
        style={[
          styles.dragonBubble,
          { backgroundColor: c.surface, borderColor: c.brandBorder },
        ]}
      >
        <AppText variant="meta" weight="bold" style={{ color: c.success }}>
          {title}
        </AppText>
        <AppText variant="body" style={styles.dragonText}>
          {text}
        </AppText>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.dragonBtn,
              { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              style={{ color: c.inverseForeground }}
            >
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  centerRow: {
    alignItems: 'center',
    marginVertical: 10,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dragonWrap: {
    overflow: 'hidden',
    alignItems: 'center',
  },
  dragonRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 4,
    paddingRight: 32,
  },
  dragonBubble: {
    flexShrink: 1,
    borderWidth: 1.5,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  dragonText: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 21,
  },
  dragonBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
