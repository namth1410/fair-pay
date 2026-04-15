import { useEffect } from 'react';
import { StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from './AppText';

type Variant = 'hero' | 'display' | 'default' | 'compact';
type Tone = 'default' | 'primary' | 'success' | 'danger' | 'muted';

interface MoneyProps {
  value: number;
  variant?: Variant;
  tone?: Tone;
  animate?: boolean;
  showUnit?: boolean;
  showSign?: boolean;
  style?: ViewStyle;
}

const VARIANT: Record<
  Variant,
  { amount: number; unit: number; bold: boolean; lineHeight: number }
> = {
  hero:    { amount: 36, unit: 18, bold: true,  lineHeight: 42 },
  display: { amount: 26, unit: 14, bold: true,  lineHeight: 32 },
  default: { amount: 16, unit: 12, bold: true,  lineHeight: 22 },
  compact: { amount: 14, unit: 11, bold: true,  lineHeight: 18 },
};

// Animated TextInput — set `text` via animatedProps without re-renders. Readonly editable=false
// biến nó thành text display thuần.
const AnimatedText = Animated.createAnimatedComponent(TextInput);

// Worklet-safe number formatter for Vietnamese locale (1234567 → "1.234.567").
// Must avoid Number.prototype.toLocaleString — not available in Reanimated UI
// thread. The 'worklet' directive lets the same function run on both threads.
function formatAmount(n: number): string {
  'worklet';
  const rounded = Math.round(Math.abs(n));
  const s = String(rounded);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.';
    out += s[i];
  }
  return out;
}

export function Money({
  value,
  variant = 'default',
  tone = 'default',
  animate = false,
  showUnit = true,
  showSign = false,
  style,
}: MoneyProps) {
  const c = useAppTheme();
  const v = VARIANT[variant];

  const toneColor: Record<Tone, string> = {
    default: c.foreground,
    primary: c.primaryStrong,
    success: c.success,
    danger: c.danger,
    muted: c.muted,
  };

  const getSign = () => {
    if (showSign) return value >= 0 ? '+' : '-';
    return value < 0 ? '-' : '';
  };
  const sign = getSign();
  const color = toneColor[tone];

  const shared = useSharedValue(value);

  useEffect(() => {
    if (animate) {
      shared.value = withTiming(value, { duration: 450 });
    } else {
      shared.value = value;
    }
  }, [value, animate]);

  const animatedProps = useAnimatedProps(() => {
    const display = `${sign}${formatAmount(shared.value)}`;
    return { text: display, defaultValue: display } as unknown as Record<string, unknown>;
  });

  return (
    <View
      style={[styles.row, style]}
      accessibilityRole="text"
      accessibilityLabel={`${sign}${formatAmount(value)} đồng`}
    >
      {animate ? (
        <AnimatedText
          editable={false}
          animatedProps={animatedProps}
          underlineColorAndroid="transparent"
          selectTextOnFocus={false}
          style={[
            styles.amountText,
            {
              fontFamily: fonts.bold,
              color,
              fontSize: v.amount,
              lineHeight: v.lineHeight,
              fontVariant: ['tabular-nums'],
            },
          ]}
        />
      ) : (
        <AppText
          weight="bold"
          style={{
            color,
            fontSize: v.amount,
            lineHeight: v.lineHeight,
            fontVariant: ['tabular-nums'],
          }}
        >
          {sign}
          {formatAmount(value)}
        </AppText>
      )}
      {showUnit && (
        <AppText
          weight="semibold"
          style={{
            color,
            fontSize: v.unit,
            lineHeight: v.lineHeight,
            marginLeft: 2,
            opacity: 0.8,
          }}
        >
          ₫
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amountText: {
    padding: 0,
    margin: 0,
    includeFontPadding: false,
  },
});
