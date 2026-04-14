import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { colors } from '../../config/theme';

export default function MainLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.foreground,
        tabBarStyle: {
          backgroundColor: c.background,
          borderTopColor: isDark ? '#334155' : '#E2E8F0',
        },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: isDark ? '#94A3B8' : '#64748B',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Nhóm',
          headerTitle: 'SplitVN',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Cài đặt',
        }}
      />
      {/* Hide group detail from tab bar — accessed via push */}
      <Tabs.Screen
        name="groups/[id]"
        options={{
          href: null,
          title: 'Nhóm',
        }}
      />
    </Tabs>
  );
}
