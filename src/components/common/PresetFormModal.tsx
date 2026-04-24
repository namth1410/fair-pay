import { Button, useToast } from 'heroui-native';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpensePreset } from '../../services/preset.service';
import { usePresetStore } from '../../stores/preset.store';
import { getErrorMessage } from '../../utils/error';
import { AppText, AppTextField, ChipPicker } from '../ui';

interface PresetFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nếu truyền vào là sửa; không truyền là tạo mới. */
  preset?: ExpensePreset | null;
}

export function PresetFormModal({ isOpen, onOpenChange, preset }: PresetFormModalProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const { addPreset, editPreset } = usePresetStore();

  const isEdit = !!preset;

  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (preset) {
      setTitle(preset.title);
      setAmountStr(String(preset.amount));
      setCategory(preset.category);
    } else {
      setTitle('');
      setAmountStr('');
      setCategory('food');
    }
    setError('');
    setBusy(false);
  }, [isOpen, preset]);

  const handleSubmit = useCallback(async () => {
    setError('');
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Vui lòng nhập tên preset');
      return;
    }
    if (!amountStr.trim()) {
      setError('Vui lòng nhập số tiền');
      return;
    }
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      setError('Số tiền phải lớn hơn 0');
      return;
    }
    if (amount % 1000 !== 0) {
      setError('Số tiền phải là bội của 1.000đ');
      return;
    }

    setBusy(true);
    try {
      if (isEdit && preset) {
        await editPreset(preset.id, { title: trimmed, amount, category });
        toast.show({ variant: 'success', label: 'Đã cập nhật preset', description: trimmed });
      } else {
        await addPreset({ title: trimmed, amount, category });
        toast.show({ variant: 'success', label: 'Đã thêm preset', description: trimmed });
      }
      onOpenChange(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [title, amountStr, category, isEdit, preset, addPreset, editPreset, onOpenChange, toast]);

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
              {isEdit ? 'Sửa preset' : 'Thêm preset'}
            </AppText>
            <Pressable
              onPress={() => onOpenChange(false)}
              style={styles.closeBtn}
              accessibilityLabel="Đóng"
            >
              <X size={20} color={c.muted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formArea}>
              <AppTextField
                placeholder="Tên preset"
                value={title}
                onChangeText={setTitle}
                accessibilityLabel="Tên preset"
                autoFocus={!isEdit}
              />
              <AppTextField
                placeholder="Số tiền (VND)"
                value={amountStr}
                onChangeText={setAmountStr}
                keyboardType="number-pad"
                accessibilityLabel="Số tiền"
              />

              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                Danh mục
              </AppText>
              <ChipPicker
                options={EXPENSE_CATEGORIES}
                selected={category}
                onSelect={(k) => setCategory(k as ExpenseCategory)}
              />

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                  <AppText variant="caption" tone="danger">{error}</AppText>
                </View>
              ) : null}

              <View style={styles.buttonRow}>
                <Button
                  variant="outline"
                  size="md"
                  onPress={() => onOpenChange(false)}
                  style={styles.cancelBtn}
                >
                  <Button.Label>Hủy</Button.Label>
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onPress={handleSubmit}
                  isDisabled={busy}
                  style={styles.submitBtn}
                >
                  <Button.Label>
                    {busy ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm'}
                  </Button.Label>
                </Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  closeBtn: { padding: 6, borderRadius: 20 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 12 },
  formArea: { gap: 12 },
  fieldLabel: { marginTop: 4, marginBottom: -4 },
  errorBox: { padding: 12, borderRadius: 10 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1 },
  submitBtn: { flex: 2 },
});
