import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { fonts } from '../../config/fonts';

interface AvatarProps {
  seed: string;
  label?: string; // initials; nếu vắng tự lấy 1-2 ký tự đầu seed
  size?: number;
  style?: ViewStyle;
}

// FNV-1a 32-bit hash — đủ tốt cho màu, 0 collision issue ở app scale
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Map hash sang 2 pink tones kề nhau trên color wheel (hue 320-355) với lightness
// và chroma dịu. Hai stop khác hue ~15° để tạo gradient mềm.
function pickGradient(seed: string): { from: string; to: string; text: string } {
  const h = hashSeed(seed);
  const baseHue = 320 + (h % 36);         // 320-355°
  const nextHue = baseHue + 12;            // kề bên
  const lightness1 = 78 + ((h >> 8) % 8);  // 78-85%
  const lightness2 = 68 + ((h >> 16) % 8); // 68-75%

  return {
    from: `hsl(${baseHue}, 85%, ${lightness1}%)`,
    to: `hsl(${nextHue}, 82%, ${lightness2}%)`,
    text: `hsl(${baseHue}, 55%, 25%)`, // plum chữ tối trên bg hồng nhạt
  };
}

function getInitials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function Avatar({ seed, label, size = 40, style }: AvatarProps) {
  const grad = pickGradient(seed);
  const initials = getInitials(label ?? seed);
  const gradId = `av-grad-${hashSeed(seed).toString(36)}`;

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityRole="image"
      accessibilityLabel={`Avatar ${label ?? seed}`}
    >
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
