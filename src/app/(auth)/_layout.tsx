import { Stack } from 'expo-router';

import { useAnimationsEnabled } from '../../utils/userPreferences';

export default function AuthLayout() {
  const animationsEnabled = useAnimationsEnabled();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Đồng bộ slide_from_right với (main); tắt hiệu ứng → chuyển tức thì.
        animation: animationsEnabled ? 'slide_from_right' : 'none',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
