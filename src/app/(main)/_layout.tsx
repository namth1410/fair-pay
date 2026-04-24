import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Avatar } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuthStore } from '../../stores/auth.store';

export default function MainLayout() {
  const c = useAppTheme();
  const user = useAuthStore((s) => s.user);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.foreground,
        contentStyle: { backgroundColor: c.background },
        headerRight: () => (
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Mở cài đặt & hồ sơ"
            android_ripple={{ color: c.divider, borderless: true, radius: 22 }}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && { opacity: 0.55 },
            ]}
          >
            <Avatar
              seed={user?.id ?? 'guest'}
              label={user?.email}
              photoUrl={
                (user?.user_metadata as { avatar_url?: string } | undefined)
                  ?.avatar_url
              }
              size={32}
            />
          </Pressable>
        ),
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerTitle: 'Fair Pay' }}
      />
      <Stack.Screen
        name="groups/[id]"
        options={{ title: 'Nhóm' }}
      />
      <Stack.Screen
        name="trips/[id]/index"
        options={{ title: 'Chuyến đi' }}
      />
      <Stack.Screen
        name="trips/[id]/expenses/new"
        options={{
          title: 'Thêm khoản chi',
          animation: 'none',
          headerRight: () => null,
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: 'Cài đặt',
          animation: 'slide_from_right',
          headerRight: () => null,
        }}
      />
      <Stack.Screen
        name="presets"
        options={{
          title: 'Preset khoản chi',
          animation: 'slide_from_right',
          headerRight: () => null,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
