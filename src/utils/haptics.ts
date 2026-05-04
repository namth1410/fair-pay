import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { getHapticsEnabled } from './userPreferences';

const shouldFire = () => Platform.OS !== 'web' && getHapticsEnabled();

export function hapticLight() {
  if (shouldFire()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticMedium() {
  if (shouldFire()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticHeavy() {
  if (shouldFire()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

export function hapticSuccess() {
  if (shouldFire()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticError() {
  if (shouldFire()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
