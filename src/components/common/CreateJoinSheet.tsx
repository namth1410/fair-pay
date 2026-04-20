import { Button } from 'heroui-native';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { AppText, AppTextField, SectionTabs } from '../ui';

type Mode = 'create' | 'join';

interface CreateJoinSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful join request that requires approval. */
  onJoinPending: (groupName: string) => void;
}

export function CreateJoinSheet({ isOpen, onOpenChange, onJoinPending }: CreateJoinSheetProps) {
  const c = useAppTheme();
  const { createGroup, joinByCode } = useGroupStore();

  const [mode, setMode] = useState<Mode>('create');
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMode('create');
    setGroupName('');
    setInviteCode('');
    setBusy(false);
    setFormError('');
  }, [isOpen]);

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name || busy) return;
    setFormError('');
    setBusy(true);
    try {
      await createGroup(name);
      onOpenChange(false);
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = inviteCode.trim();
    if (!code || busy) return;
    setFormError('');
    setBusy(true);
    try {
      const result = await joinByCode(code);
      onOpenChange(false);
      onJoinPending(result.group.name);
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={isOpen}
      onRequestClose={() => onOpenChange(false)}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => onOpenChange(false)}
          accessibilityLabel="Đóng"
        />
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <View style={styles.header}>
            <AppText variant="subtitle" weight="semibold">
              {mode === 'create' ? 'Tạo nhóm mới' : 'Tham gia nhóm'}
            </AppText>
            <Pressable
              onPress={() => onOpenChange(false)}
              style={styles.closeBtn}
              accessibilityLabel="Đóng"
            >
              <X size={20} color={c.muted} />
            </Pressable>
          </View>

          <View style={styles.body}>
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
                  <AppTextField
                    placeholder="Tên nhóm mới"
                    value={groupName}
                    onChangeText={setGroupName}
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                    accessibilityLabel="Tên nhóm mới"
                  />
                  {formError ? (
                    <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                      <AppText variant="caption" tone="danger">{formError}</AppText>
                    </View>
                  ) : null}
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
                  <AppTextField
                    placeholder="a1b2c3"
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleJoin}
                    accessibilityLabel="Mã mời"
                  />
                  {formError ? (
                    <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                      <AppText variant="caption" tone="danger">{formError}</AppText>
                    </View>
                  ) : null}
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
  },
  body: {
    paddingHorizontal: 20,
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
