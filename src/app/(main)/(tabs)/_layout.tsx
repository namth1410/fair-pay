import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';

import { GlassCapsuleHeader } from '../../../components/header/GlassCapsuleHeader';
import { useAppTheme } from '../../../hooks/useAppTheme';

// Tabs giữ screens MOUNTED sau lần focus đầu — tap dock chỉ swap visible
// view, không remount + không refetch data → UX instant. AppDock vẫn render
// overlay từ (main)/_layout.tsx, nên tabBar built-in được ẩn hoàn toàn.
//
// Header dùng chung GlassCapsuleHeader. Type của Tabs header (BottomTabHeaderProps)
// có shape khác NativeStackHeaderProps (không có `back`) — cast vì
// GlassCapsuleHeader đã handle back=undefined → hasBack=false → no back ball.
export default function TabsLayout() {
  const c = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: c.background },
        header: (props: BottomTabHeaderProps) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <GlassCapsuleHeader {...(props as any)} />,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={() => null}
    >
      <Tabs.Screen name="index" options={{ headerShown: false }} />
      <Tabs.Screen name="notifications" options={{ title: 'Thông báo' }} />
      <Tabs.Screen name="presets" options={{ title: 'Preset khoản chi' }} />
      <Tabs.Screen name="settings" options={{ title: 'Cài đặt' }} />
    </Tabs>
  );
}
