import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { fontSize: 20, height: 28, dot: 3, gap: 3 },
  md: { fontSize: 28, height: 38, dot: 4, gap: 4 },
  lg: { fontSize: 40, height: 54, dot: 6, gap: 6 },
};

// "Fair · Pay" wordmark — "Fair" plum, dot gradient hồng, "Pay" pink strong.
// Chữ pay có baseline nhỉnh lên 1px + chấm tròn giữa như "fair-pay" brand mark.
export function Wordmark({ size = 'md' }: WordmarkProps) {
  const c = useAppTheme();
  const s = SIZES[size];

  // Heuristic width: chữ "Fair" ~4 chữ, "Pay" ~3 chữ, mỗi chữ rộng ~fontSize * 0.58
  const fairWidth = s.fontSize * 4 * 0.58;
  const payWidth = s.fontSize * 3 * 0.58;
  const dotX = fairWidth + s.gap + s.dot;
  const payX = dotX + s.dot + s.gap;
  const totalWidth = payX + payWidth;

  return (
    <View accessibilityRole="image" accessibilityLabel="Fair Pay">
      <Svg width={totalWidth} height={s.height} viewBox={`0 0 ${totalWidth} ${s.height}`}>
        <Defs>
          <LinearGradient id="dotGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={c.primaryStrong} />
            <Stop offset="100%" stopColor={c.warmAccent} />
          </LinearGradient>
        </Defs>
        <SvgText
          x={0}
          y={s.fontSize * 0.85}
          fontSize={s.fontSize}
          fontFamily={fonts.bold}
          fontWeight="700"
          fill={c.foreground}
          letterSpacing={-s.fontSize * 0.02}
        >
          Fair
        </SvgText>
        <Circle
          cx={dotX}
          cy={s.fontSize * 0.55}
          r={s.dot}
          fill="url(#dotGrad)"
        />
        <SvgText
          x={payX}
          y={s.fontSize * 0.85}
          fontSize={s.fontSize}
          fontFamily={fonts.bold}
          fontWeight="700"
          fill={c.primaryStrong}
          letterSpacing={-s.fontSize * 0.02}
        >
          Pay
        </SvgText>
      </Svg>
    </View>
  );
}
