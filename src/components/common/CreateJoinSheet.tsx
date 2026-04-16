import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button, useToast } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { AppText, SectionTabs } from '../ui';

type Mode = 'create' | 'join';

interface CreateJoinSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful join request that requires approval. */
  onJoinPending: (groupName: string) => void;
}

export function CreateJoinSheet({ isOpen, onOpenChange, onJoinPending }: CreateJoinSheetProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const { createGroup, joinByCode } = useGroupStore();

  const [mode, setMode] = useState<Mode>('create');
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  // gorhom v5 requires snap points as percentages or pixel numbers (no
  // 'CONTENT_HEIGHT' token). Memoized for stable ref. Initial 40% for the
  // compact form, '90%' as the keyboard-extend target.
  const snapPoints = useMemo(() => ['40%', '90%'], []);

  // Reset every time the sheet opens so the user never sees stale input.
  useEffect(() => {
    if (!isOpen) return;
    setMode('create');
    setGroupName('');
    setInviteCode('');
    setBusy(false);
  }, [isOpen]);

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createGroup(name);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.show({
        variant: 'danger',
        label: 'Không tạo được nhóm',
        description: getErrorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = inviteCode.trim();
    if (!code || busy) return;
    setBusy(true);
    try {
      const result = await joinByCode(code);
      onOpenChange(false);
      onJoinPending(result.group.name);
    } catch (e: unknown) {
      toast.show({
        variant: 'danger',
        label: 'Không tham gia được',
        description: getErrorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    backgroundColor: c.background,
    borderColor: c.divider,
    color: c.foreground,
    fontFamily: fonts.regular,
    ...styles.input,
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          // 40%: compact resting state for the form. 90%: keyboard-extend
          // target. `keyboardBehavior="extend"` jumps to highest snap point
          // when keyboard appears — without snap points gorhom has no target.
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetView style={styles.content}>
            {/* Body only rendered while sheet is open. Otherwise the
                BottomSheetTextInput's `autoFocus` fires on first mount and
                pops the keyboard even when the sheet is hidden — happens on
                every app reload because the Portal always keeps Content in
                the React tree regardless of isOpen. */}
            {isOpen && (
              <>
                <SectionTabs
                  items={[
                    { key: 'create', label: 'Tạo nhóm' },
                    { key: 'join', label: 'Nhập mã mời' },
                  ]}
                  selected={mode}
                  onSelect={(k) => setMode(k as Mode)}
                />

                <View style={styles.formArea}>
                  {mode === 'create' ? (
                <>
                  <AppText variant="caption" tone="muted" style={styles.hint}>
                    Đặt tên nhóm để bắt đầu chia sẻ chi tiêu với mọi người.
                  </AppText>
                  <BottomSheetTextInput
                    placeholder="Tên nhóm mới"
                    placeholderTextColor={c.muted}
                    value={groupName}
                    onChangeText={setGroupName}
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                    style={inputStyle}
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    onPress={handleCreate}
                    isDisabled={busy || !groupName.trim()}
                  >
                    <Button.Label>{busy ? 'Đang tạo...' : 'Tạo nhóm'}</Button.Label>
                  </Button>
                </>
              ) : (
                <>
                  <AppText variant="caption" tone="muted" style={styles.hint}>
                    Nhập mã 6 ký tự được người quản trị chia sẻ.
                  </AppText>
                  <BottomSheetTextInput
                    placeholder="a1b2c3"
                    placeholderTextColor={c.muted}
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleJoin}
                    style={inputStyle}
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    onPress={handleJoin}
                    isDisabled={busy || !inviteCode.trim()}
                  >
                    <Button.Label>{busy ? 'Đang gửi...' : 'Tham gia'}</Button.Label>
                  </Button>
                </>
              )}
                </View>
              </>
            )}
          </BottomSheetView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
  },
  formArea: {
    paddingHorizontal: 4,
    paddingTop: 12,
    gap: 14,
  },
  hint: {
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
});
