import { Button, useToast } from 'heroui-native';
import { X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { EXPENSE_CATEGORIES as CATEGORIES, type ExpenseCategory } from '../../config/constants';
import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupMember } from '../../services/group.service';
import { usePresetStore } from '../../stores/preset.store';
import { getErrorMessage } from '../../utils/error';
import { hapticSuccess } from '../../utils/haptics';
import {
  type RatioMember,
  splitByRatio,
  splitEqual,
  type SplitResult,
  validateAmount,
  validateSplits,
} from '../../utils/split';
import { AppText, AppTextField, BouncyDialog, ChipPicker, Money } from '../ui';

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

interface PresetPromptData {
  title: string;
  amount: number;
  category: ExpenseCategory;
}

export function ExpenseFormSheet({
  isOpen, onOpenChange, tripId, groupId, members, onSubmit,
}: ExpenseFormSheetProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const { presets, loaded: presetsLoaded, loadPresets, addPreset } = usePresetStore();

  const [step, setStep] = useState<'basic' | 'split'>('basic');
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [paidBy, setPaidBy] = useState('');
  const [note, setNote] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [presetPrompt, setPresetPrompt] = useState<PresetPromptData | null>(null);

  const memberOptions = members.map((m) => ({ key: m.id, label: m.display_name }));
  const presetTitles = useMemo(() => new Set(presets.map((p) => p.title)), [presets]);

  useEffect(() => {
    if (!isOpen) return;
    if (!presetsLoaded) {
      loadPresets().catch(() => { /* silent */ });
    }
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
    setFormError('');
  }, [isOpen, members, presetsLoaded, loadPresets]);

  const handleApplyPreset = useCallback(
    (preset: { title: string; amount: number; category: ExpenseCategory }) => {
      setTitle(preset.title);
      setAmountStr(String(preset.amount));
      setCategory(preset.category);
      setFormError('');
    },
    [],
  );

  const handleSavePresetPrompt = useCallback(async () => {
    if (!presetPrompt) return;
    try {
      await addPreset(presetPrompt);
      toast.show({ variant: 'success', label: 'Đã lưu preset', description: presetPrompt.title });
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    } finally {
      setPresetPrompt(null);
    }
  }, [presetPrompt, addPreset, toast]);

  const splitInputStyle = [styles.splitInput, {
    color: c.foreground,
    borderColor: c.divider,
    backgroundColor: c.background,
    fontFamily: fonts.regular,
  }];

  const handleContinue = useCallback(() => {
    setFormError('');
    if (!title.trim()) {
      setFormError('Vui lòng nhập tên khoản chi');
      return;
    }
    if (!amountStr.trim()) {
      setFormError('Vui lòng nhập số tiền');
      return;
    }
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      setFormError('Số tiền phải lớn hơn 0');
      return;
    }
    const amountErr = validateAmount(amount);
    if (amountErr) {
      setFormError(amountErr);
      return;
    }
    if (!paidBy) {
      setFormError('Vui lòng chọn người trả');
      return;
    }
    setStep('split');
  }, [title, amountStr, paidBy]);

  const handleSubmit = useCallback(async () => {
    setFormError('');
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
      setFormError(err);
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        tripId, groupId,
        title: title.trim(), amount, category, paidByMemberId: paidBy,
        splitType, splits, note: note.trim() || undefined,
      });
      const submittedTitle = title.trim();
      const submittedAmount = amount;
      const submittedCategory = category;
      onOpenChange(false);
      hapticSuccess();
      toast.show({ variant: 'success', label: 'Đã thêm khoản chi', description: submittedTitle });
      if (!presetTitles.has(submittedTitle)) {
        setPresetPrompt({
          title: submittedTitle,
          amount: submittedAmount,
          category: submittedCategory,
        });
      }
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [amountStr, members, splitType, ratios, customAmounts, title, category, paidBy, note, tripId, groupId, onSubmit, onOpenChange, toast, presetTitles]);

  const amount = parseInt(amountStr, 10) || 0;

  const ratioPreview =
    splitType === 'ratio' && amount > 0
      ? splitByRatio(
          amount,
          members.map((m) => ({
            memberId: m.id,
            ratio: parseInt(ratios[m.id] || '1', 10) || 1,
          })),
        )
      : [];

  return (
    <>
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
            <View>
              <AppText variant="subtitle" weight="semibold">
                {step === 'basic' ? 'Thêm khoản chi' : 'Cách chia'}
              </AppText>
              <AppText variant="meta" tone="muted">
                Bước {step === 'basic' ? '1' : '2'}/2
              </AppText>
            </View>
            <Pressable
              onPress={() => onOpenChange(false)}
              style={styles.closeBtn}
              accessibilityLabel="Đóng"
            >
              <X size={20} color={c.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 'basic' ? (
              <View style={styles.formArea}>
                {presets.length > 0 ? (
                  <View>
                    <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                      Preset
                    </AppText>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.presetRow}
                    >
                      {presets.map((p) => (
                        <Pressable
                          key={p.id}
                          style={[
                            styles.presetChip,
                            { backgroundColor: c.surfaceAlt, borderColor: c.divider },
                          ]}
                          onPress={() =>
                            handleApplyPreset({ title: p.title, amount: p.amount, category: p.category })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Áp dụng preset ${p.title}`}
                        >
                          <AppText variant="caption" weight="semibold">{p.title}</AppText>
                          <AppText variant="meta" tone="muted">
                            {p.amount.toLocaleString('vi-VN')}đ
                          </AppText>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                <AppTextField
                  placeholder="Tên khoản chi"
                  value={title}
                  onChangeText={setTitle}
                  accessibilityLabel="Tên khoản chi"
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
                  options={CATEGORIES}
                  selected={category}
                  onSelect={(k) => setCategory(k as ExpenseCategory)}
                />

                <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                  Người trả
                </AppText>
                <ChipPicker options={memberOptions} selected={paidBy} onSelect={setPaidBy} />

                <AppTextField
                  placeholder="Ghi chú (tùy chọn)"
                  value={note}
                  onChangeText={setNote}
                  accessibilityLabel="Ghi chú"
                />

                {formError ? (
                  <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                    <AppText variant="caption" tone="danger">{formError}</AppText>
                  </View>
                ) : null}

                <Button variant="primary" size="lg" onPress={handleContinue}>
                  <Button.Label>Tiếp tục</Button.Label>
                </Button>
              </View>
            ) : (
              <View style={styles.formArea}>
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

                {formError ? (
                  <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                    <AppText variant="caption" tone="danger">{formError}</AppText>
                  </View>
                ) : null}

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
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <BouncyDialog
      isOpen={!!presetPrompt}
      onClose={() => setPresetPrompt(null)}
    >
      <BouncyDialog.Title>Lưu làm preset?</BouncyDialog.Title>
      <BouncyDialog.Description>
        Lưu &quot;{presetPrompt?.title}&quot; ({presetPrompt?.amount.toLocaleString('vi-VN')}đ) để dùng nhanh lần sau.
      </BouncyDialog.Description>
      <BouncyDialog.Actions>
        <Button variant="ghost" size="sm" onPress={() => setPresetPrompt(null)}>
          <Button.Label>Bỏ qua</Button.Label>
        </Button>
        <Button variant="primary" size="sm" onPress={handleSavePresetPrompt}>
          <Button.Label>Lưu preset</Button.Label>
        </Button>
      </BouncyDialog.Actions>
    </BouncyDialog>
    </>
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
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 12,
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
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  formArea: {
    gap: 12,
  },
  fieldLabel: {
    marginTop: 4,
    marginBottom: -4,
  },
  presetRow: {
    gap: 8,
    paddingTop: 6,
    paddingBottom: 4,
    paddingRight: 4,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 120,
    alignItems: 'flex-start',
    gap: 2,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
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
