/**
 * FCM push notification client — registers device token với Supabase, setup
 * listeners cho foreground/background/tap. Android-only.
 *
 * Foreground: KHÔNG hiện duplicate banner (realtime channel đã handle toast +
 * badge ở `useNotificationRealtime`). Background/killed: hệ thống tự hiện.
 * Tap → parse data.route → deep link + invalidate stores.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { updateFcmToken } from './user.service';

const DEFAULT_CHANNEL_ID = 'default';

// Foreground handler: app đang mở → KHÔNG hiện FCM banner (realtime đã có).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Mặc định',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#10B981',
  });
}

async function requestPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  if (!settings.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/**
 * Gọi sau khi user login thành công. Idempotent: tự skip nếu permission denied
 * hoặc token chưa available. Fire-and-forget — KHÔNG throw để không block login.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (Platform.OS !== 'android') return; // iOS chưa support
    await ensureAndroidChannel();
    const granted = await requestPermission();
    if (!granted) {
      if (__DEV__) console.warn('[Push] Permission denied');
      return;
    }
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (!token) return;
    await updateFcmToken(token);
    if (__DEV__) console.log('[Push] FCM token registered');
  } catch (e) {
    if (__DEV__) console.warn('[Push] register failed:', e);
  }
}

/**
 * Gọi TRƯỚC khi clear session ở signOut — vì update users.fcm_token cần auth
 * còn active để pass RLS.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    await updateFcmToken(null);
  } catch (e) {
    if (__DEV__) console.warn('[Push] unregister failed:', e);
  }
}

export interface PushNotificationData {
  notification_id?: string;
  type?: string;
  group_id?: string | null;
  trip_id?: string | null;
  route?: string;
}

/**
 * Setup listeners cho foreground reception + tap response. Trả cleanup
 * function — gọi 1 lần ở root layout.
 *
 * `onTap` nhận data của notification user tap; layout gốc dùng để router.push
 * + invalidate stores.
 */
export function setupNotificationListeners(
  onTap: (data: PushNotificationData) => void
): () => void {
  // Notification được tap khi app đang background/foreground.
  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content
        .data as PushNotificationData;
      onTap(data ?? {});
    }
  );

  // Handle cold-start case: app bị kill, user tap notification → app launch.
  // getLastNotificationResponseAsync trả notification đã tap để khai mở app.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) return;
      const data = response.notification.request.content
        .data as PushNotificationData;
      onTap(data ?? {});
    })
    .catch((e) => {
      if (__DEV__) console.warn('[Push] getLastNotificationResponse failed:', e);
    });

  return () => {
    responseSub.remove();
  };
}
