import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet, Button, useToast } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpensePreset } from '../../services/preset.service';
import { usePresetStore } from '../../stores/preset.store';
import { getErrorMessage } from '../../utils/error';
import { formatThousands, parseMoneyInput } from '../../utils/format';
import { AppText, ChipPicker, MoneyChipsDock } from '../ui';

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

  const titleRef = useRef('');
  const [amountStr, setAmountStr] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [showInputs, setShowInputs] = useState(false);
  const [hasTitle, setHasTitle] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowInputs(false);
      setAmountFocused(false);
      return;
    }
    titleRef.current = preset?.title ?? '';
    setAmountStr(preset ? String(preset.amount) : '');
    setResetKey((k) => k + 1);
    setHasTitle(!!preset?.title);
    setCategory(preset?.category ?? 'food');
    setError('');
    setBusy(false);
  }, [isOpen, preset]);

  const handleTitleChange = (text: string) => {
    titleRef.current = text;
    const next = text.trim().length > 0;
    setHasTitle((prev) => (prev === next ? prev : next));
  };

  const handleAmountChange = (text: string) => {
    setAmountStr(parseMoneyInput(text));
  };

  const handlePickSuggestion = (amount: number) => {
    setAmountStr(String(amount));
  };

  const handleSubmit = async () => {
    if (busy) return;
    setError('');

    const trimmed = titleRef.current.trim();
    if (!trimmed) {
      setError('Vui lòng nhập tên preset');
      return;
    }
    if (!amountStr) {
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
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['60%', '90%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          onChange={(index) => setShowInputs(index >= 0)}
        >
          <BottomSheetScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <BottomSheet.Title>{isEdit ? 'Sửa preset' : 'Thêm preset'}</BottomSheet.Title>
            </View>

            <View style={styles.body}>
              {showInputs ? (
                <BottomSheetTextInput
                  key={`title-${resetKey}`}
                  placeholder="Tên preset"
                  placeholderTextColor={c.muted}
                  defaultValue={titleRef.current}
                  onChangeText={handleTitleChange}
                  returnKeyType="next"
                  accessibilityLabel="Tên preset"
                  autoFocus={!isEdit}
                  style={[
                    styles.input,
                    {
                      color: c.foreground,
                      backgroundColor: c.surfaceAlt,
                      borderColor: c.divider,
                    },
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.input,
                    { backgroundColor: c.surfaceAlt, borderColor: c.divider },
                  ]}
                />
              )}

              {showInputs ? (
                <BottomSheetTextInput
                  key={`amount-${resetKey}`}
                  placeholder="Số tiền (VND)"
                  placeholderTextColor={c.muted}
                  value={formatThousands(amountStr)}
                  onChangeText={handleAmountChange}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  accessibilityLabel="Số tiền"
                  style={[
                    styles.input,
                    {
                      color: c.foreground,
                      backgroundColor: c.surfaceAlt,
                      borderColor: c.divider,
                    },
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.input,
                    { backgroundColor: c.surfaceAlt, borderColor: c.divider },
                  ]}
                />
              )}

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
                  variant="secondary"
                  size="lg"
                  onPress={() => onOpenChange(false)}
                  isDisabled={busy}
                  style={styles.cancelBtn}
                >
                  <Button.Label>Hủy</Button.Label>
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onPress={handleSubmit}
                  isDisabled={busy || !hasTitle || !amountStr}
                  style={styles.submitBtn}
                >
                  <Button.Label>
                    {busy ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm'}
                  </Button.Label>
                </Button>
              </View>
            </View>
          </BottomSheetScrollView>
        </BottomSheet.Content>
        <MoneyChipsDock
          visible={isOpen && amountFocused}
          amountStr={amountStr}
          onPick={handlePickSuggestion}
        />
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
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  fieldLabel: {
    marginTop: 4,
    marginBottom: -4,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: { flex: 1 },
  submitBtn: { flex: 2 },
  scrollView: { flex: 1 },
});
