import { useColorScheme } from 'react-native';
import { colors } from '../config/theme';

export function useAppTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return isDark ? colors.dark : colors.light;
}
