import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme, useIsDark } from '../../hooks/useAppTheme';
import { transitionToTheme } from '../../utils/themeTransition';
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
import {
  AppText,
  AppTextField,
  Avatar,
  SettingRow,
} from '../ui';

interface SettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsSheet({ isOpen, onOpenChange }: SettingsSheetProps) {
  const { user, signOut } = useAuthStore();
  const c = useAppTheme();
  const isDark = useIsDark();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load on sheet open. Profile rarely changes, so no need to poll.
  useEffect(() => {
    if (!isOpen) return;
    void loadProfile();
  }, [isOpen]);

  const loadProfile = async () => {
    try {
      const p = await fetchCurrentUser();
      if (p) {
        setProfile(p);
        setNewName(p.display_name);
      } else if (__DEV__) {
        console.warn('[SettingsSheet] fetchCurrentUser returned null');
      }
    } catch (err) {
      if (__DEV__) console.warn('[SettingsSheet] Profile load failed:', err);
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      await updateDisplayName(newName);
      setProfile((prev) => (prev ? { ...prev, display_name: newName.trim() } : prev));
      setIsEditingName(false);
    } catch (e: any) {
      Alert.alert('Lỗi', getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSetting = async (key: keyof UserSettings, value: any) => {
    // Dark mode is purely runtime UI state — apply immediately, regardless
    // of whether the profile has loaded. This guarantees the switch responds
    // even if fetchCurrentUser failed (RLS, offline, session expired, etc.).
    // Goes through transitionToTheme for the crossfade animation.
    if (key === 'dark_mode') {
      transitionToTheme(value);
    }

    // Without a loaded profile we can't safely construct the full settings
    // object to persist (would clobber other fields). Apply locally only.
    if (!profile) {
      if (key !== 'dark_mode') {
        Alert.alert('Chưa sẵn sàng', 'Hồ sơ chưa tải xong, vui lòng thử lại.');
      }
      return;
    }

    const prevSettings = profile.settings;
    const newSettings: UserSettings = { ...prevSettings, [key]: value };

    try {
      await updateSettings(newSettings);
      setProfile((prev) => (prev ? { ...prev, settings: newSettings } : prev));
    } catch (e: any) {
      if (key === 'dark_mode') {
        transitionToTheme(prevSettings.dark_mode);
      }
      Alert.alert('Lỗi', getErrorMessage(e));
    }
  };

  const handleSignOut = async () => {
    onOpenChange(false);
    await signOut();
  };

  const settings = profile?.settings || DEFAULT_SETTINGS;
  const avatarSeed = profile?.display_name || user?.email || 'user';

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content snapPoints={['90%']}>
          <BottomSheetScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Hồ sơ ── */}
            <AppText variant="label" tone="muted" style={styles.firstSectionTitle}>
              HỒ SƠ
            </AppText>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
              <View style={styles.profileRow}>
                <Avatar seed={avatarSeed} label={profile?.display_name} size={56} />
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
                      <Button
                        variant="primary"
                        size="sm"
                        onPress={handleSaveName}
                        isDisabled={isSaving}
                      >
                        <Button.Label>{isSaving ? '...' : 'Lưu'}</Button.Label>
                      </Button>
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
                    </View>
                  ) : (
                    <>
                      <AppText variant="subtitle" weight="semibold">
                        {profile?.display_name || 'Đang tải...'}
                      </AppText>
                      <Pressable
                        onPress={() => setIsEditingName(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Đổi tên hiển thị"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <AppText
                          variant="caption"
                          weight="medium"
                          tone="primary"
                          style={styles.editLink}
                        >
                          Đổi tên hiển thị
                        </AppText>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: c.divider }]} />

              <View style={styles.infoRow}>
                <AppText variant="body" tone="muted">
                  Email
                </AppText>
                <AppText variant="body" weight="medium">
                  {user?.email}
                </AppText>
              </View>
            </View>

            {/* ── Thông báo ── */}
            <AppText variant="label" tone="muted" style={styles.sectionTitle}>
              THÔNG BÁO
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
            </View>

            {/* ── Giao diện ── */}
            <AppText variant="label" tone="muted" style={styles.sectionTitle}>
              GIAO DIỆN
            </AppText>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
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
                <LogOut size={18} color="#FFFFFF" />
                <Button.Label>Đăng xuất</Button.Label>
              </Button>
            </View>
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
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
  profileInfo: { flex: 1 },
  editLink: { marginTop: 2 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInputWrapper: { flex: 1 },
  divider: { height: 1, marginVertical: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoutSection: { marginTop: 28, paddingHorizontal: 4 },
});
