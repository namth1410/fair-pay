import { View, ActivityIndicator, useColorScheme } from 'react-native';
import { colors } from '../../config/theme';

export function LoadingScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const bg = isDark ? colors.dark.background : colors.light.background;
  const fg = isDark ? colors.dark.primary : colors.light.primary;

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: bg,
      }}
    >
      <ActivityIndicator size="large" color={fg} />
    </View>
  );
}
