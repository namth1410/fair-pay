import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DISPLAY_NAME_MAX_LENGTH } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { AppText } from '../ui';

interface RenameMemberSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  currentName: string;
  groupId: string;
  onSuccess?: () => void;
}

export function RenameMemberSheet({
  isOpen,
  onOpenChange,
  memberId,
  currentName,
  groupId,
  onSuccess,
}: RenameMemberSheetProps) {
  const c = useAppTheme();
  const renameMemberInGroup = useGroupStore((s) => s.renameMemberInGroup);

  const nameRef = useRef(currentName);
  const [resetKey, setResetKey] = useState(0);
  const [hasChange, setHasChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    nameRef.current = currentName;
    setResetKey((k) => k + 1);
    setHasChange(false);
    setBusy(false);
    setFormError('');
  }, [isOpen, currentName]);

  const handleChangeText = (text: string) => {
    nameRef.current = text;
    const trimmed = text.trim();
    const next = trimmed.length > 0 && trimmed !== currentName.trim();
    setHasChange((prev) => (prev === next ? prev : next));
  };

  const handleSubmit = async () => {
    const trimmed = nameRef.current.trim();
    if (!trimmed || busy) return;
    if (trimmed === currentName.trim()) {
      onOpenChange(false);
      return;
    }
    setFormError('');
    setBusy(true);
    try {
      await renameMemberInGroup(memberId, trimmed, groupId);
      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['45%', '90%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetView style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>Đổi tên thành viên</BottomSheet.Title>
            </View>

            <View style={styles.body}>
              <AppText variant="caption" tone="muted" style={styles.hint}>
                Tên mới sẽ hiển thị ở danh sách thành viên, các khoản chi và thanh toán liên quan.
              </AppText>
              <BottomSheetTextInput
                key={resetKey}
                placeholder="Tên thành viên"
                placeholderTextColor={c.muted}
                defaultValue={currentName}
                onChangeText={handleChangeText}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                accessibilityLabel="Tên thành viên mới"
                style={[
                  styles.input,
                  {
                    color: c.foreground,
                    backgroundColor: c.surfaceAlt,
                    borderColor: c.divider,
                  },
                ]}
              />
              {formError ? (
                <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                  <AppText variant="caption" tone="danger">{formError}</AppText>
                </View>
              ) : null}
              <Button
                variant="primary"
                size="lg"
                onPress={handleSubmit}
                isDisabled={busy || !hasChange}
              >
                <Button.Label>{busy ? 'Đang lưu...' : 'Lưu tên mới'}</Button.Label>
              </Button>
            </View>
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
  body: {
    paddingTop: 8,
    gap: 14,
  },
  hint: {
    marginBottom: 2,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
});
