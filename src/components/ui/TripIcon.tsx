import {
  type LucideIcon,
  MoreHorizontal,
  PartyPopper,
  Plane,
  Utensils,
} from 'lucide-react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

export type TripType = 'travel' | 'meal' | 'event' | 'other';

const TRIP_ICONS: Record<TripType, LucideIcon> = {
  travel: Plane,
  meal: Utensils,
  event: PartyPopper,
  other: MoreHorizontal,
};

interface TripIconProps {
  value: TripType;
  size?: number;
  style?: ViewStyle;
}

export function TripIcon({ value, size = 44, style }: TripIconProps) {
  const c = useAppTheme();
  const Icon = TRIP_ICONS[value] ?? MoreHorizontal;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.primarySoft,
        },
        style,
      ]}
    >
      <Icon size={size * 0.5} color={c.foreground} strokeWidth={1.75} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
