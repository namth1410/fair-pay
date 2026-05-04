import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { File } from 'expo-file-system';
import { BottomSheet, Button, useToast } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import {
  commitGroupAvatar,
  removeGroupAvatar,
  requestGroupAvatarUploadUrl,
} from '../../services/group.service';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { type AvatarSource, pickAndProcessAvatar, type ProcessedAvatar } from '../../utils/imageProcessing';
import { validateName } from '../../utils/validate';
import { AppText, Avatar } from '../ui';

interface GroupEditSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  currentAvatarUrl: string | null;
}

type AvatarState =
  | { kind: 'choose' }
  | { kind: 'picking' }
  | { kind: 'preview'; processed: ProcessedAvatar }
  | { kind: 'uploading'; processed: ProcessedAvatar }
  | { kind: 'removing' };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRetry(seconds: number): string {
  if (seconds < 60) return `${seconds} giây`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} phút`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)} giờ`;
  return `${Math.ceil(seconds / 86400)} ngày`;
}

function mapUploadError(err: unknown): string {
  const e = err as { message?: string; retryAfter?: number };
  if (e?.retryAfter) {
    return `Vượt giới hạn đổi avatar. Thử lại sau ${formatRetry(e.retryAfter)}`;
  }
  if (e?.message?.includes('quá 2 MB')) return 'Ảnh vượt quá 2 MB';
  if (e?.message?.includes('quyền')) return e.message;
  if (e?.message?.includes('không hợp lệ')) return e.message;
  return getErrorMessage(err);
}

