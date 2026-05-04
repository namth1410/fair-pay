import { useNavigation } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useUIStore } from '../../stores/ui.store';
import { hapticLight } from '../../utils/haptics';
import { BALL_RADIUS } from './headerConstants';

export type Slot = {
  id: string;
  render: () => React.ReactNode;
};

export type RouteSlots = {
  leftBall: Slot | null;
  rightBalls: Slot[];
};

const BALL_DIAMETER = BALL_RADIUS * 2;

export function useHeaderSlots(
  routeName: string,
  hasBack: boolean,
  _title: string,
): RouteSlots {
  const c = useAppTheme();
  const navigation = useNavigation();
  const requestPresetsAdd = useUIStore((s) => s.requestPresetsAdd);

  return useMemo<RouteSlots>(() => {
    const backSlot: Slot = {
      id: 'back',
      render: () => (
        <Pressable
          onPress={() => {
            hapticLight();
            if (navigation.canGoBack()) navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          android_ripple={{ color: c.divider, borderless: true, radius: 22 }}
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
        >
          <ArrowLeft size={22} color={c.foreground} strokeWidth={2} />
        </Pressable>
      ),
    };

    const presetsAddSlot: Slot = {
      id: 'presets-add',
      render: () => (
        <Pressable
          onPress={() => {
            hapticLight();
            requestPresetsAdd();
          }}
          accessibilityRole="button"
          accessibilityLabel="Thêm preset mới"
          android_ripple={{ color: c.divider, borderless: true, radius: 22 }}
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
        >
          <Plus size={22} color={c.foreground} strokeWidth={2.2} />
        </Pressable>
      ),
    };

    const rightBalls: Slot[] = [];
    if (routeName === 'presets') {
      rightBalls.push(presetsAddSlot);
    }

    return {
      leftBall: hasBack ? backSlot : null,
      rightBalls,
    };
  }, [
    hasBack,
    routeName,
    c.foreground,
    c.divider,
    navigation,
    requestPresetsAdd,
  ]);
}

const styles = StyleSheet.create({
  iconButton: {
    minWidth: BALL_DIAMETER,
    minHeight: BALL_DIAMETER,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
