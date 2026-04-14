import { View, Text, useColorScheme, StyleSheet } from 'react-native';
import { Button } from 'heroui-native';
import { useAuthStore } from '../../stores/auth.store';
import { colors } from '../../config/theme';

export default function HomeScreen() {
  const { user, signOut } = useAuthStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.welcome, { color: c.foreground }]}>
        Xin chào!
      </Text>
      <Text style={[styles.email, { color: c.foreground, opacity: 0.6 }]}>
        {user?.email}
      </Text>

      <View style={styles.placeholder}>
        <Text style={[styles.placeholderText, { color: c.foreground, opacity: 0.4 }]}>
          Danh sách nhóm sẽ hiển thị ở đây
        </Text>
        <Text style={[styles.placeholderText, { color: c.foreground, opacity: 0.3 }]}>
          (Phase 1)
        </Text>
      </View>

      <Button variant="danger" size="md" onPress={signOut}>
        <Button.Label>Đăng xuất</Button.Label>
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  welcome: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    marginBottom: 32,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    marginBottom: 4,
  },
});
