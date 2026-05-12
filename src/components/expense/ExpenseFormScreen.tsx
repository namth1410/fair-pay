import { File } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { Button, Switch, useToast } from 'heroui-native';
import { ChevronLeft, ImagePlus, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  AppTextField,
  ChipPicker,
  Money,
  MoneyChipsDock,
  MoneyTextField,
} from '../ui';
import {
  EXPENSE_CATEGORIES as CATEGORIES,
  type ExpenseCategory,
} from '../../config/constants';
import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  removeExpenseImage,
  requestExpenseImageUploadUrl,
} from '../../services/expenseImage.service';
import { useGroupStore } from '../../stores/group.store';
import { usePresetStore } from '../../stores/preset.store';
import { useTripStore } from '../../stores/trip.store';
import { getErrorMessage } from '../../utils/error';
import { hapticSuccess } from '../../utils/haptics';
import {
  type AvatarSource,
  compressForUpload,
  pickImage,
} from '../../utils/imageProcessing';
import {
  type RatioMember,
  splitByRatio,
  splitEqual,
  type SplitResult,
  validateAmount,
  validateSplits,
} from '../../utils/split';
import { ImagePickerSheet } from '../common/ImagePickerSheet';
import { AddToField } from './AddToField';

const SPLIT_TYPE_OPTIONS = [
  { key: 'equal' as const, label: 'Đều' },
  { key: 'ratio' as const, label: 'Tỷ lệ' },
  { key: 'custom' as const, label: 'Tùy chỉnh' },
];

type SplitType = 'equal' | 'ratio' | 'custom';

interface PendingImage {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
}

interface ExpenseFormScreenProps {
  initialTripId?: string;
  initialImage?: PendingImage | null;
  presetExpenseId?: string;
}

