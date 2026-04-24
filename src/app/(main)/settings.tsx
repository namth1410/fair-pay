import { router } from 'expo-router';
import { Button, useToast } from 'heroui-native';
import { ChevronRight, Pencil } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  AppTextField,
  Avatar,
  SettingRow,
} from '../../components/ui';
import { DISPLAY_NAME_MAX_LENGTH } from '../../config/constants';
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
import { hapticLight } from '../../utils/haptics';
import { transitionToTheme } from '../../utils/themeTransition';

export default function SettingsScreen() {
  const { user, signOut } = useAuthStore();
  const { isDark, ...c } = useAppTheme();
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const p = await fetchCurrentUser();
      if (p) {
        setProfile(p);
        setNewName(p.display_name);
      } else if (__DEV__) {
        console.warn('[SettingsScreen] fetchCurrentUser returned null');
      }
    } catch (err) {
      if (__DEV__) console.warn('[SettingsScreen] Profile load failed:', err);
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      await updateDisplayName(newName);
      setProfile((prev) => (prev ? { ...prev, display_name: newName.trim() } : prev));
      setIsEditingName(false);
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSetting = async (key: keyof UserSettings, value: UserSettings[keyof UserSettings]) => {
    hapticLight();
    if (key === 'dark_mode') {
      transitionToTheme(value as UserSettings['dark_mode']);
    }

    if (!profile) {
      if (key !== 'dark_mode') {
        toast.show({ variant: 'warning', label: 'Chưa sẵn sàng', description: 'Hồ sơ chưa tải xong, vui lòng thử lại.' });
      }
      return;
    }

    const prevSettings = profile.settings;
    const newSettings: UserSettings = { ...prevSettings, [key]: value };

    try {
      await updateSettings(newSettings);
      setProfile((prev) => (prev ? { ...prev, settings: newSettings } : prev));
    } catch (e: unknown) {
      if (key === 'dark_mode') {
        transitionToTheme(prevSettings.dark_mode);
      }
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    }
  };

  const handleSignOut = async () => {
    router.back();
    await signOut();
  };

  const settings = profile?.settings || DEFAULT_SETTINGS;
  const avatarSeed = profile?.display_name || user?.email || 'user';

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hồ sơ ── */}
        <AppText variant="label" tone="muted" style={styles.firstSectionTitle}>
          HỒ SƠ
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
          <View style={styles.profileRow}>
            <Avatar
              seed={avatarSeed}
              label={profile?.display_name}
              photoUrl={profile?.photo_url}
              size={56}
            />
            <View style={styles.profileInfo}>
              <AppText
                variant="subtitle"
                weight="semibold"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {profile?.display_name || 'Đang tải...'}
              </AppText>
              <AppText
                variant="caption"
                tone="muted"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.profileEmail}
              >
                {user?.email}
              </AppText>
            </View>
            {!isEditingName && (
              <Pressable
                onPress={() => setIsEditingName(true)}
                accessibilityRole="button"
                accessibilityLabel="Đổi tên hiển thị"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.editIconBtn,
                  { borderColor: c.divider, backgroundColor: c.background },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Pencil size={16} color={c.foreground} />
              </Pressable>
            )}
          </View>

          {isEditingName && (
            <View style={styles.editBlock}>
              <AppTextField
                value={newName}
                onChangeText={(t) => setNewName(t.slice(0, DISPLAY_NAME_MAX_LENGTH))}
                autoFocus
                returnKeyType="done"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                onSubmitEditing={handleSaveName}
                placeholder="Tên hiển thị"
              />
              <AppText variant="meta" tone="muted" style={styles.counter}>
                {newName.trim().length}/{DISPLAY_NAME_MAX_LENGTH}
              </AppText>
              <View style={styles.editActions}>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setIsEditingName(false);
                    setNewName(profile?.display_name || '');
                  }}
                >
                  <Button.Label>Hủy</Button.Label>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onPress={handleSaveName}
                  isDisabled={isSaving || !newName.trim() || newName.trim() === profile?.display_name}
                >
                  <Button.Label>{isSaving ? 'Đang lưu...' : 'Lưu'}</Button.Label>
                </Button>
              </View>
            </View>
          )}
        </View>

        {/* ── Tùy chỉnh ── */}
        <AppText variant="label" tone="muted" style={styles.sectionTitle}>
          TÙY CHỈNH
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
          <SettingRow
            label="Khoản chi mới"
            hint="Nhận thông báo khi có khoản chi mới"
            value={settings.notify_expense}
            onValueChange={(v) => handleToggleSetting('notify_expense', v)}
          />

          <View style={[styles.divider, { backgroundColor: c.divider }]} />

          <SettingRow
            label="Nhắc thanh toán"
            hint="Nhắc nhở khi bạn còn nợ chưa trả"
            value={settings.notify_reminder}
            onValueChange={(v) => handleToggleSetting('notify_reminder', v)}
          />

          <View style={[styles.divider, { backgroundColor: c.divider }]} />

          <Pressable
            style={styles.navRow}
            onPress={() => router.push('/presets')}
            accessibilityRole="button"
            accessibilityLabel="Quản lý preset khoản chi"
          >
            <View style={styles.navInfo}>
              <AppText variant="body" weight="medium">Preset khoản chi</AppText>
              <AppText variant="meta" tone="muted" style={styles.navHint}>
                Lưu khoản chi hay dùng để nhập nhanh
              </AppText>
            </View>
            <ChevronRight size={20} color={c.muted} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: c.divider }]} />

          <SettingRow
            label="Chế độ tối"
            hint="Hiển thị giao diện nền tối"
            value={isDark}
            onValueChange={(on) => handleToggleSetting('dark_mode', on ? 'dark' : 'light')}
          />
        </View>

        {/* ── Đăng xuất ── */}
        <View style={styles.logoutSection}>
          <Button variant="danger" size="md" onPress={handleSignOut}>
            <Button.Label>Đăng xuất</Button.Label>
          </Button>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  firstSectionTitle: {
    marginTop: 4,
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 8,
    paddingLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 4,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileInfo: { flex: 1, minWidth: 0 },
  profileEmail: { marginTop: 2 },
  editIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBlock: { marginTop: 16, gap: 8 },
  counter: { textAlign: 'right' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  divider: { height: 1, marginVertical: 14 },
  logoutSection: { marginTop: 28, paddingHorizontal: 4 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  navInfo: { flex: 1, marginRight: 12 },
  navHint: { marginTop: 2 },
});
