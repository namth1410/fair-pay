import { router } from 'expo-router';
import { Button, useToast } from 'heroui-native';
import { AlertTriangle, ChevronRight, MessageCircle, Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useQueueStats } from '../../../hooks/useQueueStats';

import { FeedbackSheet } from '../../../components/common/FeedbackSheet';
import { TabHeader } from '../../../components/header/TabHeader';
import {
  AppText,
  Avatar,
  SettingRow,
} from '../../../components/ui';
import { BouncyDialog } from '../../../components/ui/BouncyDialog';
import { FloatingLabelInput } from '../../../components/ui/floating';
import { DISPLAY_NAME_MAX_LENGTH } from '../../../config/constants';
import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  registerForPushNotifications,
  unregisterPushToken,
} from '../../../services/pushNotification.service';
import {
  DEFAULT_SETTINGS,
  updateDisplayName,
  updateSettings,
  type UserSettings,
} from '../../../services/user.service';
import { PendingSyncError, useAuthStore } from '../../../stores/auth.store';
import { run as runSync } from '../../../sync/syncEngine';
import * as syncQueue from '../../../sync/syncQueue';
import { getErrorMessage } from '../../../utils/error';
import { hapticLight } from '../../../utils/haptics';
import { transitionToTheme } from '../../../utils/themeTransition';
import { persistPreferencesCache } from '../../../utils/userPreferences';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const { conflictCount } = useQueueStats();
  const signOut = useAuthStore((s) => s.signOut);
  const { isDark, ...c } = useAppTheme();
  const { toast } = useToast();

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(profile?.display_name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [blockedSignOut, setBlockedSignOut] = useState<{
    pendingCount: number;
    conflictCount: number;
  } | null>(null);

  const handleSaveName = async () => {
    if (!newName.trim() || !profile) return;
    Keyboard.dismiss();
    setIsSaving(true);
    try {
      await updateDisplayName(newName);
      setProfile({ ...profile, display_name: newName.trim() });
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

    // Optimistic — store update là single source of truth, mọi consumer (cache singleton
    // qua subscriber) đồng bộ ngay.
    setProfile({ ...profile, settings: newSettings });

    try {
      await updateSettings(newSettings);
      await persistPreferencesCache(newSettings);
      // Master push toggle → register/unregister FCM token. Fire-and-forget,
      // user-facing toggle đã update tức thì qua optimistic setProfile.
      if (key === 'push_enabled') {
        if (value === true) {
          registerForPushNotifications();
        } else {
          unregisterPushToken();
        }
      }
    } catch (e: unknown) {
      setProfile({ ...profile, settings: prevSettings });
      if (key === 'dark_mode') {
        transitionToTheme(prevSettings.dark_mode);
      }
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    }
  };

  const handleSignOut = async () => {
    // Không gọi router.back() trước signOut: pop sẽ làm màn dưới (vd: groups/[id])
    // regain focus và trigger useFocusEffect → fetchPendingJoinRequests → assertRole
    // race với signOut đang chạy → throw "Chưa đăng nhập" (unhandled).
    // AuthGate sẽ tự redirect sang /(auth)/login khi session=null.
    try {
      await signOut();
    } catch (e: unknown) {
      if (e instanceof PendingSyncError) {
        setBlockedSignOut({
          pendingCount: e.pendingCount,
          conflictCount: e.conflictCount,
        });
        return;
      }
      toast.show({
        variant: 'danger',
        label: 'Lỗi đăng xuất',
        description: getErrorMessage(e),
      });
    }
  };

  const handleViewConflicts = () => {
    setBlockedSignOut(null);
    router.push('/sync-conflicts');
  };

  const handleFlushSync = async () => {
    setBlockedSignOut(null);
    try {
      await syncQueue.retryAllFailed();
      await runSync(true);
    } catch (e: unknown) {
      toast.show({
        variant: 'warning',
        label: 'Đồng bộ thất bại',
        description: getErrorMessage(e),
      });
    }
  };

  const settings = profile?.settings || DEFAULT_SETTINGS;
  const avatarSeed = profile?.display_name || user?.email || 'user';

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <TabHeader routeName="settings" title="Cài đặt" />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
              <FloatingLabelInput
                value={newName}
                onChangeText={(t) => setNewName(t.slice(0, DISPLAY_NAME_MAX_LENGTH))}
                autoFocus
                returnKeyType="done"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                onSubmitEditing={handleSaveName}
                label="Tên hiển thị"
                surfaceColor={c.surface}
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
            label="Chế độ tối"
            hint="Hiển thị giao diện nền tối"
            value={isDark}
            onValueChange={(on) => handleToggleSetting('dark_mode', on ? 'dark' : 'light')}
          />

          <View style={[styles.divider, { backgroundColor: c.divider }]} />

          <SettingRow
            label="Hiệu ứng chuyển động"
            hint="Tắt nếu máy giật/lag hoặc bạn không thích animation"
            value={settings.animations_enabled}
            onValueChange={(v) => handleToggleSetting('animations_enabled', v)}
          />

          <View style={[styles.divider, { backgroundColor: c.divider }]} />

          <SettingRow
            label="Rung phản hồi"
            hint="Phản hồi rung khi nhấn nút và thao tác"
            value={settings.haptics_enabled}
            onValueChange={(v) => handleToggleSetting('haptics_enabled', v)}
          />
        </View>

        {/* ── Thông báo ── */}
        <AppText variant="label" tone="muted" style={styles.sectionTitle}>
          THÔNG BÁO
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
          <SettingRow
            label="Thông báo đẩy"
            hint="Nhận thông báo trên màn hình khoá kể cả khi đóng app"
            value={settings.push_enabled}
            onValueChange={(v) => handleToggleSetting('push_enabled', v)}
          />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <SettingRow
            label="Hoạt động nhóm"
            hint="Khoản chi mới, sửa/xóa, đóng chuyến đi"
            value={settings.notify_activity}
            onValueChange={(v) => handleToggleSetting('notify_activity', v)}
          />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <SettingRow
            label="Thanh toán"
            hint="Khi có người trả tiền cho bạn hoặc ghi nhận thanh toán"
            value={settings.notify_payment}
            onValueChange={(v) => handleToggleSetting('notify_payment', v)}
          />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <SettingRow
            label="Thành viên"
            hint="Yêu cầu tham gia, được duyệt, đổi vai trò"
            value={settings.notify_member}
            onValueChange={(v) => handleToggleSetting('notify_member', v)}
          />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <SettingRow
            label="Gợi ý thông minh"
            hint="Nhắc thanh toán khi nợ kéo dài"
            value={settings.notify_smart}
            onValueChange={(v) => handleToggleSetting('notify_smart', v)}
          />
        </View>

        {/* ── Đồng bộ ── */}
        {conflictCount > 0 && (
          <>
            <AppText variant="label" tone="muted" style={styles.sectionTitle}>
              ĐỒNG BỘ
            </AppText>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
              <Pressable
                onPress={() => {
                  hapticLight();
                  router.push('/sync-conflicts');
                }}
                accessibilityRole="button"
                accessibilityLabel="Xung đột đồng bộ"
                style={({ pressed }) => [
                  styles.feedbackRow,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <View style={[styles.feedbackIcon, { backgroundColor: c.dangerSoft }]}>
                  <AlertTriangle size={18} color={c.danger} />
                </View>
                <View style={styles.feedbackText}>
                  <AppText variant="body" weight="medium">
                    Xung đột đồng bộ ({conflictCount})
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    Có thay đổi offline cần bạn chọn cách giải quyết
                  </AppText>
                </View>
                <ChevronRight size={18} color={c.muted} />
              </Pressable>
            </View>
          </>
        )}

        {/* ── Phản hồi ── */}
        <AppText variant="label" tone="muted" style={styles.sectionTitle}>
          PHẢN HỒI
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
          <Pressable
            onPress={() => {
              hapticLight();
              setFeedbackOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Gửi góp ý"
            accessibilityHint="Mở form gửi góp ý cho đội phát triển"
            style={({ pressed }) => [
              styles.feedbackRow,
              pressed && { opacity: 0.6 },
            ]}
          >
            <View style={[styles.feedbackIcon, { backgroundColor: c.surfaceAlt }]}>
              <MessageCircle size={18} color={c.foreground} />
            </View>
            <View style={styles.feedbackText}>
              <AppText variant="body" weight="medium">Gửi góp ý</AppText>
              <AppText variant="caption" tone="muted">
                Chia sẻ trải nghiệm hoặc đề xuất tính năng mới
              </AppText>
            </View>
            <ChevronRight size={18} color={c.muted} />
          </Pressable>
        </View>

        {/* ── Đăng xuất ── */}
        <View style={styles.logoutSection}>
          <Button variant="danger" size="md" onPress={handleSignOut}>
            <Button.Label>Đăng xuất</Button.Label>
          </Button>
        </View>
      </ScrollView>

      <FeedbackSheet isOpen={feedbackOpen} onOpenChange={setFeedbackOpen} />

      <BouncyDialog
        isOpen={blockedSignOut !== null}
        onClose={() => setBlockedSignOut(null)}
      >
        <BouncyDialog.Title>Còn thao tác chưa đồng bộ</BouncyDialog.Title>
        <BouncyDialog.Description>
          {blockedSignOut
            ? blockedSignOut.conflictCount > 0 && blockedSignOut.pendingCount > 0
              ? `Bạn có ${blockedSignOut.pendingCount} thao tác chờ đồng bộ và ${blockedSignOut.conflictCount} xung đột cần giải quyết. Vào mục Xung đột đồng bộ để xử lý trước khi đăng xuất.`
              : blockedSignOut.conflictCount > 0
                ? `Bạn có ${blockedSignOut.conflictCount} xung đột cần giải quyết. Vào mục Xung đột đồng bộ để xử lý trước khi đăng xuất.`
                : `Bạn có ${blockedSignOut.pendingCount} thao tác đang chờ đồng bộ. Vui lòng đợi kết nối mạng và sync hoàn tất rồi thử đăng xuất lại.`
            : ''}
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button
            variant="outline"
            size="md"
            onPress={() => setBlockedSignOut(null)}
          >
            <Button.Label>Để sau</Button.Label>
          </Button>
          {blockedSignOut && blockedSignOut.conflictCount > 0 ? (
            <Button variant="primary" size="md" onPress={handleViewConflicts}>
              <Button.Label>Xem xung đột</Button.Label>
            </Button>
          ) : (
            <Button variant="primary" size="md" onPress={handleFlushSync}>
              <Button.Label>Đồng bộ ngay</Button.Label>
            </Button>
          )}
        </BouncyDialog.Actions>
      </BouncyDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
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
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  feedbackIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackText: { flex: 1, minWidth: 0 },
});
