import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui';
import { CAPSULE_HEIGHT, CAPSULE_MARGIN_H } from './headerConstants';
import { useHeaderSlots } from './headerSlots';

function resolveTitle(props: NativeStackHeaderProps): string {
  const { options, route } = props;
  if (typeof options.headerTitle === 'string') return options.headerTitle;
  if (typeof options.title === 'string') return options.title;
  return route.name;
}

export function GlassCapsuleHeader(props: NativeStackHeaderProps) {
  const { route, back } = props;
  const c = useAppTheme();
  const insets = useSafeAreaInsets();

  const title = resolveTitle(props);
  const hasBack = Boolean(back);
  const slots = useHeaderSlots(route.name, hasBack, title);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          backgroundColor: c.background,
          borderBottomColor: c.divider,
        },
      ]}
    >
      <View style={[styles.row, { height: CAPSULE_HEIGHT }]}>
        <View style={styles.side}>
          {slots.leftBall ? slots.leftBall.render() : null}
        </View>
        <View style={styles.center}>
          <AppText
            variant="subtitle"
            weight="semibold"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </AppText>
        </View>
        <View style={[styles.side, styles.sideRight]}>
          {slots.rightBalls.map((slot) => (
            <View key={slot.id}>{slot.render()}</View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CAPSULE_MARGIN_H,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 44,
    gap: 4,
  },
  sideRight: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
