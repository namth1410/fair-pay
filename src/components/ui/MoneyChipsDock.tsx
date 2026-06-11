import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardStickyView, useKeyboardHandler } from 'react-native-keyboard-controller';
import { runOnJS } from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { computeMoneySuggestions, formatThousands } from '../../utils/format';
import { AppText } from './AppText';

/** Số cột cố định — chip luôn rộng bằng 1/COLS dù gợi ý ít hơn (giống MoMo). */
const COLS = 3;
const GAP = 8;

interface MoneyChipsDockProps {
  /**
   * Input tiền đang focus (consumer track qua onFocus/onBlur). Component tự
   * gate thêm theo keyboard visibility — chip sẽ ẩn nếu user đóng bàn phím
   * bằng nút hệ thống dù input còn focus (Oppo/Samsung/Xiaomi).
   */
  visible: boolean;
  /** Raw digit string của input tiền. */
  amountStr: string;
  /** Pick callback — set raw digit string. */
  onPick: (amount: number) => void;
}

export function MoneyChipsDock({ visible, amountStr, onPick }: MoneyChipsDockProps) {
  const c = useAppTheme();
  const [keyboardOpening, setKeyboardOpening] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);
  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        runOnJS(setKeyboardOpening)(e.height > 0);
      },
    },
    [],
  );
  const suggestions = useMemo(() => computeMoneySuggestions(amountStr), [amountStr]);
  if (!visible || !keyboardOpening || suggestions.length === 0) return null;

  // Chia bề rộng hàng thành COLS slot bằng nhau. Chip giữ nguyên width slot dù
  // còn 1–2 gợi ý → hàng "cắt bớt" về bên trái, không kéo dãn lấp đầy.
  const chipWidth = rowWidth > 0 ? (rowWidth - GAP * (COLS - 1)) / COLS : undefined;

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.dock}>
      <View
        style={[
          styles.wrap,
          { backgroundColor: c.background, borderTopColor: c.divider },
        ]}
      >
        <View
          style={styles.row}
          onLayout={(e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width)}
        >
          {suggestions.map((amount) => (
            <Pressable
              key={amount}
              onPress={() => onPick(amount)}
              accessibilityRole="button"
              accessibilityLabel={`Chọn ${formatThousands(amount)} đồng`}
              style={({ pressed }) => [
                styles.chip,
                chipWidth != null && { width: chipWidth },
                {
                  backgroundColor: c.isDark ? c.surface : c.surfaceAlt,
                  borderColor: c.divider,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AppText
                variant="caption"
                weight="semibold"
                numberOfLines={1}
                style={{ color: c.isDark ? c.primaryStrong : c.foreground }}
              >
                {formatThousands(amount)}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  wrap: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
    paddingVertical: 2,
    alignItems: 'center',
  },
  chip: {
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
});
