import { View, Text, useColorScheme, StyleSheet } from 'react-native';
import { colors } from '../../config/theme';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.text, { color: c.foreground, opacity: 0.4 }]}>
        Cài đặt sẽ có ở đây (Phase 4)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
  },
});
