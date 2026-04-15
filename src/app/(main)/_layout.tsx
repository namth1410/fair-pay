import { Stack } from 'expo-router';

import { useAppTheme } from '../../hooks/useAppTheme';

export default function MainLayout() {
  const c = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.foreground,
        contentStyle: { backgroundColor: c.background },
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
  );
}
