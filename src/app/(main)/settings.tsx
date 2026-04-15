import { Button } from 'heroui-native';
import { LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppTextField, ChipPicker, SettingRow } from '../../components/ui';
import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  DEFAULT_SETTINGS,
  fetchCurrentUser,
  updateDisplayName,
  updateSettings,
  type UserProfile,
  type UserSettings,
} from '../../services/user.service';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../utils/error';

const DARK_MODE_OPTIONS = [
  { key: 'system' as const, label: 'Theo H\u0110H' },
  { key: 'light' as const, label: 'S\u00e1ng' },
  { key: 'dark' as const, label: 'T\u1ed1i' },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuthStore();
  const c = useAppTheme();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const p = await fetchCurrentUser();
    if (p) {
      setProfile(p);
      setNewName(p.display_name);
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      await updateDisplayName(newName);
      setProfile((prev) => prev ? { ...prev, display_name: newName.trim() } : prev);
      setIsEditingName(false);
    } catch (e: any) {
      Alert.alert('L\u1ed7i', getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSetting = async (key: keyof UserSettings, value: any) => {
    if (!profile) return;
    const newSettings: UserSettings = { ...profile.settings, [key]: value };
    try {
      await updateSettings(newSettings);
      setProfile((prev) => prev ? { ...prev, settings: newSettings } : prev);
    } catch (e: any) {
      Alert.alert('L\u1ed7i', getErrorMessage(e));
    }
  };

  const settings = profile?.settings || DEFAULT_SETTINGS;

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>

      {/* \u2500\u2500 H\u1ed3 s\u01a1 \u2500\u2500 */}
      <Text style={[styles.sectionTitle, { color: c.muted }]}>H\u1ed2 S\u01a0</Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
        {/* Avatar placeholder */}
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: c.primary }]}>
            <Text style={styles.avatarText}>
              {(profile?.display_name ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            {isEditingName ? (
              <View style={styles.editNameRow}>
                <View style={styles.nameInputWrapper}>
                  <AppTextField
                    value={newName}
                    onChangeText={setNewName}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                </View>
                <Button variant="primary" size="sm" onPress={handleSaveName} isDisabled={isSaving}>
                  <Button.Label>{isSaving ? '...' : 'L\u01b0u'}</Button.Label>
                </Button>
                <Button variant="outline" size="sm" onPress={() => {
                  setIsEditingName(false);
                  setNewName(profile?.display_name || '');
                }}>
                  <Button.Label>H\u1ee7y</Button.Label>
                </Button>
              </View>
            ) : (
              <>
                <Text style={[styles.displayName, { color: c.foreground }]}>
                  {profile?.display_name || '\u0110ang t\u1ea3i...'}
                </Text>
                <Pressable
                  onPress={() => setIsEditingName(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Đổi tên hiển thị"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.editLink, { color: c.primary }]}>\u0110\u1ed5i t\u00ean hi\u1ec3n th\u1ecb</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: c.divider }]} />

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: c.muted }]}>Email</Text>
          <Text style={[styles.infoValue, { color: c.foreground }]}>{user?.email}</Text>
        </View>
      </View>

      {/* \u2500\u2500 Th\u00f4ng b\u00e1o \u2500\u2500 */}
      <Text style={[styles.sectionTitle, { color: c.muted }]}>TH\u00d4NG B\u00c1O</Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
        <SettingRow
          label="Kho\u1ea3n chi m\u1edbi"
          hint="Nh\u1eadn th\u00f4ng b\u00e1o khi c\u00f3 kho\u1ea3n chi m\u1edbi"
          value={settings.notify_expense}
          onValueChange={(v) => handleToggleSetting('notify_expense', v)}
        />

        <View style={[styles.divider, { backgroundColor: c.divider }]} />

        <SettingRow
          label="Nh\u1eafc thanh to\u00e1n"
          hint="Nh\u1eafc nh\u1edf khi b\u1ea1n c\u00f2n n\u1ee3 ch\u01b0a tr\u1ea3"
          value={settings.notify_reminder}
          onValueChange={(v) => handleToggleSetting('notify_reminder', v)}
        />
      </View>

      {/* \u2500\u2500 Giao di\u1ec7n \u2500\u2500 */}
      <Text style={[styles.sectionTitle, { color: c.muted }]}>GIAO DI\u1ec6N</Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
        <View style={styles.themeRow}>
          <Text style={[styles.themeLabel, { color: c.foreground }]}>Ch\u1ebf \u0111\u1ed9 t\u1ed1i</Text>
          <ChipPicker
            options={DARK_MODE_OPTIONS}
            selected={settings.dark_mode}
            onSelect={(mode) => handleToggleSetting('dark_mode', mode)}
          />
        </View>
      </View>

      {/* \u2500\u2500 Th\u00f4ng tin \u2500\u2500 */}
      <Text style={[styles.sectionTitle, { color: c.muted }]}>TH\u00d4NG TIN</Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: c.muted }]}>Phi\u00ean b\u1ea3n</Text>
          <Text style={[styles.infoValue, { color: c.foreground }]}>1.0.0</Text>
        </View>
      </View>

      {/* \u2500\u2500 \u0110\u0103ng xu\u1ea5t \u2500\u2500 */}
      <View style={styles.logoutSection}>
        <Button variant="danger" size="md" onPress={signOut}>
          <Button.StartContent><LogOut size={18} color="#FFFFFF" /></Button.StartContent>
          <Button.Label>\u0110\u0103ng xu\u1ea5t</Button.Label>
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, letterSpacing: 0.5, marginTop: 20, marginBottom: 8, paddingLeft: 4 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 4,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  profileInfo: { flex: 1 },
  displayName: { fontSize: 18, fontWeight: '600', fontFamily: fonts.semibold },
  editLink: { fontSize: 13, marginTop: 2 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInputWrapper: { flex: 1 },
  divider: { height: 1, marginVertical: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  themeLabel: { fontSize: 15, fontWeight: '500' },
  logoutSection: { marginTop: 28, paddingHorizontal: 4 },
});
