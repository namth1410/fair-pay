import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useAppTheme } from '../../hooks/useAppTheme';

// Soft pink blobs ở top-right + bottom-left — tạo chiều sâu cho auth screens.
// Radial gradient fade-out, không gây phân tán.
export function BrandDecoration() {
  const c = useAppTheme();

  return (
    <View style={styles.wrap} pointerEvents="none">
      {/* Top-right blob */}
      <View style={styles.topRight}>
        <Svg width={320} height={320} viewBox="0 0 320 320">
          <Defs>
            <RadialGradient id="tr" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={c.primarySoft} stopOpacity={0.7} />
              <Stop offset="60%" stopColor={c.primarySoft} stopOpacity={0.2} />
              <Stop offset="100%" stopColor={c.primarySoft} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={160} cy={160} r={160} fill="url(#tr)" />
        </Svg>
      </View>

      {/* Bottom-left blob */}
      <View style={styles.bottomLeft}>
        <Svg width={380} height={380} viewBox="0 0 380 380">
          <Defs>
            <RadialGradient id="bl" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={c.warmAccent} stopOpacity={0.5} />
              <Stop offset="60%" stopColor={c.warmAccent} stopOpacity={0.15} />
              <Stop offset="100%" stopColor={c.warmAccent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={190} cy={190} r={190} fill="url(#bl)" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  topRight: {
    position: 'absolute',
    top: -140,
    right: -120,
  },
  bottomLeft: {
    position: 'absolute',
    bottom: -180,
    left: -160,
  },
});
