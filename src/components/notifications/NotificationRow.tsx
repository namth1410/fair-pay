import {
  Bell,
  CheckCircle2,
  CreditCard,
  PencilLine,
  Receipt,
  Sparkles,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react-native';
import { memo, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { Notification } from '../../services/notification.service';
import { hapticMedium } from '../../utils/haptics';
import { AppText } from '../ui/AppText';
import { Avatar } from '../ui/Avatar';

interface Props {
  notification: Notification;
  /** Nhận id thay vì closure để parent giữ callback stable → React.memo skip đúng. */
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'vừa xong';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

function iconForType(type: string, size: number, color: string) {
  if (type.startsWith('expense.created'))
    return <Receipt size={size} color={color} />;
  if (type.startsWith('expense.edited'))
    return <PencilLine size={size} color={color} />;
  if (type.startsWith('expense.deleted'))
    return <Trash2 size={size} color={color} />;
  if (type === 'payment.received' || type === 'payment.recorded')
    return <CreditCard size={size} color={color} />;
  if (type === 'member.join_requested')
    return <UserPlus size={size} color={color} />;
  if (type === 'member.join_approved')
    return <CheckCircle2 size={size} color={color} />;
  if (type === 'member.join_rejected')
    return <XCircle size={size} color={color} />;
  if (type === 'member.invite_received')
    return <UserPlus size={size} color={color} />;
  if (type === 'member.invite_accepted')
    return <CheckCircle2 size={size} color={color} />;
  if (type === 'member.invite_declined')
    return <XCircle size={size} color={color} />;
  if (type === 'member.invite_revoked')
    return <UserMinus size={size} color={color} />;
  if (type === 'member.role_change')
    return <Users size={size} color={color} />;
  if (type === 'trip.closed')
    return <UserMinus size={size} color={color} />;
  if (type === 'trip.reminder_settle')
    return <Sparkles size={size} color={color} />;
  return <Bell size={size} color={color} />;
}

function RightAction({
  progress,
  onDelete,
}: {
  progress: SharedValue<number>;
  onDelete: () => void;
}) {
  const c = useAppTheme();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(progress.value, 1),
  }));
  return (
    <Animated.View style={[styles.rightAction, animatedStyle]}>
      <Pressable
        onPress={onDelete}
        style={[styles.deleteButton, { backgroundColor: c.danger }]}
        accessibilityRole="button"
        accessibilityLabel="Xóa thông báo"
      >
        <Trash2 size={18} color={c.inverseForeground} strokeWidth={2} />
        <AppText variant="meta" weight="semibold" tone="inverse">
          Xóa
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function NotificationRowImpl({ notification, onPress, onDelete }: Props) {
  const c = useAppTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const isUnread = !notification.read_at;

  const id = notification.id;
  const handleDelete = useCallback(() => {
    hapticMedium();
    swipeableRef.current?.close();
    onDelete(id);
  }, [onDelete, id]);

  const handlePress = useCallback(() => {
    onPress(id);
  }, [onPress, id]);

  const renderRightActions = useCallback(
    (progress: SharedValue<number>) => (
      <RightAction progress={progress} onDelete={handleDelete} />
    ),
    [handleDelete]
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={notification.title}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: isUnread ? c.surface : c.background,
            borderBottomColor: c.divider,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.leading}>
          {notification.actor_id ? (
            <Avatar
              seed={notification.actor_id}
              label={notification.actor_name}
              photoUrl={notification.actor_photo_url}
              size={40}
            />
          ) : (
            <View style={[styles.iconBg, { backgroundColor: c.accentSoft }]}>
              {iconForType(notification.type, 20, c.primaryStrong)}
            </View>
          )}
          <View style={[styles.typeIcon, { backgroundColor: c.background, borderColor: c.divider }]}>
            {iconForType(notification.type, 12, c.muted)}
          </View>
        </View>

        <View style={styles.body}>
          <AppText
            variant="body"
            weight={isUnread ? 'semibold' : 'regular'}
            numberOfLines={2}
          >
            {notification.title}
          </AppText>
          <View style={styles.meta}>
            {notification.group_name ? (
              <AppText variant="meta" tone="muted">
                {notification.group_name} ·
              </AppText>
            ) : null}
            <AppText variant="meta" tone="muted">
              {relativeTime(notification.created_at)}
            </AppText>
          </View>
        </View>

        {isUnread ? (
          <View style={[styles.unreadDot, { backgroundColor: c.primaryStrong }]} />
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export const NotificationRow = memo(NotificationRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leading: { width: 44, height: 44, position: 'relative' },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIcon: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: 'row', gap: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  rightAction: { justifyContent: 'center', alignItems: 'flex-end' },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    gap: 4,
  },
});
