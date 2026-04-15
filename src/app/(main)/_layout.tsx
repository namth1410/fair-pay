import { Tabs } from 'expo-router';
import { Settings, Users } from 'lucide-react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

export default function MainLayout() {
  const c = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.foreground,
        tabBarStyle: {
          backgroundColor: c.background,
          borderTopColor: c.divider,
        },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Nhóm',
          headerTitle: 'SplitVN',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Cài đặt',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
      {/* Hidden from tab bar — accessed via push navigation */}
      <Tabs.Screen
        name="groups/[id]"
        options={{ href: null, title: 'Nhóm' }}
      />
      <Tabs.Screen
        name="trips/[id]"
        options={{ href: null, title: 'Chuyến đi' }}
      />
    </Tabs>
  );
}
