import Camera from 'lucide-react-native/dist/esm/icons/camera';
import Plus from 'lucide-react-native/dist/esm/icons/plus';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { AppText } from '../../ui';

// "Ô soạn tin" ở đáy luồng chuyến đi. Không phải ô nhập thật: chạm vào mở form thêm khoản chi
// (đủ người trả / cách chia / ảnh). Nút máy ảnh chụp hoá đơn rồi mở form kèm ảnh.
interface TripComposerProps {
  isClosed: boolean;
  isPicking?: boolean;
  onCompose: () => void;
  onCamera: () => void;
  /** Chuyến đã đóng: nút bên phải (vd "Mở lại" cho admin / "Chi tiết"). */
  closedActionLabel?: string;
  onClosedAction?: () => void;
}

export const TripComposer = memo(function TripComposer({
  isClosed,
  isPicking = false,
  onCompose,
  onCamera,
  closedActionLabel,
  onClosedAction,
}: TripComposerProps) {
  const c = useAppTheme();
  const insets = useSafeAreaInsets();
  const padBottom = Math.max(insets.bottom, 10);

  if (isClosed) {
    return (
      <View
        style={[
          styles.bar,
          { paddingBottom: padBottom, backgroundColor: c.surface, borderTopColor: c.divider },
        ]}
      >
        <AppText variant="caption" tone="muted" style={styles.closedText}>
          Chuyến đã đóng. Mở lại để thêm khoản chi hoặc ghi nhận thanh toán.
        </AppText>
        {closedActionLabel && onClosedAction ? (
          <Pressable
            onPress={onClosedAction}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.closedBtn,
              { borderColor: c.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <AppText variant="caption" weight="bold" style={{ color: c.primary }}>
              {closedActionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: padBottom, backgroundColor: c.surface, borderTopColor: c.divider },
      ]}
    >
      <Pressable
        onPress={onCamera}
        disabled={isPicking}
        accessibilityRole="button"
        accessibilityLabel="Chụp hoá đơn"
        hitSlop={4}
        style={({ pressed }) => [
          styles.round,
          { backgroundColor: c.surfaceAlt, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        {isPicking ? (
          <ActivityIndicator size="small" color={c.muted} />
        ) : (
          <Camera size={21} color={c.foreground} strokeWidth={2} />
        )}
      </Pressable>
      <Pressable
        onPress={onCompose}
        accessibilityRole="button"
        accessibilityLabel="Thêm khoản chi"
        style={({ pressed }) => [
          styles.fakeInput,
          { backgroundColor: c.surfaceAlt, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <AppText variant="subtitle" weight="regular" tone="muted">
          Thêm khoản chi…
        </AppText>
      </Pressable>
      <Pressable
        onPress={onCompose}
        accessibilityRole="button"
        accessibilityLabel="Thêm khoản chi mới"
        hitSlop={4}
        style={({ pressed }) => [
          styles.round,
          { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Plus size={22} color={c.inverseForeground} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fakeInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  closedText: {
    flex: 1,
    paddingHorizontal: 4,
  },
  closedBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
