import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet, Button, useToast } from 'heroui-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupMember } from '../../services/group.service';
import { hapticSuccess } from '../../utils/haptics';
import { getErrorMessage } from '../../utils/error';
import {
  type RatioMember,
  splitByRatio,
  splitEqual,
  type SplitResult,
  validateAmount,
  validateSplits,
} from '../../utils/split';
import { AppText, ChipPicker, Money } from '../ui';

const CATEGORIES = [
  { key: 'food', label: 'Ăn uống' },
  { key: 'transport', label: 'Di chuyển' },
  { key: 'accommodation', label: 'Chỗ ở' },
  { key: 'fun', label: 'Vui chơi' },
  { key: 'shopping', label: 'Mua sắm' },
  { key: 'other', label: 'Khác' },
];

const SPLIT_TYPE_OPTIONS = [
  { key: 'equal' as const, label: 'Đều' },
  { key: 'ratio' as const, label: 'Tỷ lệ' },
  { key: 'custom' as const, label: 'Tùy chỉnh' },
];

type SplitType = 'equal' | 'ratio' | 'custom';

interface ExpenseFormSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  groupId: string;
  members: GroupMember[];
  onSubmit: (params: {
    tripId: string;
    groupId: string;
    title: string;
    amount: number;
    category: string;
    paidByMemberId: string;
    splitType: SplitType;
    splits: SplitResult[];
    note?: string;
  }) => Promise<void>;
}

