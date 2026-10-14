import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getInitials, pickPastel } from '../../utils/seedGradient';

interface AvatarProps {
  seed: string;
  label?: string; // initials; nếu vắng tự lấy 1-2 ký tự đầu seed
  photoUrl?: string | null; // nếu có sẽ hiển thị ảnh, fail thì fallback về initials
  size?: number;
  style?: ViewStyle;
}

// Avatar tròn: ảnh nếu có, không thì initials trên nền pastel theo seed (giao diện "Hội thoại").
export function Avatar({ seed, label, photoUrl, size = 40, style }: AvatarProps) {
  const { isDark } = useAppTheme();
  const [imgFailed, setImgFailed] = useState(false);
  const pastel = pickPastel(seed, isDark);
  const initials = getInitials(label ?? seed);
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
        <View
          style={[
            styles.circle,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: pastel.bg },
          ]}
        >
          <Text
            style={{
              color: pastel.fg,
              fontFamily: fonts.extrabold,
              fontSize: size * 0.38,
              lineHeight: size,
              includeFontPadding: false,
            }}
          >
            {initials}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
