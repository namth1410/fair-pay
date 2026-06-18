import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { JoinPreview } from '../../services/group.service';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { AppText, ChipPicker, DismissKeyboardView, SectionTabs } from '../ui';
import { FloatingBottomSheetInput } from '../ui/floating';

type Mode = 'create' | 'join';
/** Bước trong nhánh join: nhập mã → chọn danh tính (nếu nhóm có thành viên ảo). */
type JoinStep = 'code' | 'identity';

const NEW_MEMBER_KEY = '__new__';

interface CreateJoinSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateJoinSheet({ isOpen, onOpenChange }: CreateJoinSheetProps) {
  const c = useAppTheme();
  const { createGroup, joinByCode, previewJoinByCode } = useGroupStore();

  const [mode, setMode] = useState<Mode>('create');
  const valueRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Nhánh join 2 bước
  const [step, setStep] = useState<JoinStep>('code');
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [claim, setClaim] = useState<string>(NEW_MEMBER_KEY);

  const resetAll = () => {
    valueRef.current = '';
    setResetKey((k) => k + 1);
    setHasContent(false);
    setFormError('');
    setStep('code');
    setPreview(null);
    setClaim(NEW_MEMBER_KEY);
  };

  useEffect(() => {
    if (!isOpen) return;
    setMode('create');
    setBusy(false);
    resetAll();
  }, [isOpen]);

  const handleModeChange = (next: Mode) => {
    if (next === mode || busy) return;
    setMode(next);
    resetAll();
  };

  const handleChangeText = (text: string) => {
    valueRef.current = text;
    const next = text.trim().length > 0;
    setHasContent((prev) => (prev === next ? prev : next));
  };

  const handleSubmit = async () => {
    if (busy) return;

    if (mode === 'create') {
      const trimmed = valueRef.current.trim();
      if (!trimmed) return;
      Keyboard.dismiss();
      setFormError('');
      setBusy(true);
      try {
        await createGroup(trimmed);
        onOpenChange(false);
      } catch (e: unknown) {
        setFormError(getErrorMessage(e));
      } finally {
        setBusy(false);
      }
      return;
    }

    // mode === 'join'
    if (step === 'code') {
      const trimmed = valueRef.current.trim();
      if (!trimmed) return;
      Keyboard.dismiss();
      setFormError('');
      setBusy(true);
      try {
        const pv = await previewJoinByCode(trimmed);
        if (pv.claimableMembers.length === 0) {
          // Nhóm không có thành viên ảo → join thẳng, bỏ bước chọn danh tính.
          await joinByCode(trimmed);
          onOpenChange(false);
          return;
        }
        setPreview(pv);
        setClaim(NEW_MEMBER_KEY);
        setStep('identity');
      } catch (e: unknown) {
        setFormError(getErrorMessage(e));
      } finally {
        setBusy(false);
      }
      return;
    }

    // step === 'identity'
    const trimmed = valueRef.current.trim();
    setFormError('');
    setBusy(true);
    try {
      await joinByCode(trimmed, claim === NEW_MEMBER_KEY ? null : claim);
      onOpenChange(false);
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const isCreate = mode === 'create';
  const isIdentity = mode === 'join' && step === 'identity';

  const submitLabel = (() => {
    if (isCreate) return busy ? 'Đang tạo...' : 'Tạo nhóm';
    if (step === 'code') return busy ? 'Đang kiểm tra...' : 'Tiếp tục';
    return busy ? 'Đang gửi...' : 'Tham gia';
  })();

  const claimOptions = [
    { key: NEW_MEMBER_KEY, label: 'Tôi là thành viên mới' },
    ...(preview?.claimableMembers ?? []).map((m) => ({
      key: m.id,
      label: m.display_name,
    })),
  ];

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
                {!isIdentity ? (
                  <SectionTabs
                    items={[
                      { key: 'create', label: 'Tạo nhóm' },
                      { key: 'join', label: 'Nhập mã mời' },
                    ]}
                    selected={mode}
                    onSelect={(k) => handleModeChange(k as Mode)}
                  />
                ) : null}

                <View style={styles.formArea}>
                  {isIdentity ? (
                    <>
                      <AppText variant="body" weight="semibold">
                        Tham gia nhóm “{preview?.group.name ?? ''}”
                      </AppText>
                      <AppText variant="caption" tone="muted" style={styles.hint}>
                        Bạn là ai trong nhóm này? Chọn thành viên đã được tạo sẵn cho
                        bạn để nhận lại số dư & lịch sử, hoặc tham gia với tư cách
                        thành viên mới.
                      </AppText>

                      <ChipPicker
                        options={claimOptions}
                        selected={claim}
                        onSelect={setClaim}
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
                        isDisabled={busy}
                      >
                        <Button.Label>{submitLabel}</Button.Label>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => { setStep('code'); setFormError(''); }}
                        isDisabled={busy}
                      >
                        <Button.Label>Quay lại</Button.Label>
                      </Button>
                    </>
                  ) : (
                    <>
                      <AppText variant="caption" tone="muted" style={styles.hint}>
                        {isCreate
                          ? 'Đặt tên nhóm để bắt đầu chia sẻ chi tiêu với mọi người.'
                          : 'Nhập mã 6 ký tự được người quản trị chia sẻ.'}
                      </AppText>

                      <FloatingBottomSheetInput
                        key={`${mode}-${resetKey}`}
                        label={isCreate ? 'Tên nhóm mới' : 'Mã mời (6 ký tự)'}
                        defaultValue={valueRef.current}
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
                    </>
                  )}
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
