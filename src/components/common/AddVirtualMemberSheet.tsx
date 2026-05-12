import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { AppText } from '../ui';

interface AddVirtualMemberSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onSuccess: (name: string) => void;
}

export function AddVirtualMemberSheet({
  isOpen,
  onOpenChange,
  groupId,
  onSuccess,
}: AddVirtualMemberSheetProps) {
  const c = useAppTheme();
  const { addVirtualMember } = useGroupStore();

  const nameRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    nameRef.current = '';
    setResetKey((k) => k + 1);
    setHasContent(false);
    setBusy(false);
    setFormError('');
  }, [isOpen]);

  const handleChangeText = (text: string) => {
    nameRef.current = text;
    const next = text.trim().length > 0;
    setHasContent((prev) => (prev === next ? prev : next));
  };

  const handleSubmit = async () => {
    const trimmed = nameRef.current.trim();
    if (!trimmed || busy) return;
    Keyboard.dismiss();
    setFormError('');
    setBusy(true);
    try {
      await addVirtualMember(groupId, trimmed);
      onOpenChange(false);
      onSuccess(trimmed);
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
              <BottomSheet.Title>Thêm thành viên ảo</BottomSheet.Title>
            </View>

            <View style={styles.body}>
              <AppText variant="caption" tone="muted" style={styles.hint}>
                Tạo thành viên không cần tài khoản — dùng khi bạn quản lý chi tiêu cho người chưa cài app.
              </AppText>
              <BottomSheetTextInput
                key={resetKey}
                placeholder="Tên hiển thị"
                placeholderTextColor={c.muted}
                defaultValue=""
                onChangeText={handleChangeText}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                accessibilityLabel="Tên thành viên ảo"
                editable={!busy}
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
                isDisabled={busy || !hasContent}
              >
                <Button.Label>{busy ? 'Đang tạo...' : 'Tạo thành viên'}</Button.Label>
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
