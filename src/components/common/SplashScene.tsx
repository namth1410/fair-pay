import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

const LOGO_SIZE = 160;

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
      <Image
        source={require('../../../assets/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
