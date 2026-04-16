import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';

type Variant = 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'meta' | 'label';
type Tone = 'default' | 'muted' | 'primary' | 'success' | 'danger' | 'warning' | 'inverse';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: Weight;
  center?: boolean;
}

const VARIANT_STYLES: Record<Variant, TextStyle> = {
  display:  { fontSize: 32, lineHeight: 38, letterSpacing: -0.4 },
  title:    { fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  subtitle: { fontSize: 16, lineHeight: 22 },
  body:     { fontSize: 14, lineHeight: 20 },
  caption:  { fontSize: 13, lineHeight: 18 },
  meta:     { fontSize: 12, lineHeight: 16 },
  label:    { fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
};

const DEFAULT_WEIGHT: Record<Variant, Weight> = {
  display: 'bold',
  title: 'semibold',
  subtitle: 'medium',
  body: 'regular',
  caption: 'regular',
  meta: 'regular',
  label: 'semibold',
};

export function AppText({
  variant = 'body',
  tone = 'default',
  weight,
  center,
  style,
  ...rest
}: AppTextProps) {
  const c = useAppTheme();
  const resolvedWeight = weight ?? DEFAULT_WEIGHT[variant];

  const toneColor: Record<Tone, string> = {
    default: c.foreground,
    muted: c.muted,
    primary: c.primaryStrong,
    success: c.success,
    danger: c.danger,
    warning: c.warning,
    inverse: c.inverseForeground,
  };

  return (
    <Text
      {...rest}
      style={[
        VARIANT_STYLES[variant],
        {
          fontFamily: fonts[resolvedWeight],
          color: toneColor[tone],
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    />
  );
}

// Kept export to satisfy RN StyleSheet linting (none used); exported for tree-shake.
export const _appTextStyles = StyleSheet.create({});
