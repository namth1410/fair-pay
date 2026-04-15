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

// Deterministic hue per category — soft pink family với 1-2 accent color
const HUE_MAP: Record<string, string> = {
  travel: '#F9A8D4',       // pink primary
  meal: '#FDA4AF',         // rose warm
  event: '#E8879A',        // rose deeper
  food: '#FDA4AF',
  transport: '#F0ABFC',    // light plum
  accommodation: '#F9A8D4',
  fun: '#E8879A',
  shopping: '#FBCFE8',     // pink-200
  other: '#D8B4D8',        // muted plum-pink
};

export function CategoryIcon({ kind, value, size = 44, style }: CategoryIconProps) {
  const c = useAppTheme();
  const Icon =
    kind === 'trip'
      ? TRIP_ICONS[value as TripType] ?? MoreHorizontal
      : EXPENSE_ICONS[value as ExpenseCategory] ?? MoreHorizontal;
  const bg = HUE_MAP[value] ?? c.primarySoft;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg + '33', // 20% opacity tint
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
