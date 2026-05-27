import { CheckCheck } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useNotificationStore } from '../../stores/notification.store';
import { hapticLight } from '../../utils/haptics';
import { showError, showSuccess } from '../../utils/toast';
import { BALL_RADIUS } from './headerConstants';

const BALL_DIAMETER = BALL_RADIUS * 2;

export function MarkAllReadButton() {
  const c = useAppTheme();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const groupIds = useNotificationStore((s) => s.filter.groupIds);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const disabled = unreadCount === 0;

  return (
    <Pressable
      onPress={async () => {
        if (disabled) return;
        hapticLight();
        try {
          await markAllAsRead({ groupIds });
          showSuccess('Đã đánh dấu tất cả đã đọc');
        } catch (e) {
          showError(e);
        }
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel="Đánh dấu tất cả đã đọc"
      android_ripple={
        disabled ? undefined : { color: c.divider, borderless: true, radius: 22 }
      }
      style={({ pressed }) => [
        styles.iconButton,
        pressed && !disabled && { opacity: 0.5 },
        disabled && { opacity: 0.35 },
      ]}
    >
      <CheckCheck size={22} color={c.foreground} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    minWidth: BALL_DIAMETER,
    minHeight: BALL_DIAMETER,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