export function ExpenseFormSheet({
  isOpen, onOpenChange, tripId, groupId, members, onSubmit,
}: ExpenseFormSheetProps) {
  const c = useAppTheme();
  const { toast } = useToast();

  const [step, setStep] = useState<'basic' | 'split'>('basic');
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('food');
  const [paidBy, setPaidBy] = useState('');
  const [note, setNote] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const snapPoints = useMemo(() => ['60%', '90%'], []);
  const memberOptions = useMemo(
    () => members.map((m) => ({ key: m.id, label: m.display_name })),
    [members],
  );

  // Reset all state when sheet opens
  useEffect(() => {
    if (!isOpen) return;
    setStep('basic');
    setTitle('');
    setAmountStr('');
    setCategory('food');
    setPaidBy(members[0]?.id || '');
    setNote('');
    setSplitType('equal');
    setRatios({});
    setCustomAmounts({});
    setBusy(false);
  }, [isOpen, members]);

  const inputStyle = {
    backgroundColor: c.background,
    borderColor: c.divider,
    color: c.foreground,
    fontFamily: fonts.regular,
    ...styles.input,
  };

  const splitInputStyle = [styles.splitInput, {
    color: c.foreground,
    borderColor: c.divider,
    backgroundColor: c.background,
  }];

  const handleContinue = useCallback(() => {
    if (!title.trim()) {
      toast.show({ variant: 'danger', label: 'Vui lòng nhập tên khoản chi' });
      return;
    }
    if (!amountStr.trim()) {
      toast.show({ variant: 'danger', label: 'Vui lòng nhập số tiền' });
      return;
    }
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      toast.show({ variant: 'danger', label: 'Số tiền phải lớn hơn 0' });
      return;
    }
    const amountErr = validateAmount(amount);
    if (amountErr) {
      toast.show({ variant: 'danger', label: amountErr });
      return;
    }
    if (!paidBy) {
      toast.show({ variant: 'danger', label: 'Vui lòng chọn người trả' });
      return;
    }
    setStep('split');
  }, [title, amountStr, paidBy]);

  const handleSubmit = useCallback(async () => {
    const amount = parseInt(amountStr, 10);
    const memberIds = members.map((m) => m.id);
    let splits: SplitResult[];

    if (splitType === 'ratio') {
      const ratioMembers: RatioMember[] = members.map((m) => ({
        memberId: m.id,
        ratio: parseInt(ratios[m.id] || '1', 10) || 1,
      }));
      splits = splitByRatio(amount, ratioMembers);
    } else if (splitType === 'custom') {
      splits = members.map((m) => ({
        memberId: m.id,
        amount: parseInt(customAmounts[m.id] || '0', 10) || 0,
      }));
    } else {
      splits = splitEqual(amount, memberIds);
    }

    const err = validateSplits(amount, splits);
    if (err) {
      toast.show({ variant: 'danger', label: err });
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        tripId, groupId,
        title: title.trim(), amount, category, paidByMemberId: paidBy,
        splitType, splits, note: note.trim() || undefined,
      });
      hapticSuccess();
      toast.show({ variant: 'success', label: 'Đã thêm khoản chi', description: title.trim() });
      onOpenChange(false);
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }, [amountStr, members, splitType, ratios, customAmounts, title, category, paidBy, note, tripId, groupId, onSubmit, onOpenChange]);

  const amount = parseInt(amountStr, 10) || 0;

  const ratioPreview = useMemo(() => {
    if (splitType !== 'ratio' || amount <= 0) return [];
    return splitByRatio(
      amount,
      members.map((m) => ({
        memberId: m.id,
        ratio: parseInt(ratios[m.id] || '1', 10) || 1,
      })),
    );
  }, [splitType, amount, members, ratios]);

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {isOpen && (
              <>
                {/* Step indicator */}
                <View style={styles.stepHeader}>
                  <AppText
                    variant="subtitle"
                    weight="semibold"
                  >
                    {step === 'basic' ? 'Thêm khoản chi' : 'Cách chia'}
                  </AppText>
                  <AppText variant="meta" tone="muted">
                    Bước {step === 'basic' ? '1' : '2'}/2
                  </AppText>
                </View>

                {step === 'basic' ? (
                  <View style={styles.formArea}>
                    <BottomSheetTextInput
                      placeholder="Tên khoản chi"
                      placeholderTextColor={c.muted}
                      value={title}
                      onChangeText={setTitle}
                      style={inputStyle}
                      accessibilityLabel="Tên khoản chi"
                    />
                    <BottomSheetTextInput
                      placeholder="Số tiền (VND)"
                      placeholderTextColor={c.muted}
                      value={amountStr}
                      onChangeText={setAmountStr}
                      keyboardType="number-pad"
                      style={inputStyle}
                      accessibilityLabel="Số tiền"
                    />

                    <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                      Danh mục
                    </AppText>
                    <ChipPicker options={CATEGORIES} selected={category} onSelect={setCategory} />

                    <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                      Người trả
                    </AppText>
                    <ChipPicker options={memberOptions} selected={paidBy} onSelect={setPaidBy} />

                    <BottomSheetTextInput
                      placeholder="Ghi chú (tùy chọn)"
                      placeholderTextColor={c.muted}
                      value={note}
                      onChangeText={setNote}
                      style={inputStyle}
                      accessibilityLabel="Ghi chú"
                    />

                    <Button
                      variant="primary"
                      size="lg"
                      onPress={handleContinue}
                    >
                      <Button.Label>Tiếp tục</Button.Label>
                    </Button>
                  </View>
                ) : (
                  <View style={styles.formArea}>
                    {/* Summary of step 1 */}
                    <View style={[styles.summaryBox, { backgroundColor: c.surfaceAlt }]}>
                      <AppText variant="body" weight="semibold">{title}</AppText>
                      <Money value={amount} variant="default" tone="primary" />
                    </View>

                    <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                      Cách chia
                    </AppText>
                    <ChipPicker options={SPLIT_TYPE_OPTIONS} selected={splitType} onSelect={setSplitType} />

                    {splitType === 'equal' && (
                      <AppText variant="caption" tone="muted" center>
                        Chia đều cho {members.length} người
                        {amount > 0 ? ` · ${Math.floor(amount / members.length).toLocaleString('vi-VN')}₫/người` : ''}
                      </AppText>
                    )}

                    {splitType === 'ratio' && (
                      <View style={styles.splitSection}>
                        <AppText variant="caption" tone="muted" center>
                          Nhập tỷ lệ cho mỗi người (VD: 2 = gấp đôi)
                        </AppText>
                        {members.map((m) => (
                          <View key={m.id} style={styles.splitRow}>
                            <AppText variant="body" style={styles.splitName}>{m.display_name}</AppText>
                            <TextInput
                              style={splitInputStyle}
                              placeholder="1"
                              placeholderTextColor={c.muted}
                              value={ratios[m.id] || ''}
                              onChangeText={(v) => setRatios((prev) => ({ ...prev, [m.id]: v }))}
                              keyboardType="number-pad"
                              accessibilityLabel={`Tỷ lệ ${m.display_name}`}
                            />
                            {amount > 0 && (
                              <View style={styles.splitPreview}>
                                <Money
                                  value={ratioPreview.find((s) => s.memberId === m.id)?.amount ?? 0}
                                  variant="compact"
                                  tone="muted"
                                />
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}

                    {splitType === 'custom' && (
                      <View style={styles.splitSection}>
                        <AppText variant="caption" tone="muted" center>
                          Nhập số tiền cụ thể cho mỗi người
                        </AppText>
                        {members.map((m) => (
                          <View key={m.id} style={styles.splitRow}>
                            <AppText variant="body" style={styles.splitName}>{m.display_name}</AppText>
                            <TextInput
                              style={splitInputStyle}
                              placeholder="0"
                              placeholderTextColor={c.muted}
                              value={customAmounts[m.id] || ''}
                              onChangeText={(v) => setCustomAmounts((prev) => ({ ...prev, [m.id]: v }))}
                              keyboardType="number-pad"
                              accessibilityLabel={`Số tiền ${m.display_name}`}
                            />
                          </View>
                        ))}
                        {amount > 0 && (() => {
                          const sum = members.reduce((s, m) => s + (parseInt(customAmounts[m.id] || '0', 10) || 0), 0);
                          const balanced = sum === amount;
                          return (
                            <View style={styles.customTotal}>
                              <AppText variant="caption" tone={balanced ? 'success' : 'danger'} weight="medium" center>
                                Tổng chia: {sum.toLocaleString('vi-VN')}₫ / {amount.toLocaleString('vi-VN')}₫
                              </AppText>
                            </View>
                          );
                        })()}
                      </View>
                    )}

                    <View style={styles.buttonRow}>
                      <Button
                        variant="outline"
                        size="md"
                        onPress={() => setStep('basic')}
                        style={styles.backButton}
                      >
                        <Button.Label>Quay lại</Button.Label>
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        onPress={handleSubmit}
                        isDisabled={busy}
                        style={styles.submitButton}
                      >
                        <Button.Label>{busy ? 'Đang thêm...' : 'Thêm khoản chi'}</Button.Label>
                      </Button>
                    </View>
                  </View>
                )}
              </>
            )}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  formArea: {
    paddingHorizontal: 4,
    paddingTop: 8,
    gap: 12,
  },
  fieldLabel: {
    marginTop: 4,
    marginBottom: -4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
  splitSection: {
    gap: 8,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 2,
  },
  splitName: {
    flex: 1,
  },
  splitInput: {
    width: 70,
    textAlign: 'center',
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  splitPreview: {
    width: 80,
    alignItems: 'flex-end',
  },
  customTotal: {
    marginTop: 4,
    paddingVertical: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  backButton: {
    flex: 1,
  },
  submitButton: {
    flex: 2,
  },
});
