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
import { AppText, AppTextField } from '../ui';

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

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setBusy(false);
    setFormError('');
  }, [isOpen]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
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
              Thêm thành viên ảo
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
            <AppText variant="caption" tone="muted" style={styles.hint}>
              Tạo thành viên không cần tài khoản — dùng khi bạn quản lý chi tiêu cho người chưa cài app.
            </AppText>
            <AppTextField
              placeholder="Tên hiển thị"
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              accessibilityLabel="Tên thành viên ảo"
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
              isDisabled={busy || !name.trim()}
            >
              <Button.Label>{busy ? 'Đang tạo...' : 'Tạo thành viên'}</Button.Label>
            </Button>
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
