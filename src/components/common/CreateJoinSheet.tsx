import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { AppText, DismissKeyboardView, SectionTabs } from '../ui';
import { FloatingBottomSheetInput } from '../ui/floating';

type Mode = 'create' | 'join';

interface CreateJoinSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateJoinSheet({ isOpen, onOpenChange }: CreateJoinSheetProps) {
  const c = useAppTheme();
  const { createGroup, joinByCode } = useGroupStore();

  const [mode, setMode] = useState<Mode>('create');
  const valueRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMode('create');
    valueRef.current = '';
    setResetKey((k) => k + 1);
    setHasContent(false);
    setBusy(false);
    setFormError('');
  }, [isOpen]);

  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    valueRef.current = '';
    setResetKey((k) => k + 1);
    setHasContent(false);
    setFormError('');
  };

  const handleChangeText = (text: string) => {
    valueRef.current = text;
    const next = text.trim().length > 0;
    setHasContent((prev) => (prev === next ? prev : next));
  };

  const handleSubmit = async () => {
    const trimmed = valueRef.current.trim();
    if (!trimmed || busy) return;
    Keyboard.dismiss();
    setFormError('');
    setBusy(true);
    try {
      if (mode === 'create') {
        await createGroup(trimmed);
      } else {
        // joinByCode trigger store.loadMyPendingJoinRequests → Home tự render ribbon
        await joinByCode(trimmed);
      }
      onOpenChange(false);
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const isCreate = mode === 'create';
  const submitLabel = isCreate
    ? busy ? 'Đang tạo...' : 'Tạo nhóm'
    : busy ? 'Đang gửi...' : 'Tham gia';

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['50%', '90%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetView style={styles.container}>
            <DismissKeyboardView>
            <View style={styles.header}>
              <BottomSheet.Title>
                {isCreate ? 'Tạo nhóm mới' : 'Tham gia nhóm'}
              </BottomSheet.Title>
            </View>

            <View style={styles.body}>
              <SectionTabs
                items={[
                  { key: 'create', label: 'Tạo nhóm' },
                  { key: 'join', label: 'Nhập mã mời' },
                ]}
                selected={mode}
                onSelect={(k) => handleModeChange(k as Mode)}
              />

              <View style={styles.formArea}>
                <AppText variant="caption" tone="muted" style={styles.hint}>
                  {isCreate
                    ? 'Đặt tên nhóm để bắt đầu chia sẻ chi tiêu với mọi người.'
                    : 'Nhập mã 6 ký tự được người quản trị chia sẻ.'}
                </AppText>

                <FloatingBottomSheetInput
                  key={`${mode}-${resetKey}`}
                  label={isCreate ? 'Tên nhóm mới' : 'Mã mời (6 ký tự)'}
                  defaultValue=""
                  onChangeText={handleChangeText}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  autoCapitalize={isCreate ? 'sentences' : 'none'}
                  accessibilityLabel={isCreate ? 'Tên nhóm mới' : 'Mã mời'}
                  surfaceColor={c.surface}
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
                  <Button.Label>{submitLabel}</Button.Label>
                </Button>
              </View>
            </View>
            </DismissKeyboardView>
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
    paddingTop: 4,
  },
  formArea: {
    paddingTop: 14,
    gap: 14,
  },
  hint: {
    marginBottom: 2,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
});