export function ExpenseFormScreen({
  initialTripId,
  initialImage,
  presetExpenseId,
}: ExpenseFormScreenProps) {
  const c = useAppTheme();
  const { toast } = useToast();

  const trips = useTripStore((s) => s.trips);
  const addExpense = useTripStore((s) => s.addExpense);
  const loadMembers = useGroupStore((s) => s.loadMembers);

  const initialTrip = initialTripId
    ? trips.find((t) => t.id === initialTripId)
    : undefined;

  // Khi vào từ /trips/[id]/expenses/new — initialTripId đã có context.
  // Khi vào từ /expenses/new — user phải chọn qua AddToField.
  const [currentTripId, setCurrentTripId] = useState<string | undefined>(initialTripId);
  const [currentGroupId, setCurrentGroupId] = useState<string | undefined>(
    initialTrip?.group_id,
  );
  const [currentTripName, setCurrentTripName] = useState<string | undefined>(
    initialTrip?.name,
  );
  const [currentGroupName, setCurrentGroupName] = useState<string | undefined>(
    undefined,
  );

  // Pre-gen UUID dùng cho path R2 trước khi insert. Lock 1 lần ở mount.
  const [presetId] = useState<string | undefined>(presetExpenseId);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(
    initialImage ?? null,
  );
  const [imageSheetOpen, setImageSheetOpen] = useState(false);

  const members = useGroupStore((s) => s.currentGroupMembers);
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
  const [savePreset, setSavePreset] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);

  const memberOptions = members.map((m) => ({ key: m.id, label: m.display_name }));
  const presetTitles = useMemo(() => new Set(presets.map((p) => p.title)), [presets]);
  const trimmedTitle = title.trim();
  const presetConflict =
    savePreset && trimmedTitle.length > 0 && presetTitles.has(trimmedTitle);

  useEffect(() => {
    if (!presetsLoaded) loadPresets().catch(() => {});
  }, [presetsLoaded, loadPresets]);

  // Khi đổi group qua AddToField, load lại members + reset paidBy.
  useEffect(() => {
    if (!currentGroupId) return;
    loadMembers(currentGroupId).catch(() => {});
  }, [currentGroupId, loadMembers]);

  // Default paidBy về member đầu khi members load xong (lần đầu hoặc đổi group).
  useEffect(() => {
    const first = members[0];
    if (!first) {
      if (paidBy) setPaidBy('');
      return;
    }
    if (!paidBy || !members.some((m) => m.id === paidBy)) {
      setPaidBy(first.id);
      // Đổi group → reset split state vì memberIds đã đổi.
      setRatios({});
      setCustomAmounts({});
    }
  }, [members, paidBy]);

  const handlePickTrip = useCallback(
    (groupId: string, groupName: string, tripId: string, tripName: string) => {
      setCurrentTripId(tripId);
      setCurrentGroupId(groupId);
      setCurrentTripName(tripName);
      setCurrentGroupName(groupName);
    },
    [],
  );

  const handleClearTrip = useCallback(() => {
    setCurrentTripId(undefined);
    setCurrentGroupId(undefined);
    setCurrentTripName(undefined);
    setCurrentGroupName(undefined);
    setPaidBy('');
  }, []);

  const handlePickImage = useCallback(async (source: AvatarSource) => {
    try {
      const picked = await pickImage(source);
      if (!picked) return;
      setPendingImage({
        uri: picked.uri,
        width: picked.width,
        height: picked.height,
        sizeBytes: picked.sizeBytes,
      });
    } catch (e) {
      toast.show({ variant: 'danger', label: 'Lỗi chọn ảnh', description: getErrorMessage(e) });
    }
  }, [toast]);

  const handleApplyPreset = useCallback(
    (preset: { title: string; amount: number; category: ExpenseCategory }) => {
      setTitle(preset.title);
      setAmountStr(String(preset.amount));
      setCategory(preset.category);
      setFormError('');
      setSavePreset(false);
    },
    [],
  );

  const splitInputStyle = [
    styles.splitInput,
    {
      color: c.foreground,
      borderColor: c.divider,
      backgroundColor: c.background,
      fontFamily: fonts.regular,
    },
  ];

  const requireTrip = !initialTripId;

  const handleContinue = useCallback(() => {
    setFormError('');
    if (requireTrip && !currentTripId) {
      return setFormError('Vui lòng chọn nhóm và chuyến');
    }
    if (!title.trim()) return setFormError('Vui lòng nhập tên khoản chi');
    if (!amountStr.trim()) return setFormError('Vui lòng nhập số tiền');
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) return setFormError('Số tiền phải lớn hơn 0');
    const amountErr = validateAmount(amount);
    if (amountErr) return setFormError(amountErr);
    if (!paidBy) return setFormError('Vui lòng chọn người trả');
    if (presetConflict)
      return setFormError(
        'Đã có preset tên này, đổi tên hoặc bỏ tick "Lưu làm preset"',
      );
    setStep('split');
  }, [requireTrip, currentTripId, title, amountStr, paidBy, presetConflict]);

  const handleSubmit = useCallback(async () => {
    setFormError('');
    if (!currentTripId || !currentGroupId) {
      setFormError('Không tìm thấy chuyến đi');
      return;
    }
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
      const submittedTitle = title.trim();
      const submittedAmount = amount;
      const submittedCategory = category;

      let imageUrl: string | null = null;
      let uploadedExpenseId: string | undefined = presetId;
      if (pendingImage && presetId) {
        // Compress ngay trước upload — defer khỏi UX critical path để preview nhanh.
        const compressed = await compressForUpload(
          pendingImage.uri,
          pendingImage.width,
          pendingImage.height,
        );
        const presign = await requestExpenseImageUploadUrl(
          presetId,
          currentTripId,
          compressed.sizeBytes,
        );
        const file = new File(compressed.uri);
        const arrayBuffer = await file.arrayBuffer();
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          body: arrayBuffer,
          headers: { 'Content-Type': 'image/jpeg' },
        });
        if (!putRes.ok) {
          throw new Error(`Tải ảnh thất bại (${putRes.status})`);
        }
        imageUrl = presign.publicUrl;
        uploadedExpenseId = presetId;
      }

      try {
        await addExpense({
          id: uploadedExpenseId,
          tripId: currentTripId,
          groupId: currentGroupId,
          title: submittedTitle,
          amount,
          category,
          paidByMemberId: paidBy,
          splitType,
          splits,
          note: note.trim() || undefined,
          imageUrl,
        });
      } catch (insertErr) {
        if (imageUrl && uploadedExpenseId) {
          removeExpenseImage(uploadedExpenseId).catch(() => {});
        }
        throw insertErr;
      }

      hapticSuccess();
      toast.show({
        variant: 'success',
        label: 'Đã thêm khoản chi',
        description: submittedTitle,
      });
      if (savePreset && !presetTitles.has(submittedTitle)) {
        try {
          await addPreset({
            title: submittedTitle,
            amount: submittedAmount,
            category: submittedCategory,
          });
          toast.show({
            variant: 'success',
            label: 'Đã lưu preset',
            description: submittedTitle,
          });
        } catch (e: unknown) {
          toast.show({
            variant: 'danger',
            label: 'Lỗi lưu preset',
            description: getErrorMessage(e),
          });
        }
      }
      router.back();
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [
    amountStr,
    members,
    splitType,
    ratios,
    customAmounts,
    title,
    category,
    paidBy,
    note,
    currentTripId,
    currentGroupId,
    addExpense,
    toast,
    presetTitles,
    savePreset,
    addPreset,
    pendingImage,
    presetId,
  ]);

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

  const continueDisabled = presetConflict || (requireTrip && !currentTripId);

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: c.background }]}>
      <Stack.Screen
        options={{
          headerTitle: step === 'basic' ? 'Thêm khoản chi' : 'Cách chia',
          headerLeft: () => (
            <Pressable
              onPress={() => (step === 'split' ? setStep('basic') : router.back())}
              style={styles.headerBtn}
              accessibilityLabel="Quay lại"
              hitSlop={8}
            >
              <ChevronLeft size={24} color={c.foreground} />
            </Pressable>
          ),
          headerRight: () => null,
        }}
      />
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={amountFocused ? 70 : 20}
      >
          {step === 'basic' ? (
            <Animated.View entering={FadeInDown.duration(260)} style={styles.formArea}>
              <AppText variant="meta" tone="muted">
                Bước 1/2 · Thông tin cơ bản
              </AppText>

              {requireTrip ? (
                <AddToField
                  currentTripId={currentTripId}
                  currentGroupId={currentGroupId}
                  currentTripName={currentTripName}
                  currentGroupName={currentGroupName}
                  onPick={handlePickTrip}
                  onClear={handleClearTrip}
                />
              ) : null}

              <ImageField
                pendingImage={pendingImage}
                onOpen={() => setImageSheetOpen(true)}
                onRemove={() => setPendingImage(null)}
                c={c}
              />

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
                          handleApplyPreset({
                            title: p.title,
                            amount: p.amount,
                            category: p.category,
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Áp dụng preset ${p.title}`}
                      >
                        <AppText variant="caption" weight="semibold">
                          {p.title}
                        </AppText>
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
              <MoneyTextField
                placeholder="Số tiền (VND)"
                value={amountStr}
                onChangeText={setAmountStr}
                showSuggestions={false}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
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
              {members.length > 0 ? (
                <ChipPicker options={memberOptions} selected={paidBy} onSelect={setPaidBy} />
              ) : (
                <AppText variant="caption" tone="muted">
                  {requireTrip && !currentTripId
                    ? 'Chọn nhóm để xem thành viên'
                    : 'Đang tải thành viên...'}
                </AppText>
              )}

              <AppTextField
                placeholder="Ghi chú (tùy chọn)"
                value={note}
                onChangeText={setNote}
                accessibilityLabel="Ghi chú"
              />

              <Pressable
                style={styles.savePresetRow}
                onPress={() => setSavePreset((v) => !v)}
                accessibilityRole="switch"
                accessibilityState={{ checked: savePreset }}
                accessibilityLabel="Lưu làm preset"
              >
                <View style={styles.savePresetInfo}>
                  <AppText variant="body" weight="medium">
                    Lưu làm preset
                  </AppText>
                  <AppText variant="meta" tone="muted" style={styles.savePresetHint}>
                    {presetConflict
                      ? 'Đã có preset tên này, đổi tên hoặc tắt tùy chọn'
                      : 'Dùng nhanh khoản chi này lần sau'}
                  </AppText>
                </View>
                <View pointerEvents="none">
                  <Switch isSelected={savePreset} onSelectedChange={setSavePreset} />
                </View>
              </Pressable>

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
                onPress={handleContinue}
                isDisabled={continueDisabled}
              >
                <Button.Label>Tiếp tục</Button.Label>
              </Button>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(260)} style={styles.formArea}>
              <AppText variant="meta" tone="muted">
                Bước 2/2 · Cách chia
              </AppText>

              <View style={[styles.summaryBox, { backgroundColor: c.surfaceAlt }]}>
                <AppText variant="body" weight="semibold">
                  {title}
                </AppText>
                <Money value={amount} variant="default" tone="primary" />
              </View>

              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                Cách chia
              </AppText>
              <ChipPicker
                options={SPLIT_TYPE_OPTIONS}
                selected={splitType}
                onSelect={setSplitType}
              />

              {splitType === 'equal' && (
                <AppText variant="caption" tone="muted" center>
                  Chia đều cho {members.length} người
                  {amount > 0
                    ? ` · ${Math.floor(amount / members.length).toLocaleString('vi-VN')}₫/người`
                    : ''}
                </AppText>
              )}

              {splitType === 'ratio' && (
                <View style={styles.splitSection}>
                  <AppText variant="caption" tone="muted" center>
                    Nhập tỷ lệ cho mỗi người (VD: 2 = gấp đôi)
                  </AppText>
                  {members.map((m) => (
                    <View key={m.id} style={styles.splitRow}>
                      <AppText variant="body" style={styles.splitName}>
                        {m.display_name}
                      </AppText>
                      <TextInput
                        style={splitInputStyle}
                        placeholder="1"
                        placeholderTextColor={c.muted}
                        value={ratios[m.id] || ''}
                        onChangeText={(v) =>
                          setRatios((prev) => ({ ...prev, [m.id]: v }))
                        }
                        keyboardType="number-pad"
                        accessibilityLabel={`Tỷ lệ ${m.display_name}`}
                      />
                      {amount > 0 && (
                        <View style={styles.splitPreview}>
                          <Money
                            value={
                              ratioPreview.find((s) => s.memberId === m.id)?.amount ?? 0
                            }
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
                      <AppText variant="body" style={styles.splitName}>
                        {m.display_name}
                      </AppText>
                      <TextInput
                        style={[splitInputStyle, { fontFamily: fonts.bold }]}
                        placeholder="0"
                        placeholderTextColor={c.muted}
                        value={customAmounts[m.id] || ''}
                        onChangeText={(v) =>
                          setCustomAmounts((prev) => ({ ...prev, [m.id]: v }))
                        }
                        keyboardType="number-pad"
                        accessibilityLabel={`Số tiền ${m.display_name}`}
                      />
                    </View>
                  ))}
                  {amount > 0 &&
                    (() => {
                      const sum = members.reduce(
                        (s, m) => s + (parseInt(customAmounts[m.id] || '0', 10) || 0),
                        0,
                      );
                      const balanced = sum === amount;
                      return (
                        <View style={styles.customTotal}>
                          <AppText
                            variant="caption"
                            tone={balanced ? 'success' : 'danger'}
                            weight="medium"
                            center
                          >
                            Tổng chia: {sum.toLocaleString('vi-VN')}₫ /{' '}
                            {amount.toLocaleString('vi-VN')}₫
                          </AppText>
                        </View>
                      );
                    })()}
                </View>
              )}

              {formError ? (
                <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                  <AppText variant="caption" tone="danger">
                    {formError}
                  </AppText>
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
                  isDisabled={busy || presetConflict}
                  style={styles.submitButton}
                >
                  <Button.Label>{busy ? 'Đang lưu...' : 'Thêm khoản chi'}</Button.Label>
                </Button>
              </View>
            </Animated.View>
          )}
      </KeyboardAwareScrollView>
      <MoneyChipsDock
        visible={step === 'basic' && amountFocused}
        amountStr={amountStr}
        onPick={(amount) => setAmountStr(String(amount))}
      />
      <ImagePickerSheet
        isOpen={imageSheetOpen}
        onOpenChange={setImageSheetOpen}
        onPick={handlePickImage}
        onRemove={() => setPendingImage(null)}
        showRemove={!!pendingImage}
      />
    </SafeAreaView>
  );
}

interface ImageFieldProps {
  pendingImage: PendingImage | null;
  onOpen: () => void;
  onRemove: () => void;
  c: ReturnType<typeof useAppTheme>;
}

function ImageField({ pendingImage, onOpen, onRemove, c }: ImageFieldProps) {
  if (pendingImage) {
    return (
      <View style={styles.imagePreviewWrap}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Đổi ảnh đính kèm"
        >
          <Image
            source={{ uri: pendingImage.uri }}
            style={styles.imagePreview}
            resizeMode="cover"
          />
        </Pressable>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Bỏ ảnh đính kèm"
          hitSlop={8}
          style={[styles.imageRemoveBtn, { backgroundColor: c.foreground }]}
        >
          <X size={16} color={c.inverseForeground} strokeWidth={2.5} />
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Thêm ảnh hoá đơn"
      android_ripple={{ color: c.divider }}
      style={({ pressed }) => [
        styles.imagePlaceholder,
        {
          borderColor: c.divider,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <ImagePlus size={22} color={c.muted} />
      <AppText variant="caption" tone="muted">
        Thêm ảnh hoá đơn (tùy chọn)
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  formArea: {
    gap: 12,
  },
  imagePreviewWrap: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
  },
  imagePreview: {
    width: 160,
    height: 160,
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
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
  savePresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  savePresetInfo: { flex: 1, minWidth: 0 },
  savePresetHint: { marginTop: 2 },
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
