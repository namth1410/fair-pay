import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useAppTheme } from '../../hooks/useAppTheme';

const LOGO_SIZE = 110;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
<circle fill="#EC4899" cy="50" cx="50" r="45"/>
<circle fill="none" stroke="#ffffff" stroke-width="8.55" cx="50" cy="50" r="21.825"/>
<g id="friend"><circle fill="#EC4899" cx="19.4" cy="50" r="8.4376"/>
<path stroke="#EC4899" stroke-width="3.2378" d="M67,50H77"/>
<circle fill="#ffffff" cx="19.4" cy="50" r="6.00745"/></g>
<use xlink:href="#friend" transform="rotate(120,50,50)"/>
<use xlink:href="#friend" transform="rotate(240,50,50)"/></svg>`;

interface Props {
  onComplete: () => void;
}

export function SplashScene({ onComplete }: Props) {
  const { isDark } = useAppTheme();
  const bg = isDark ? '#1A1A1F' : '#F7F7F7';

  useEffect(() => {
    const t = setTimeout(onComplete, 600);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: bg }]}>
      <SvgXml xml={LOGO_SVG} width={LOGO_SIZE} height={LOGO_SIZE} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
