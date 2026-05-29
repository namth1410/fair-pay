import { Stack } from 'expo-router';
import { View } from 'react-native';

import { GlassCapsuleHeader } from '../../components/header/GlassCapsuleHeader';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAnimationsEnabled } from '../../utils/userPreferences';

export default function MainLayout() {
  const c = useAppTheme();
  const animationsEnabled = useAnimationsEnabled();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: c.background },
          header: (props) => <GlassCapsuleHeader {...props} />,
          // Một ngôn ngữ transition duy nhất cho mọi push màn (slide ngang).
          // Tắt hiệu ứng → 'none' (chuyển tức thì). Hook reactive nên toggle ở
          // Settings áp dụng ngay, không cần restart.
          animation: animationsEnabled ? 'slide_from_right' : 'none',
        }}
      >
        {/* Tab group — MaterialTopTabs (swipeable) + AppDock render trong (tabs)/_layout */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Deep pages — push từ tabs, kế thừa animation global ở screenOptions */}
        <Stack.Screen name="groups/[id]" options={{ title: 'Nhóm' }} />
        <Stack.Screen name="trips/[id]/index" options={{ title: 'Chuyến đi' }} />
        <Stack.Screen
          name="trips/[id]/expenses/new"
          options={{ title: 'Thêm khoản chi' }}
        />
        <Stack.Screen
          name="expenses/new"
          options={{ title: 'Thêm khoản chi' }}
        />
        <Stack.Screen
          name="preset-form"
          options={{ title: 'Preset khoản chi' }}
        />
      </Stack>
    </View>
  );
}