export function GroupEditSheet({
  isOpen,
  onOpenChange,
  groupId,
  groupName,
  currentAvatarUrl,
}: GroupEditSheetProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const setGroupAvatar = useGroupStore((s) => s.setGroupAvatar);
  const editGroupName = useGroupStore((s) => s.editGroupName);

  // Avatar section state
  const [avatarState, setAvatarState] = useState<AvatarState>({ kind: 'choose' });
  const [avatarError, setAvatarError] = useState('');

  // Name section state — uncontrolled to avoid Vietnamese IME bug
  const nameRef = useRef(groupName);
  const [resetKey, setResetKey] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const [nameDirty, setNameDirty] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      // Reset on close so next open is clean
      setAvatarState({ kind: 'choose' });
      setAvatarError('');
      setShowInput(false);
      setNameError(null);
      setNameDirty(false);
      setIsSavingName(false);
      nameRef.current = groupName;
      setResetKey((k) => k + 1);
    }
  }, [isOpen, groupName]);

  // ── Name handlers ──

  const handleChangeName = (text: string) => {
    nameRef.current = text;
    const next = text.trim() !== groupName.trim();
    setNameDirty((prev) => (prev === next ? prev : next));
    if (nameError) setNameError(null);
  };

  const handleSaveName = async () => {
    const next = nameRef.current.trim();
    const err = validateName(next, 'Tên nhóm');
    if (err) {
      setNameError(err);
      return;
    }
    if (next === groupName.trim()) return;
    setIsSavingName(true);
    setNameError(null);
    try {
      await editGroupName(groupId, next);
      toast.show({ variant: 'success', label: 'Đã đổi tên nhóm' });
      onOpenChange(false);
    } catch (e: unknown) {
      setNameError(getErrorMessage(e));
    } finally {
      setIsSavingName(false);
    }
  };

  // ── Avatar handlers (preserved from GroupAvatarSheet) ──

  const handlePick = async (source: AvatarSource) => {
    setAvatarError('');
    setAvatarState({ kind: 'picking' });
    try {
      const processed = await pickAndProcessAvatar(source);
      if (!processed) {
        setAvatarState({ kind: 'choose' });
        return;
      }
      setAvatarState({ kind: 'preview', processed });
    } catch (err) {
      setAvatarError(getErrorMessage(err));
      setAvatarState({ kind: 'choose' });
    }
  };

  const handleSaveAvatar = async () => {
    if (avatarState.kind !== 'preview') return;
    const { processed } = avatarState;
    setAvatarError('');
    setAvatarState({ kind: 'uploading', processed });
    try {
      const presign = await requestGroupAvatarUploadUrl(groupId, processed.sizeBytes);
      const file = new File(processed.uri);
      const arrayBuffer = await file.arrayBuffer();
      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: arrayBuffer,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      if (!putRes.ok) {
        throw new Error(`Upload thất bại (${putRes.status})`);
      }
      const result = await commitGroupAvatar(groupId, presign.fileKey);
      setGroupAvatar(groupId, result.avatar_url);
      toast.show({ variant: 'success', label: 'Đã đổi ảnh nhóm' });
      onOpenChange(false);
    } catch (err) {
      setAvatarError(mapUploadError(err));
      setAvatarState({ kind: 'preview', processed });
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError('');
    setAvatarState({ kind: 'removing' });
    try {
      await removeGroupAvatar(groupId);
      setGroupAvatar(groupId, null);
      toast.show({ variant: 'success', label: 'Đã xóa ảnh nhóm' });
      onOpenChange(false);
    } catch (err) {
      setAvatarError(mapUploadError(err));
      setAvatarState({ kind: 'choose' });
    }
  };

  const isAvatarBusy =
    avatarState.kind === 'picking' ||
    avatarState.kind === 'uploading' ||
    avatarState.kind === 'removing';

  const isBusy = isAvatarBusy || isSavingName;

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (isBusy) return;
        onOpenChange(open);
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['60%', '90%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          onChange={(index) => setShowInput(index >= 0)}
        >
          <BottomSheetScrollView contentContainerStyle={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>Sửa nhóm</BottomSheet.Title>
            </View>

            {/* ── Section: Tên nhóm ── */}
            <View style={styles.section}>
              <AppText variant="label" tone="muted" style={styles.sectionLabel}>
                Tên nhóm
              </AppText>
              {showInput ? (
                <BottomSheetTextInput
                  key={resetKey}
                  placeholder="Tên nhóm"
                  placeholderTextColor={c.muted}
                  defaultValue={groupName}
                  onChangeText={handleChangeName}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                  maxLength={100}
                  accessibilityLabel="Tên nhóm"
                  editable={!isSavingName}
                  style={[
                    styles.input,
                    {
                      color: c.foreground,
                      backgroundColor: c.surfaceAlt,
                      borderColor: c.divider,
                    },
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.input,
                    {
                      backgroundColor: c.surfaceAlt,
                      borderColor: c.divider,
                    },
                  ]}
                />
              )}
              {nameError ? (
                <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                  <AppText variant="caption" tone="danger">{nameError}</AppText>
                </View>
              ) : null}
              <Button
                variant="primary"
                size="md"
                onPress={handleSaveName}
                isDisabled={!nameDirty || isSavingName}
              >
                <Button.Label>{isSavingName ? 'Đang lưu...' : 'Lưu tên'}</Button.Label>
              </Button>
            </View>

            <View style={[styles.divider, { backgroundColor: c.divider }]} />

            {/* ── Section: Ảnh nhóm ── */}
            <View style={styles.section}>
              <AppText variant="label" tone="muted" style={styles.sectionLabel}>
                Ảnh nhóm
              </AppText>

              {avatarState.kind === 'preview' || avatarState.kind === 'uploading' ? (
                <View style={styles.previewBody}>
                  <View style={styles.previewImageWrap}>
                    <Image
                      source={{ uri: avatarState.processed.uri }}
                      style={styles.previewImage}
                    />
                  </View>
                  <AppText variant="caption" tone="muted">
                    {avatarState.processed.width}×{avatarState.processed.width} • {formatBytes(avatarState.processed.sizeBytes)}
                  </AppText>

                  {avatarError ? (
                    <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                      <AppText variant="caption" tone="danger">{avatarError}</AppText>
                    </View>
                  ) : null}

                  <View style={styles.actionsRow}>
                    <View style={styles.actionFlex}>
                      <Button
                        variant="secondary"
                        size="md"
                        onPress={() => setAvatarState({ kind: 'choose' })}
                        isDisabled={avatarState.kind === 'uploading'}
                      >
                        <Button.Label>Đổi ảnh</Button.Label>
                      </Button>
                    </View>
                    <View style={styles.actionFlex}>
                      <Button
                        variant="primary"
                        size="md"
                        onPress={handleSaveAvatar}
                        isDisabled={avatarState.kind === 'uploading'}
                      >
                        <Button.Label>
                          {avatarState.kind === 'uploading' ? 'Đang tải lên...' : 'Lưu'}
                        </Button.Label>
                      </Button>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.chooseBody}>
                  <View style={styles.currentRow}>
                    <Avatar
                      seed={groupId}
                      label={groupName}
                      photoUrl={currentAvatarUrl}
                      size={56}
                    />
                    <View style={styles.currentMeta}>
                      <AppText variant="caption" tone="muted">
                        {currentAvatarUrl ? 'Đang dùng ảnh tùy chỉnh' : 'Đang dùng avatar mặc định'}
                      </AppText>
                    </View>
                  </View>

                  {avatarError ? (
                    <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                      <AppText variant="caption" tone="danger">{avatarError}</AppText>
                    </View>
                  ) : null}

                  {avatarState.kind === 'picking' ? (
                    <View style={styles.busyRow}>
                      <ActivityIndicator color={c.foreground} />
                      <AppText variant="body" tone="muted">Đang xử lý ảnh...</AppText>
                    </View>
                  ) : (
                    <View style={styles.actionsCol}>
                      <View style={styles.actionsRow}>
                        <View style={styles.actionFlex}>
                          <Button variant="primary" size="md" onPress={() => handlePick('library')}>
                            <Button.Label>Thư viện</Button.Label>
                          </Button>
                        </View>
                        <View style={styles.actionFlex}>
                          <Button variant="secondary" size="md" onPress={() => handlePick('camera')}>
                            <Button.Label>Chụp ảnh</Button.Label>
                          </Button>
                        </View>
                      </View>
                      {currentAvatarUrl ? (
                        <Pressable
                          onPress={handleRemoveAvatar}
                          disabled={avatarState.kind === 'removing'}
                          style={({ pressed }) => [
                            styles.removeBtn,
                            { opacity: pressed ? 0.5 : 1 },
                          ]}
                        >
                          <AppText variant="body" tone="danger" weight="semibold">
                            {avatarState.kind === 'removing' ? 'Đang xóa...' : 'Xóa ảnh'}
                          </AppText>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>
              )}
            </View>
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  header: {
    paddingVertical: 8,
  },
  section: {
    paddingTop: 12,
    gap: 10,
  },
  sectionLabel: {
    marginBottom: 2,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  currentMeta: {
    flex: 1,
    minWidth: 0,
  },
  actionsCol: {
    gap: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionFlex: {
    flex: 1,
  },
  removeBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  chooseBody: {
    gap: 12,
  },
  previewBody: {
    paddingTop: 4,
    gap: 10,
    alignItems: 'center',
  },
  previewImageWrap: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
  },
  previewImage: {
    width: 180,
    height: 180,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    alignSelf: 'stretch',
  },
  busyRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
});
