import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { SettingsSheet } from '../../components/common/SettingsSheet';
import { Avatar } from '../../components/ui';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuthStore } from '../../stores/auth.store';

export default function MainLayout() {
  const c = useAppTheme();
  const user = useAuthStore((s) => s.user);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.foreground,
          contentStyle: { backgroundColor: c.background },
          headerRight: () => (
            <Pressable
              onPress={() => setSettingsOpen(true)}
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
          name="trips/[id]"
          options={{ title: 'Chuyến đi' }}
        />
      </Stack>
      <SettingsSheet isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
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
