import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { gradientFromString } from '../../utils/gradientFromString';
import { AppText } from '../ui';

interface Props {
  imageUrl: string | null;
  titleForFallback: string;
  side: 'left' | 'right';
}

const SIZE = 88;
const RADIUS = 18;

function getInitial(title: string): string {
  const first = (title ?? '').trim().charAt(0);
  if (!first) return '?';
  return /\p{L}/u.test(first) ? first.toUpperCase() : '?';
}

function ExpenseImageThumbInner({ imageUrl, titleForFallback, side }: Props) {
  const { isDark } = useAppTheme();
  // 3D perspective tilt: side='left' → cạnh phải lùi sâu (rotateY +).
  //                     side='right' → cạnh trái lùi sâu (rotateY -).
  const rotateY = side === 'left' ? '18deg' : '-18deg';

  return (
    <View
      style={[
        styles.wrap,
        { transform: [{ perspective: 800 }, { rotateY }] },
      ]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={gradientFromString(titleForFallback, isDark)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fallback}
        >
          <AppText weight="bold" style={styles.fallbackInitial} accessible={false}>
            {getInitial(titleForFallback)}
          </AppText>
        </LinearGradient>
      )}
    </View>
  );
}

export const ExpenseImageThumb = memo(
  ExpenseImageThumbInner,
  (prev, next) =>
    prev.imageUrl === next.imageUrl &&
    prev.titleForFallback === next.titleForFallback &&
    prev.side === next.side,
);

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
    backgroundColor: 'transparent',
  },
  image: {
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
  },
  fallback: {
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackInitial: {
    fontSize: 36,
    lineHeight: 40,
    color: 'rgba(255,255,255,0.85)',
  },
});
