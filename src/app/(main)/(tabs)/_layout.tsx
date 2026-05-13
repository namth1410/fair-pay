import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { withLayoutContext } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppDock } from '../../../components/common/AppDock';
import { QuickAddActionSheet } from '../../../components/common/QuickAddActionSheet';
import {
  createReanimatedTabNavigator,
  type ReanimatedTabNavigationEventMap,
  type ReanimatedTabNavigationOptions,
} from '../../../components/common/ReanimatedTabsNavigator';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useUIStore } from '../../../stores/ui.store';

const { Navigator } = createReanimatedTabNavigator();

const ReanimatedTabs = withLayoutContext<
  ReanimatedTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  ReanimatedTabNavigationEventMap
>(Navigator);

export default function TabsLayout() {
  const c = useAppTheme();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Carousel ở Home toggle flag này khi user chạm vào → tắt swipeEnabled tab
  // trong thời gian đó để 2 pan ngang không lẫn lộn. tab-view dùng threshold
  // 10px còn carousel 12px → mặc định tab thắng. Disable hẳn lúc touching là
  // cách dứt điểm. Flag clear ở Pan.onFinalize (end/cancel/fail).
  const carouselTouching = useUIStore((s) => s.carouselTouching);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {/* Header render trong từng tab screen → slide cùng scene khi đổi tab. */}
      <ReanimatedTabs
        // jumpMode="smooth" trong navigator → tap tab xa không slide qua tab
        // giữa. Swipe gesture vẫn ở từng adjacent (lib tự handle ±1 index).
        sceneContainerStyle={{ backgroundColor: c.background }}
        renderMode="lazy"
        swipeEnabled={!carouselTouching}
      >
        <ReanimatedTabs.Screen name="index" />
        <ReanimatedTabs.Screen name="notifications" />
        <ReanimatedTabs.Screen name="presets" />
        <ReanimatedTabs.Screen name="settings" />
      </ReanimatedTabs>

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

const styles = StyleSheet.create({
  root: { flex: 1 },
});
