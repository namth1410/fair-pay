import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../stores/app.store';
import { hapticLight } from '../../utils/haptics';
import { AppText } from '../ui';

// Header tiêu đề lớn căn trái cho các tab chính (Nhóm / Preset / Thông báo / Cài đặt) —
// kiểu app nhắn tin (giao diện "Hội thoại" 2026-10). Header thuộc scene → trượt cùng nội dung
// khi đổi tab. Màn push (chi tiết) vẫn dùng GlassCapsuleHeader tiêu đề giữa + nút back.
interface LargeTitleHeaderProps {
  title: string;
  /** Nút hành động bên phải (thường là HeaderIconButton). */
  right?: ReactNode;
}

export function LargeTitleHeader({ title, right }: LargeTitleHeaderProps) {
  const c = useAppTheme();
  const insets = useSafeAreaInsets();
  const bannerVisible = useAppStore((s) => s.bannerVisible);

  return (
    <View
      style={{
        // Banner offline đã cover status bar khi visible → bỏ insets.top.
        paddingTop: bannerVisible ? 0 : insets.top,
        backgroundColor: c.surface,
      }}
    >
      <View style={styles.row}>
        <AppText
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: c.foreground }]}
        >
          {title}
        </AppText>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

interface HeaderIconButtonProps {
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

/** Nút tròn 44px nền xám nhạt cho header tiêu đề lớn. */
export function HeaderIconButton({
  Icon,
  accessibilityLabel,
  onPress,
  disabled = false,
}: HeaderIconButtonProps) {
  const c = useAppTheme();
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        hapticLight();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: c.surfaceAlt },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon size={20} color={c.foreground} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 16,
    paddingTop: 10,
    paddingBottom: 12,
    minHeight: 66,
  },
  title: {
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
