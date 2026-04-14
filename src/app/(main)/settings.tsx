import { View, Text, useColorScheme, StyleSheet } from 'react-native';
import { Button } from 'heroui-native';
import { useAuthStore } from '../../stores/auth.store';
import { colors } from '../../config/theme';

export default function SettingsScreen() {
  const { user, signOut } = useAuthStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? colors.dark : colors.light;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.profileCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
        <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          Email
        </Text>
        <Text style={[styles.value, { color: c.foreground }]}>
          {user?.email}
        </Text>
      </View>

      <View style={styles.spacer} />

      <View style={styles.actions}>
        <Button variant="danger" size="md" onPress={signOut}>
          <Button.Label>Đăng xuất</Button.Label>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  profileCard: {
    padding: 16,
    borderRadius: 12,
  },
  label: { fontSize: 13, marginBottom: 4 },
  value: { fontSize: 16, fontWeight: '500' },
  spacer: { flex: 1 },
  actions: { paddingBottom: 24 },
});
