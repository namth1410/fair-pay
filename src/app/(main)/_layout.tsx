import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppDock } from '../../components/common/AppDock';
import { QuickAddActionSheet } from '../../components/common/QuickAddActionSheet';
import { GlassCapsuleHeader } from '../../components/header/GlassCapsuleHeader';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function MainLayout() {
  const c = useAppTheme();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: c.background },
          header: (props) => <GlassCapsuleHeader {...props} />,
        }}
      >
        {/* Tab group — Tabs navigator giữ Home/Notifications/Settings mounted */}
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
      </Stack>

      <AppDock
        onPlusPress={() => setQuickAddOpen(true)}
        isPlusActive={quickAddOpen}
      />

      <QuickAddActionSheet
        isOpen={quickAddOpen}
        onOpenChange={setQuickAddOpen}
      />
    </View>
  );
}
