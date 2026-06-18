import { BottomSheetScrollView, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupMember } from '../../services/group.service';
import { hapticSuccess } from '../../utils/haptics';
import { showError, showSuccess, showValidationError } from '../../utils/toast';
import { AppText, ChipPicker, DismissKeyboardView, Money, MoneyChipsDock } from '../ui';
import { FloatingBottomSheetInput, FloatingBottomSheetMoneyInput } from '../ui/floating';

interface BalanceEntry {
  memberId: string;
  memberName: string;
  balance: number;
}

interface RecordPaymentSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  groupId: string;
  members: GroupMember[];
  balances: BalanceEntry[];
  onAddPayment: (params: {
    tripId: string;
    groupId: string;
    fromMemberId: string;
    toMemberId: string;
    amount: number;
    note?: string;
  }) => Promise<void>;
  /** Prefill khi mở từ một đề xuất quyết toán (lớp "Sửa"). Rỗng = ghi nhận thủ công. */
  initialFromMemberId?: string;
  initialToMemberId?: string;
  initialAmount?: number;
  initialNote?: string;
}

export function RecordPaymentSheet({
  isOpen, onOpenChange,
  tripId, groupId,
  members, balances,
  onAddPayment,
  initialFromMemberId, initialToMemberId, initialAmount, initialNote,
}: RecordPaymentSheetProps) {
  const c = useAppTheme();

  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');
  // Money là number-pad → không có IME compose, state-tracked an toàn (cần cho MoneyChipsDock suggestions).
  const [amountStr, setAmountStr] = useState('');
  // Note có thể chứa tiếng Việt → uncontrolled qua ref + reset bằng key remount.
  const noteRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [amountFocused, setAmountFocused] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPayFrom(initialFromMemberId ?? '');
    setPayTo(initialToMemberId ?? '');
    setAmountStr(initialAmount ? String(initialAmount) : '');
    noteRef.current = initialNote ?? '';
    setAmountFocused(false);
    setBusy(false);
    setResetKey((k) => k + 1);
  }, [isOpen, initialFromMemberId, initialToMemberId, initialAmount, initialNote]);

  const memberOptions = members.map((m) => ({ key: m.id, label: m.display_name }));
  const getMemberName = (id: string) => members.find((m) => m.id === id)?.display_name || '?';

  const handleNoteChange = useCallback((text: string) => {
    noteRef.current = text;
  }, []);

  // Ô tiền là controlled (number-pad không có IME compose) → set state là đủ,
  // không cần remount như input uncontrolled.
  const handlePickAmount = useCallback((amount: number) => {
    setAmountStr(String(amount));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (busy) return;
    if (!payFrom || !payTo || !amountStr) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      showValidationError('Lỗi', 'Số tiền phải lớn hơn 0');
      return;
    }
    if (payFrom === payTo) {
      showValidationError('Lỗi', 'Người trả và người nhận không được giống nhau');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    try {
      await onAddPayment({
        tripId, groupId,
        fromMemberId: payFrom, toMemberId: payTo,
        amount,
        note: noteRef.current.trim() || undefined,
      });
      hapticSuccess();
      showSuccess('Đã ghi nhận thanh toán');
      onOpenChange(false);
    } catch (e: unknown) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }, [busy, payFrom, payTo, amountStr, tripId, groupId, onAddPayment, onOpenChange]);

  const showPreview = !!(payFrom && payTo && payFrom !== payTo);
  const canSubmit = !!payFrom && !!payTo && amountStr.length > 0 && payFrom !== payTo;

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['75%', '95%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetView style={styles.header}>
            <BottomSheet.Title>Ghi nhận thanh toán</BottomSheet.Title>
          </BottomSheetView>

          <BottomSheetScrollView
            contentContainerStyle={styles.body}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <DismissKeyboardView>
              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>Người trả tiền</AppText>
              <ChipPicker options={memberOptions} selected={payFrom} onSelect={setPayFrom} />

              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>Người nhận tiền</AppText>
              <ChipPicker
                options={memberOptions}
                selected={payTo}
                onSelect={setPayTo}
                activeColor={c.success}
                activeSoft={c.successSoft}
              />

              <View style={styles.inputWrap}>
                <FloatingBottomSheetMoneyInput
                  label="Số tiền (VND)"
                  value={amountStr}
                  onChangeText={setAmountStr}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  returnKeyType="done"
                  accessibilityLabel="Số tiền thanh toán"
                  surfaceColor={c.surface}
                />
              </View>

              <View style={styles.inputWrap}>
                <FloatingBottomSheetInput
                  key={`note-${resetKey}`}
                  label="Ghi chú (VD: Chuyển khoản Momo)"
                  defaultValue={initialNote ?? ''}
                  onChangeText={handleNoteChange}
                  returnKeyType="done"
                  accessibilityLabel="Ghi chú thanh toán"
                  surfaceColor={c.surface}
                />
              </View>

              {showPreview && (
                <View style={[styles.previewBox, { backgroundColor: c.surfaceAlt }]}>
                  <AppText variant="meta" tone="muted" style={styles.previewLabel}>Số dư hiện tại</AppText>
                  {[payFrom, payTo].map((memberId) => {
                    const bal = balances.find((b) => b.memberId === memberId)?.balance || 0;
                    return (
                      <View key={memberId} style={styles.previewRow}>
                        <AppText variant="caption">{getMemberName(memberId)}</AppText>
                        <Money
                          value={Math.abs(bal)}
                          variant="compact"
                          tone={bal >= 0 ? 'success' : 'danger'}
                          showSign
                        />
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.submitWrap}>
                <Button
                  variant="primary"
                  size="lg"
                  onPress={handleSubmit}
                  isDisabled={busy || !canSubmit}
                >
                  <Button.Label>{busy ? 'Đang ghi...' : 'Ghi nhận'}</Button.Label>
                </Button>
              </View>
            </DismissKeyboardView>
          </BottomSheetScrollView>
        </BottomSheet.Content>

        <MoneyChipsDock
          visible={isOpen && amountFocused}
          amountStr={amountStr}
          onPick={handlePickAmount}
        />
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  fieldLabel: { marginTop: 12, marginBottom: 6 },
  inputWrap: { marginTop: 14 },
  previewBox: { marginTop: 14, padding: 10, borderRadius: 10, gap: 2 },
  previewLabel: { marginBottom: 4 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  submitWrap: { marginTop: 18 },
});
