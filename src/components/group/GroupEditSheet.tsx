import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import * as groupRepo from '../../repositories/group.repo';
import {
  removeGroupAvatarOfflineFirst,
  saveGroupAvatar,
} from '../../services/group.service';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { showInfo, showSuccess } from '../../utils/toast';
import { type AvatarSource, pickAndProcessAvatar, type ProcessedAvatar } from '../../utils/imageProcessing';
import { validateName } from '../../utils/validate';
import { AppText, Avatar, BouncyDialog, DismissKeyboardView } from '../ui';
import { FloatingBottomSheetInput } from '../ui/floating';

interface GroupEditSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  currentAvatarUrl: string | null;
}

/**
 * Avatar được STAGE cục bộ, KHÔNG commit ngay. Nút "Lưu thay đổi" (chung với tên)
 * mới thực sự gọi service. `picking` chỉ là trạng thái picker tạm; `newImage` /
 * `removeExisting` là ý định đã stage (avatarDirty = true).
 */
type AvatarStage =
  | { kind: 'none' }
  | { kind: 'picking' }
  | { kind: 'newImage'; processed: ProcessedAvatar }
  | { kind: 'removeExisting' };

type SaveOutcome =
  | { part: 'name'; ok: true }
  | { part: 'name'; ok: false; err: unknown }
  | { part: 'avatar'; ok: true; pending: boolean }
  | { part: 'avatar'; ok: false; err: unknown };

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
  const setGroupAvatar = useGroupStore((s) => s.setGroupAvatar);
  const editGroupName = useGroupStore((s) => s.editGroupName);

  // Avatar section state — staged, committed bởi nút "Lưu thay đổi" chung.
  const [avatarStage, setAvatarStage] = useState<AvatarStage>({ kind: 'none' });
  const [avatarError, setAvatarError] = useState('');

  // Name section state — uncontrolled to avoid Vietnamese IME bug
  const nameRef = useRef(groupName);
  const [resetKey, setResetKey] = useState(0);
  const [nameDirty, setNameDirty] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Save chung + guard thoát chưa lưu
  const [isSaving, setIsSaving] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);

  const avatarDirty =
    avatarStage.kind === 'newImage' || avatarStage.kind === 'removeExisting';
  const isDirty = nameDirty || avatarDirty;
  // Chặn đóng sheet khi đang lưu hoặc đang xử lý ảnh (picker mở).
  const isBusy = isSaving || avatarStage.kind === 'picking';

  useEffect(() => {
    if (!isOpen) {
      // Reset on close so next open is clean
      setAvatarStage({ kind: 'none' });
      setAvatarError('');
      setNameError(null);
      setNameDirty(false);
      setIsSaving(false);
      setExitConfirm(false);
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

  // ── Avatar handlers (stage-only, không gọi service tới khi Lưu) ──

  const handlePick = async (source: AvatarSource) => {
    setAvatarError('');
    setAvatarStage({ kind: 'picking' });
    try {
      const processed = await pickAndProcessAvatar(source);
      if (!processed) {
        setAvatarStage({ kind: 'none' });
        return;
      }
      setAvatarStage({ kind: 'newImage', processed });
    } catch (err) {
      setAvatarError(getErrorMessage(err));
      setAvatarStage({ kind: 'none' });
    }
  };

  const handleStageRemove = () => {
    setAvatarError('');
    setAvatarStage({ kind: 'removeExisting' });
  };

  const handleCancelAvatarChange = () => {
    setAvatarError('');
    setAvatarStage({ kind: 'none' });
  };

  // ── Lưu chung: tên + ảnh là 2 op độc lập, xử lý fail từng phần ──

  const runAvatarOp = async (
    stage: Extract<AvatarStage, { kind: 'newImage' } | { kind: 'removeExisting' }>
  ): Promise<SaveOutcome> => {
    try {
      if (stage.kind === 'newImage') {
        const result = await saveGroupAvatar(groupId, stage.processed);
        setGroupAvatar(groupId, result.avatarUrl);
        return { part: 'avatar', ok: true, pending: result.pending };
      }
      // removeExisting
      const r = await removeGroupAvatarOfflineFirst(groupId);
      if (r.revertedPending) {
        // Hủy pending upload → avatar revert về URL server. Đọc lại từ repo
        // (bypass overlay vì pending row đã xóa).
        const fresh = await groupRepo.getById(groupId);
        setGroupAvatar(groupId, fresh?.avatarUrl ?? null);
      } else {
        setGroupAvatar(groupId, null);
      }
      return { part: 'avatar', ok: true, pending: r.pending };
    } catch (err) {
      return { part: 'avatar', ok: false, err };
    }
  };

  const handleSave = async () => {
    if (!isDirty || isBusy) return;

    const nextName = nameRef.current.trim();
    // Validate tên trước (đồng bộ) — lỗi thì dừng toàn bộ, không đụng ảnh.
    if (nameDirty) {
      const err = validateName(nextName, 'Tên nhóm');
      if (err) {
        setNameError(err);
        return;
      }
    }

    Keyboard.dismiss();
    setIsSaving(true);
    setNameError(null);
    setAvatarError('');

    const tasks: Promise<SaveOutcome>[] = [];
    if (nameDirty) {
      tasks.push(
        editGroupName(groupId, nextName)
          .then((): SaveOutcome => ({ part: 'name', ok: true }))
          .catch((err): SaveOutcome => ({ part: 'name', ok: false, err }))
      );
    }
    if (avatarStage.kind === 'newImage' || avatarStage.kind === 'removeExisting') {
      tasks.push(runAvatarOp(avatarStage));
    }

    const results = await Promise.all(tasks);
    const nameRes = results.find(
      (r): r is Extract<SaveOutcome, { part: 'name' }> => r.part === 'name'
    );
    const avatarRes = results.find(
      (r): r is Extract<SaveOutcome, { part: 'avatar' }> => r.part === 'avatar'
    );

    // Clear dirty cho phần thành công → Save kế chỉ retry phần fail.
    if (nameRes?.ok) setNameDirty(false);
    else if (nameRes && !nameRes.ok) setNameError(getErrorMessage(nameRes.err));

    if (avatarRes?.ok) setAvatarStage({ kind: 'none' });
    else if (avatarRes && !avatarRes.ok) setAvatarError(mapUploadError(avatarRes.err));

    const nameOk = !nameRes || nameRes.ok;
    const avatarOk = !avatarRes || avatarRes.ok;

    if (nameOk && avatarOk) {
      const avatarPending = avatarRes?.ok ? avatarRes.pending : false;
      if (avatarPending) {
        showInfo('Đã lưu, ảnh sẽ đồng bộ khi có mạng');
      } else {
        showSuccess('Đã lưu thay đổi');
      }
      setIsSaving(false);
      onOpenChange(false);
      return;
    }

    // Fail từng phần → giữ sheet mở, toast phần thành công, lỗi inline phần fail.
    if (nameRes?.ok && !avatarOk) {
      showSuccess('Đã đổi tên nhóm');
    } else if (avatarRes?.ok && !nameOk) {
      showSuccess(avatarRes.pending ? 'Đã lưu ảnh, sẽ đồng bộ khi có mạng' : 'Đã cập nhật ảnh nhóm');
    }
    setIsSaving(false);
  };

  // ── Đóng sheet: guard thoát khi còn thay đổi chưa lưu ──

  const handleOpenChange = (open: boolean) => {
    if (open) {
      onOpenChange(true);
      return;
    }
    // Choke point chung cho mọi đường đóng (swipe, back, tap overlay).
    // Dismiss keyboard TRƯỚC khi mở BouncyDialog (Modal) — tránh Modal restore
    // focus rồi bật lại bàn phím khi đóng.
    Keyboard.dismiss();
    if (isBusy) return; // đang lưu / đang chọn ảnh → không cho đóng
    if (isDirty) {
      setExitConfirm(true); // nuốt close, hỏi xác nhận
      return;
    }
    onOpenChange(false);
  };

  const confirmExit = () => {
    setExitConfirm(false);
    onOpenChange(false);
  };

  const saveLabel = isSaving ? 'Đang lưu...' : 'Lưu thay đổi';

  return (
    <>
      <BottomSheet isOpen={isOpen} onOpenChange={handleOpenChange}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            enableDynamicSizing={false}
            snapPoints={['60%', '90%']}
            keyboardBehavior="extend"
            keyboardBlurBehavior="restore"
            android_keyboardInputMode="adjustResize"
          >
            <BottomSheetScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.container}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <DismissKeyboardView>
                <View style={styles.header}>
                  <BottomSheet.Title>Sửa nhóm</BottomSheet.Title>
                </View>

                {/* ── Section: Tên nhóm ── */}
                <View style={styles.section}>
                  <FloatingBottomSheetInput
                    key={resetKey}
                    label="Tên nhóm"
                    defaultValue={groupName}
                    onChangeText={handleChangeName}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    maxLength={100}
                    accessibilityLabel="Tên nhóm"
                    editable={!isSaving}
                    surfaceColor={c.surface}
                  />
                  {nameError ? (
                    <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                      <AppText variant="caption" tone="danger">{nameError}</AppText>
                    </View>
                  ) : null}
                </View>

                <View style={[styles.divider, { backgroundColor: c.divider }]} />

                {/* ── Section: Ảnh nhóm ── */}
                <View style={styles.section}>
                  <AppText variant="label" tone="muted" style={styles.sectionLabel}>
                    Ảnh nhóm
                  </AppText>

                  {avatarStage.kind === 'newImage' ? (
                    <View style={styles.previewBody}>
                      <View style={styles.previewImageWrap}>
                        <Image
                          source={{ uri: avatarStage.processed.uri }}
                          style={styles.previewImage}
                        />
                      </View>
                      <AppText variant="caption" tone="muted">
                        {avatarStage.processed.width}×{avatarStage.processed.width} • {formatBytes(avatarStage.processed.sizeBytes)}
                      </AppText>

                      {avatarError ? (
                        <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                          <AppText variant="caption" tone="danger">{avatarError}</AppText>
                        </View>
                      ) : null}

                      <Button
                        variant="secondary"
                        size="md"
                        onPress={handleCancelAvatarChange}
                        isDisabled={isSaving}
                      >
                        <Button.Label>Chọn ảnh khác</Button.Label>
                      </Button>
                    </View>
                  ) : avatarStage.kind === 'removeExisting' ? (
                    <View style={styles.chooseBody}>
                      <View style={styles.currentRow}>
                        <View style={styles.avatarDim}>
                          <Avatar
                            seed={groupId}
                            label={groupName}
                            photoUrl={currentAvatarUrl}
                            size={56}
                          />
                        </View>
                        <View style={styles.currentMeta}>
                          <AppText variant="caption" tone="danger">
                            Ảnh sẽ bị xóa khi lưu
                          </AppText>
                        </View>
                      </View>

                      {avatarError ? (
                        <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                          <AppText variant="caption" tone="danger">{avatarError}</AppText>
                        </View>
                      ) : null}

                      <Button
                        variant="secondary"
                        size="md"
                        onPress={handleCancelAvatarChange}
                        isDisabled={isSaving}
                      >
                        <Button.Label>Hoàn tác</Button.Label>
                      </Button>
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

                      {avatarStage.kind === 'picking' ? (
                        <View style={styles.busyRow}>
                          <ActivityIndicator color={c.foreground} />
                          <AppText variant="body" tone="muted">Đang xử lý ảnh...</AppText>
                        </View>
                      ) : (
                        <View style={styles.actionsCol}>
                          <View style={styles.actionsRow}>
                            <View style={styles.actionFlex}>
                              <Button variant="primary" size="md" onPress={() => handlePick('library')} isDisabled={isSaving}>
                                <Button.Label>Thư viện</Button.Label>
                              </Button>
                            </View>
                            <View style={styles.actionFlex}>
                              <Button variant="secondary" size="md" onPress={() => handlePick('camera')} isDisabled={isSaving}>
                                <Button.Label>Chụp ảnh</Button.Label>
                              </Button>
                            </View>
                          </View>
                          {currentAvatarUrl ? (
                            <Button
                              variant="danger"
                              size="md"
                              onPress={handleStageRemove}
                              isDisabled={isSaving}
                            >
                              <Button.Label>Xóa ảnh</Button.Label>
                            </Button>
                          ) : null}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* ── Lưu chung ── */}
                <View style={styles.saveSection}>
                  <Button
                    variant="primary"
                    size="md"
                    onPress={handleSave}
                    isDisabled={!isDirty || isBusy}
                  >
                    <Button.Label>{saveLabel}</Button.Label>
                  </Button>
                </View>
              </DismissKeyboardView>
            </BottomSheetScrollView>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>

      {/* Render NGOÀI BottomSheet.Portal để tránh lỗi nested Modal trên Android. */}
      <BouncyDialog
        isOpen={exitConfirm}
        onClose={() => setExitConfirm(false)}
      >
        <BouncyDialog.Title>Thay đổi chưa lưu</BouncyDialog.Title>
        <BouncyDialog.Description>
          Bạn đã thay đổi nhưng chưa lưu. Thoát mà không lưu?
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={() => setExitConfirm(false)}>
            <Button.Label>Ở lại</Button.Label>
          </Button>
          <Button variant="danger" size="sm" onPress={confirmExit}>
            <Button.Label>Thoát</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  scrollView: {
    flex: 1,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
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
  avatarDim: {
    opacity: 0.4,
  },
  saveSection: {
    paddingTop: 20,
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
