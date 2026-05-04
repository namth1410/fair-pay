import {
  Bus,
  Coffee,
  Gamepad2,
  HomeIcon,
  type LucideIcon,
  MoreHorizontal,
  PartyPopper,
  Plane,
  ShoppingBag,
  Utensils,
} from 'lucide-react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

export type TripType = 'travel' | 'meal' | 'event' | 'other';
export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'fun'
  | 'shopping'
  | 'other';

const TRIP_ICONS: Record<TripType, LucideIcon> = {
  travel: Plane,
  meal: Utensils,
  event: PartyPopper,
  other: MoreHorizontal,
};

const EXPENSE_ICONS: Record<ExpenseCategory, LucideIcon> = {
  food: Coffee,
  transport: Bus,
  accommodation: HomeIcon,
  fun: Gamepad2,
  shopping: ShoppingBag,
  other: MoreHorizontal,
};

interface CategoryIconProps {
  kind: 'trip' | 'expense';
  value: string;
  size?: number;
  style?: ViewStyle;
}

export function CategoryIcon({ kind, value, size = 44, style }: CategoryIconProps) {
  const c = useAppTheme();
  const Icon =
    kind === 'trip'
      ? TRIP_ICONS[value as TripType] ?? MoreHorizontal
      : EXPENSE_ICONS[value as ExpenseCategory] ?? MoreHorizontal;

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
