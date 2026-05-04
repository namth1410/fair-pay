import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useNotificationStore } from '../../stores/notification.store';
import { hapticLight } from '../../utils/haptics';
import { AppText } from '../ui/AppText';

export function NotificationBell() {
  const c = useAppTheme();
  const unread = useNotificationStore((s) => s.unreadCount);

  const onPress = () => {
    hapticLight();
    router.push('/notifications');
  };

  const badge = unread > 9 ? '9+' : String(unread);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}
      hitSlop={8}
      android_ripple={{ color: c.divider, borderless: true, radius: 22 }}
      style={({ pressed }) => [
        styles.btn,
        pressed && { opacity: 0.55 },
      ]}
    >
      <Bell size={22} color={c.foreground} strokeWidth={1.8} />
      {unread > 0 ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: c.danger, borderColor: c.background },
          ]}
        >
          <AppText
            variant="meta"
            weight="bold"
            tone="inverse"
            style={styles.badgeText}
          >
            {badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeText: {
    fontSize: 9,
    lineHeight: 11,
  },
});
