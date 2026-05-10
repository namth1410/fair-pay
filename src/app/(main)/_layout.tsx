import { Stack } from 'expo-router';
import { View } from 'react-native';

import { GlassCapsuleHeader } from '../../components/header/GlassCapsuleHeader';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function MainLayout() {
  const c = useAppTheme();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: c.background },
          header: (props) => <GlassCapsuleHeader {...props} />,
        }}
      >
        {/* Tab group — MaterialTopTabs (swipeable) + AppDock render trong (tabs)/_layout */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Deep pages — push từ tabs, có animation riêng */}
        <Stack.Screen
          name="groups/[id]"
          options={{ title: 'Nhóm', animation: 'fade' }}
        />
        <Stack.Screen name="trips/[id]/index" options={{ title: 'Chuyến đi' }} />
        <Stack.Screen
          name="trips/[id]/expenses/new"
          options={{ title: 'Thêm khoản chi', animation: 'none' }}
        />
        <Stack.Screen
          name="expenses/new"
          options={{ title: 'Thêm khoản chi', animation: 'none' }}
        />
      </Stack>
    </View>
  );
}
