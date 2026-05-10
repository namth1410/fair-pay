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

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {/* Header render trong từng tab screen → slide cùng scene khi đổi tab. */}
      <ReanimatedTabs
        // jumpMode="smooth" trong navigator → tap tab xa không slide qua tab
        // giữa. Swipe gesture vẫn ở từng adjacent (lib tự handle ±1 index).
        sceneContainerStyle={{ backgroundColor: c.background }}
        renderMode="lazy"
        swipeEnabled
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
