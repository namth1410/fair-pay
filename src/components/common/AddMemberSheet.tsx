import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../stores/app.store';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { showSuccess } from '../../utils/toast';
import { validateEmail } from '../../utils/validate';
import { AppText, DismissKeyboardView, SectionTabs } from '../ui';
import { FloatingBottomSheetInput } from '../ui/floating';

type Mode = 'email' | 'virtual';

interface AddMemberSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  /** Callback khi thêm thành viên ảo thành công. Truyền display_name vừa tạo. */
  onVirtualAdded?: (name: string) => void;
  /** Callback khi gửi lời mời thành công. Truyền email vừa mời. */
  onInvited?: (email: string) => void;
}

export function AddMemberSheet({
  isOpen,
  onOpenChange,
  groupId,
  onVirtualAdded,
  onInvited,
}: AddMemberSheetProps) {
  const c = useAppTheme();
  const { addVirtualMember, inviteMember } = useGroupStore();
  const isOnline = useAppStore((s) => s.isOnline);

  const [mode, setMode] = useState<Mode>('email');
  const valueRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMode('email');
    valueRef.current = '';
    setResetKey((k) => k + 1);
    setHasContent(false);
    setBusy(false);
    setFormError('');
  }, [isOpen]);

  const handleModeChange = (next: Mode) => {
    if (next === mode || busy) return;
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
    if (mode === 'email' && !isOnline) return;
    Keyboard.dismiss();
    setFormError('');

    if (mode === 'email') {
      const emailErr = validateEmail(trimmed);
      if (emailErr) {
        setFormError(emailErr);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'email') {
        const normalized = trimmed.toLowerCase();
        await inviteMember(groupId, normalized);
        onOpenChange(false);
        onInvited?.(normalized);
        showSuccess('Đã gửi lời mời', normalized);
      } else {
        await addVirtualMember(groupId, trimmed);
        onOpenChange(false);
        onVirtualAdded?.(trimmed);
      }
    } catch (e: unknown) {
      // Override message cho case admin invite user đã là member
      // (default message "Bạn đã là thành viên nhóm này" sai góc nhìn).
      const raw = e instanceof Error ? e.message : String(e ?? '');
      if (mode === 'email' && raw.includes('already_member')) {
        setFormError('Người này đã là thành viên của nhóm');
      } else {
        setFormError(getErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const isEmail = mode === 'email';
  const emailDisabledOffline = isEmail && !isOnline;
  const submitLabel = (() => {
    if (isEmail) return busy ? 'Đang gửi...' : 'Gửi lời mời';
    return busy ? 'Đang tạo...' : 'Tạo thành viên';
  })();

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
                  {isEmail ? 'Mời bằng email' : 'Thêm thành viên ảo'}
                </BottomSheet.Title>
              </View>

              <View style={styles.body}>
                <SectionTabs
                  items={[
                    { key: 'email', label: 'Mời bằng email' },
                    { key: 'virtual', label: 'Thành viên ảo' },
                  ]}
                  selected={mode}
                  onSelect={(k) => handleModeChange(k as Mode)}
                />

                <View style={styles.formArea}>
                  <AppText variant="caption" tone="muted" style={styles.hint}>
                    {isEmail
                      ? 'Người được mời phải có tài khoản Fair Pay. Họ sẽ nhận thông báo và bấm Chấp nhận để vào nhóm.'
                      : 'Tạo thành viên không cần tài khoản — dùng khi bạn quản lý chi tiêu cho người chưa cài app.'}
                  </AppText>

                  <FloatingBottomSheetInput
                    key={`${mode}-${resetKey}`}
                    label={isEmail ? 'Email người được mời' : 'Tên hiển thị'}
                    defaultValue=""
                    onChangeText={handleChangeText}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    autoCapitalize={isEmail ? 'none' : 'words'}
                    keyboardType={isEmail ? 'email-address' : 'default'}
                    accessibilityLabel={
                      isEmail ? 'Email người được mời' : 'Tên thành viên ảo'
                    }
                    editable={!busy && !emailDisabledOffline}
                    surfaceColor={c.surface}
                  />

                  {emailDisabledOffline ? (
                    <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                      <AppText variant="caption" tone="danger">
                        Cần kết nối mạng để mời bằng email.
                      </AppText>
                    </View>
                  ) : null}

                  {formError ? (
                    <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                      <AppText variant="caption" tone="danger">
                        {formError}
                      </AppText>
                    </View>
                  ) : null}

                  <Button
                    variant="primary"
                    size="lg"
                    onPress={handleSubmit}
                    isDisabled={busy || !hasContent || emailDisabledOffline}
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
