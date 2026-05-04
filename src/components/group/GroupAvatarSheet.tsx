import { BottomSheetView } from '@gorhom/bottom-sheet';
import { File } from 'expo-file-system';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import {
  commitGroupAvatar,
  removeGroupAvatar,
  requestGroupAvatarUploadUrl,
} from '../../services/group.service';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { pickAndProcessAvatar, type AvatarSource, type ProcessedAvatar } from '../../utils/imageProcessing';
import { AppText, Avatar } from '../ui';

interface GroupAvatarSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  currentAvatarUrl: string | null;
}

type SheetState =
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

export function GroupAvatarSheet({
  isOpen,
  onOpenChange,
  groupId,
  groupName,
  currentAvatarUrl,
}: GroupAvatarSheetProps) {
  const c = useAppTheme();
  const setGroupAvatar = useGroupStore((s) => s.setGroupAvatar);
  const [state, setState] = useState<SheetState>({ kind: 'choose' });
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setState({ kind: 'choose' });
      setErrorMsg('');
    }
  }, [isOpen]);

  const handlePick = async (source: AvatarSource) => {
    setErrorMsg('');
    setState({ kind: 'picking' });
    try {
      const processed = await pickAndProcessAvatar(source);
      if (!processed) {
        setState({ kind: 'choose' });
        return;
      }
      setState({ kind: 'preview', processed });
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setState({ kind: 'choose' });
    }
  };

  const handleSave = async () => {
    if (state.kind !== 'preview') return;
    const { processed } = state;
    setErrorMsg('');
    setState({ kind: 'uploading', processed });
    try {
      console.log('[avatar] step 1: requesting presigned URL', {
        groupId,
        sizeBytes: processed.sizeBytes,
      });
      const presign = await requestGroupAvatarUploadUrl(groupId, processed.sizeBytes);
      console.log('[avatar] step 1 OK:', { fileKey: presign.fileKey, hasUrl: !!presign.uploadUrl });

      console.log('[avatar] step 2: reading local file as arrayBuffer');
      const file = new File(processed.uri);
      const arrayBuffer = await file.arrayBuffer();
      console.log('[avatar] step 2 OK: arrayBuffer size =', arrayBuffer.byteLength);

      console.log('[avatar] step 3: PUT to R2');
      // Don't set Content-Length manually — RN fetch sets it from body,
      // and it must match exactly what was signed (= sizeBytes from presign).
      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: arrayBuffer,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });
      console.log('[avatar] step 3 response:', { status: putRes.status, ok: putRes.ok });
      if (!putRes.ok) {
        const text = await putRes.text().catch(() => '');
        console.error('[avatar] R2 PUT body:', text.slice(0, 500));
        throw new Error(`Upload thất bại (${putRes.status})`);
      }

      console.log('[avatar] step 4: commit');
      const result = await commitGroupAvatar(groupId, presign.fileKey);
      console.log('[avatar] step 4 OK:', result);
      setGroupAvatar(groupId, result.avatar_url);
      onOpenChange(false);
    } catch (err) {
      console.error('[avatar] handleSave failed:', {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
        stack: (err as Error)?.stack?.split('\n').slice(0, 5).join('\n'),
      });
      setErrorMsg(mapUploadError(err));
      setState({ kind: 'preview', processed });
    }
  };

  const handleRemove = async () => {
    setErrorMsg('');
    setState({ kind: 'removing' });
    try {
      await removeGroupAvatar(groupId);
      setGroupAvatar(groupId, null);
      onOpenChange(false);
    } catch (err) {
      setErrorMsg(mapUploadError(err));
      setState({ kind: 'choose' });
    }
  };

  const isBusy = state.kind === 'picking' || state.kind === 'uploading' || state.kind === 'removing';

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
        <BottomSheet.Content enableDynamicSizing={false} snapPoints={['55%']}>
          <BottomSheetView style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>Avatar nhóm</BottomSheet.Title>
            </View>

            {state.kind === 'preview' || state.kind === 'uploading' ? (
              <View style={styles.previewBody}>
                <View style={styles.previewImageWrap}>
                  <Image
                    source={{ uri: state.processed.uri }}
                    style={styles.previewImage}
                  />
                </View>
                <AppText variant="caption" tone="muted">
                  {state.processed.width}×{state.processed.width} • {formatBytes(state.processed.sizeBytes)}
                </AppText>

                {errorMsg ? (
                  <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                    <AppText variant="caption" tone="danger">{errorMsg}</AppText>
                  </View>
                ) : null}

                <View style={styles.actionsRow}>
                  <View style={styles.actionFlex}>
                    <Button
                      variant="secondary"
                      size="lg"
                      onPress={() => setState({ kind: 'choose' })}
                      isDisabled={state.kind === 'uploading'}
                    >
                      <Button.Label>Đổi ảnh</Button.Label>
                    </Button>
                  </View>
                  <View style={styles.actionFlex}>
                    <Button
                      variant="primary"
                      size="lg"
                      onPress={handleSave}
                      isDisabled={state.kind === 'uploading'}
                    >
                      <Button.Label>
                        {state.kind === 'uploading' ? 'Đang tải lên...' : 'Lưu'}
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
                    size={72}
                  />
                  <View style={styles.currentMeta}>
                    <AppText variant="body" weight="semibold" numberOfLines={1}>
                      {groupName}
                    </AppText>
                    <AppText variant="caption" tone="muted">
                      {currentAvatarUrl ? 'Đang dùng ảnh tùy chỉnh' : 'Đang dùng avatar mặc định'}
                    </AppText>
                  </View>
                </View>

                {errorMsg ? (
                  <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                    <AppText variant="caption" tone="danger">{errorMsg}</AppText>
                  </View>
                ) : null}

                {state.kind === 'picking' ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator color={c.foreground} />
                    <AppText variant="body" tone="muted">Đang xử lý ảnh...</AppText>
                  </View>
                ) : (
                  <View style={styles.actionsCol}>
                    <Button variant="primary" size="lg" onPress={() => handlePick('library')}>
                      <Button.Label>Chọn từ thư viện</Button.Label>
                    </Button>
                    <Button variant="secondary" size="lg" onPress={() => handlePick('camera')}>
                      <Button.Label>Chụp ảnh</Button.Label>
                    </Button>
                    {currentAvatarUrl ? (
                      <Pressable
                        onPress={handleRemove}
                        disabled={state.kind === 'removing'}
                        style={({ pressed }) => [
                          styles.removeBtn,
                          { opacity: pressed ? 0.5 : 1 },
                        ]}
                      >
                        <AppText variant="body" tone="danger" weight="semibold">
                          {state.kind === 'removing' ? 'Đang xóa...' : 'Xóa avatar'}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            )}
          </BottomSheetView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    paddingVertical: 8,
  },
  chooseBody: {
    paddingTop: 8,
    gap: 16,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  currentMeta: {
    flex: 1,
    minWidth: 0,
    gap: 4,
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
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  previewBody: {
    paddingTop: 8,
    gap: 12,
    alignItems: 'center',
  },
  previewImageWrap: {
    width: 240,
    height: 240,
    borderRadius: 120,
    overflow: 'hidden',
  },
  previewImage: {
    width: 240,
    height: 240,
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
