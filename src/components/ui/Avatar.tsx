import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { fonts } from '../../config/fonts';
import { getInitials, hashSeed, pickGradient } from '../../utils/seedGradient';

interface AvatarProps {
  seed: string;
  label?: string; // initials; nếu vắng tự lấy 1-2 ký tự đầu seed
  photoUrl?: string | null; // nếu có sẽ hiển thị ảnh, fail thì fallback về initials
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ seed, label, photoUrl, size = 40, style }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const grad = pickGradient(seed);
  const initials = getInitials(label ?? seed);
  const gradId = `av-grad-${hashSeed(seed).toString(36)}`;
  const showImage = !!photoUrl && !imgFailed;

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityRole="image"
      accessibilityLabel={`Avatar ${label ?? seed}`}
    >
      {showImage ? (
        <Image
          source={{ uri: photoUrl! }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={grad.from} />
                <Stop offset="100%" stopColor={grad.to} />
              </LinearGradient>
            </Defs>
            <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradId})`} />
          </Svg>
          <View style={[styles.labelLayer, { width: size, height: size }]} pointerEvents="none">
            <Text
              style={{
                color: grad.text,
                fontFamily: fonts.bold,
                fontSize: size * 0.4,
                lineHeight: size,
                includeFontPadding: false,
              }}
            >
              {initials}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labelLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
