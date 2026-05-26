import * as Crypto from 'expo-crypto';
import { router, Stack, useNavigation } from 'expo-router';
import { Button, Switch } from 'heroui-native';
import { ChevronLeft, ImagePlus, MapPin, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpensePreset } from '../../services/preset.service';
import { useGroupStore } from '../../stores/group.store';
import { getPresetsForContext, usePresetStore } from '../../stores/preset.store';
import { useTripStore } from '../../stores/trip.store';
import { cancelStaged, stageExpenseImage } from '../../sync/imageStaging';
import { getErrorMessage } from '../../utils/error';
import { formatThousands, parseMoneyInput } from '../../utils/format';
import { hapticSuccess } from '../../utils/haptics';
import { showError, showSuccess } from '../../utils/toast';
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
import {
  AppText,
  ChipPicker,
  DismissKeyboardView,
  Money,
  MoneyChipsDock,
} from '../ui';
import { ConfirmDialog } from '../ui';
import { FloatingLabelInput, FloatingMoneyInput } from '../ui/floating';
import { AddToField } from './AddToField';
import { DateTimeField } from './DateTimeField';

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
  /** Pre-fill từ preset apply (URL params hoặc preset lookup). */
  prefillTitle?: string;
  prefillAmount?: number;
  /** Khi navigate kèm preset ID, form sẽ áp full data (paid_by + splits) khi members load xong. */
  applyPresetId?: string;
}

export function ExpenseFormScreen({
  initialTripId,
  initialImage,
  presetExpenseId,
  prefillTitle,
  prefillAmount,
  applyPresetId,
}: ExpenseFormScreenProps) {
  const c = useAppTheme();
  const navigation = useNavigation();

  const trips = useTripStore((s) => s.trips);
  const addExpense = useTripStore((s) => s.addExpense);
  const loadMembers = useGroupStore((s) => s.loadMembers);

  const initialTrip = initialTripId
    ? trips.find((t) => t.id === initialTripId)
    : undefined;

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

  // Mọi expense (kể cả tạo mới từ trip detail) đều có ID trước khi presign upload.
  // QuickAddActionSheet đã pre-gen + truyền qua URL (presetExpenseId); nếu route khác vào
  // form mà không có sẵn → tự sinh ở đây để image upload không bị skip.
  const [expenseId] = useState<string>(() => presetExpenseId ?? Crypto.randomUUID());
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(
    initialImage ?? null,
  );
  const [imageSheetOpen, setImageSheetOpen] = useState(false);

  const members = useGroupStore((s) => s.currentGroupMembers);
  const allPresets = usePresetStore((s) => s.presets);
  const presetsLoaded = usePresetStore((s) => s.loaded);
  const loadPresets = usePresetStore((s) => s.loadPresets);
  const addPreset = usePresetStore((s) => s.addPreset);

  const [title, setTitle] = useState(prefillTitle ?? '');
  const [amountStr, setAmountStr] = useState(
    prefillAmount !== undefined ? String(prefillAmount) : '',
  );
  const [paidBy, setPaidBy] = useState('');
  const [note, setNote] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [savePreset, setSavePreset] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);
  const [splitFocusedMemberId, setSplitFocusedMemberId] = useState<string | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [presetWarnings, setPresetWarnings] = useState<string[]>([]);
  const [date, setDate] = useState<Date>(() => new Date());
  const presetAppliedRef = useRef(false);
  const submittedRef = useRef(false);
  const bypassExitGuardRef = useRef(false);

  const memberOptions = members.map((m) => ({ key: m.id, label: m.display_name }));
  // Track focus per split-member row — đồng bộ identity handler để TextInput không
  // re-render khi focus/blur một input khác. onBlur trễ 80ms để khi user switch focus
  // giữa các input (B.focus chạy trước A.blur), state mới không bị overwrite về null.
  const splitInputHandlers = useMemo(() => {
    const map: Record<string, { onFocus: () => void; onBlur: () => void }> = {};
    members.forEach((m) => {
      const memberId = m.id;
      map[memberId] = {
        onFocus: () => setSplitFocusedMemberId(memberId),
        onBlur: () => {
          setTimeout(() => {
            setSplitFocusedMemberId((prev) => (prev === memberId ? null : prev));
          }, 80);
        },
      };
    });
    return map;
  }, [members]);
  const contextPresets = useMemo(
    () => getPresetsForContext(allPresets, { tripId: currentTripId ?? null }),
    [allPresets, currentTripId],
  );
  const globalTitlesSet = useMemo(
    () => new Set(allPresets.filter((p) => p.trip_id === null).map((p) => p.title)),
    [allPresets],
  );
  const trimmedTitle = title.trim();
  const presetConflict =
    savePreset && trimmedTitle.length > 0 && globalTitlesSet.has(trimmedTitle);

  useEffect(() => {
    if (!presetsLoaded) loadPresets().catch(() => {});
  }, [presetsLoaded, loadPresets]);

  const isDirty = useMemo(() => {
    if (title.trim()) return true;
    if (amountStr.trim()) return true;
    if (note.trim()) return true;
    if (pendingImage) return true;
    if (savePreset) return true;
    if (Object.values(ratios).some((v) => v && v.trim() !== '')) return true;
    if (Object.values(customAmounts).some((v) => v && v.trim() !== ''))
      return true;
    return false;
  }, [title, amountStr, note, pendingImage, savePreset, ratios, customAmounts]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void }) => {
      if (bypassExitGuardRef.current) {
        bypassExitGuardRef.current = false;
        return;
      }
      if (!isDirty || busy || submittedRef.current) return;
      e.preventDefault();
      setExitConfirm(true);
    });
    return unsub;
  }, [navigation, isDirty, busy]);

  // KHÔNG re-dispatch `e.data.action` đã capture: trong native-stack, re-dispatch
  // action cũ có thể pop 2 lần (back tới root xong thoát luôn app). An toàn hơn:
  // bật cờ bypass rồi `router.back()` để tạo GO_BACK action MỚI — listener phía trên
  // sẽ skip nhờ cờ và pop đúng 1 lần.
  const handleConfirmExit = useCallback(() => {
    setExitConfirm(false);
    bypassExitGuardRef.current = true;
    router.back();
  }, []);

  useEffect(() => {
    if (!currentGroupId) return;
    loadMembers(currentGroupId).catch(() => {});
  }, [currentGroupId, loadMembers]);

  // Default paidBy về member đầu khi members load xong.
  useEffect(() => {
    const first = members[0];
    if (!first) {
      if (paidBy) setPaidBy('');
      return;
    }
    if (!paidBy || !members.some((m) => m.id === paidBy)) {
      setPaidBy(first.id);
      setRatios({});
      setCustomAmounts({});
    }
  }, [members, paidBy]);

  /**
   * Apply full preset data (paid_by + splits) khi members load xong và preset trip match.
   * Chạy 1 lần khi presets + members ready. Fallback graceful nếu member rời/thiếu.
   */
  useEffect(() => {
    if (presetAppliedRef.current) return;
    if (!applyPresetId || !presetsLoaded || members.length === 0 || !currentTripId) return;

    const preset = allPresets.find((p) => p.id === applyPresetId);
    if (!preset) {
      presetAppliedRef.current = true;
      return;
    }
    if (preset.trip_id !== null && preset.trip_id !== currentTripId) {
      presetAppliedRef.current = true;
      return;
    }

    presetAppliedRef.current = true;
    applyPresetFullData(preset, members, {
      setPaidBy,
      setSplitType,
      setRatios,
      setCustomAmounts,
      setPresetWarnings,
    });
  }, [applyPresetId, presetsLoaded, allPresets, members, currentTripId]);

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
      showError(e, 'Lỗi chọn ảnh');
    }
  }, []);

  const handleApplyPreset = useCallback(
    (preset: ExpensePreset) => {
      setTitle(preset.title);
      setAmountStr(String(preset.amount));
      setFormError('');
      setSavePreset(false);
      // Trip-pinned full preset → apply paid_by + splits (best-effort qua current members).
      if (preset.trip_id !== null && preset.trip_id === currentTripId && members.length > 0) {
        applyPresetFullData(preset, members, {
          setPaidBy,
          setSplitType,
          setRatios,
          setCustomAmounts,
          setPresetWarnings,
        });
      } else {
        setPresetWarnings([]);
      }
    },
    [currentTripId, members],
  );

  const requireTrip = !initialTripId;

  const handleSubmit = useCallback(async () => {
    setFormError('');
    if (requireTrip && !currentTripId) return setFormError('Vui lòng chọn nhóm và chuyến');
    if (!currentTripId || !currentGroupId) return setFormError('Không tìm thấy chuyến đi');
    if (!title.trim()) return setFormError('Vui lòng nhập tên khoản chi');
    if (!amountStr.trim()) return setFormError('Vui lòng nhập số tiền');
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) return setFormError('Số tiền phải lớn hơn 0');
    const amountErr = validateAmount(amount);
    if (amountErr) return setFormError(amountErr);
    if (!paidBy) return setFormError('Vui lòng chọn người trả');
    if (date.getTime() > Date.now() + 60_000)
      return setFormError('Không thể chọn ngày trong tương lai');
    if (presetConflict)
      return setFormError('Đã có preset tên này, đổi tên hoặc bỏ tick "Lưu làm preset"');
    Keyboard.dismiss();

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
    if (err) return setFormError(err);

    setBusy(true);
    try {
      const submittedTitle = title.trim();
      const submittedAmount = amount;

      // Local-first cho mọi flow: luôn stage ảnh vào local FileSystem +
      // pending_image_uploads. imageUploadWorker sẽ upload R2 ngầm sau khi
      // expense đã push lên server thành công.
      let imageUrl: string | null = null;
      if (pendingImage) {
        const compressed = await compressForUpload(
          pendingImage.uri,
          pendingImage.width,
          pendingImage.height,
        );
        imageUrl = await stageExpenseImage(expenseId, compressed.uri);
      }

      try {
        await addExpense({
          id: expenseId,
          tripId: currentTripId,
          groupId: currentGroupId,
          title: submittedTitle,
          amount,
          paidByMemberId: paidBy,
          splitType,
          splits,
          note: note.trim() || undefined,
          imageUrl,
          date: date.toISOString(),
        });
      } catch (insertErr) {
        if (pendingImage) {
          cancelStaged(expenseId).catch(() => {});
        }
        throw insertErr;
      }

      hapticSuccess();
      showSuccess('Đã thêm khoản chi', submittedTitle);
      submittedRef.current = true;
      if (savePreset && !globalTitlesSet.has(submittedTitle)) {
        try {
          await addPreset({
            title: submittedTitle,
            amount: submittedAmount,
          });
          showSuccess('Đã lưu preset', submittedTitle);
        } catch (e: unknown) {
          showError(e, 'Lỗi lưu preset');
        }
      }
      router.back();
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [
    requireTrip,
    amountStr,
    members,
    splitType,
    ratios,
    customAmounts,
    title,
    paidBy,
    note,
    date,
    currentTripId,
    currentGroupId,
    addExpense,
    globalTitlesSet,
    savePreset,
    addPreset,
    pendingImage,
    expenseId,
    presetConflict,
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

  const submitDisabled = busy || presetConflict || (requireTrip && !currentTripId);

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: c.background }]}>
      <Stack.Screen
        options={{
          headerTitle: 'Thêm khoản chi',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
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
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bottomOffset={amountFocused || splitFocusedMemberId ? 70 : 20}
      >
        <Animated.View entering={FadeInDown.duration(260)}>
        <DismissKeyboardView style={styles.formArea}>
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

          {presetWarnings.length > 0 ? (
            <View style={[styles.warningBox, { backgroundColor: c.surfaceAlt, borderColor: c.warning }]}>
              {presetWarnings.map((w, i) => (
                <AppText key={i} variant="caption" style={{ color: c.warning }}>
                  ⚠ {w}
                </AppText>
              ))}
            </View>
          ) : null}

          {contextPresets.length > 0 ? (
            <View>
              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                Preset
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}
              >
                {contextPresets.map((p) => {
                  const isTripPinned = p.trip_id !== null;
                  return (
                    <Pressable
                      key={p.id}
                      style={[
                        styles.presetChip,
                        { backgroundColor: c.surfaceAlt, borderColor: c.divider },
                      ]}
                      onPress={() => handleApplyPreset(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`Áp dụng preset ${p.title}`}
                    >
                      <AppText variant="caption" weight="semibold" numberOfLines={1}>
                        {p.title}
                      </AppText>
                      <AppText variant="meta" tone="muted">
                        {p.amount.toLocaleString('vi-VN')}đ
                      </AppText>
                      {isTripPinned ? (
                        <View style={styles.presetBadge}>
                          <MapPin size={9} color={c.primaryStrong} strokeWidth={2.5} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <FloatingLabelInput
            label="Tên khoản chi"
            value={title}
            onChangeText={setTitle}
            accessibilityLabel="Tên khoản chi"
          />
          <FloatingMoneyInput
            label="Số tiền (VND)"
            value={amountStr}
            onChangeText={setAmountStr}
            showSuggestions={false}
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
            accessibilityLabel="Số tiền"
          />

          <DateTimeField value={date} onChange={setDate} maxDate={new Date()} />

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

          <FloatingLabelInput
            label="Ghi chú (tùy chọn)"
            value={note}
            onChangeText={setNote}
            accessibilityLabel="Ghi chú"
            multiline
          />

          {members.length > 0 && amount > 0 ? (
            <>
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
                  Chia đều cho {members.length} người ·{' '}
                  {Math.floor(amount / members.length).toLocaleString('vi-VN')}₫/người
                </AppText>
              )}

              {splitType === 'ratio' && (
                <View style={styles.splitSection}>
                  <AppText variant="caption" tone="muted" center>
                    Nhập tỷ lệ cho mỗi người (VD: 2 = gấp đôi)
                  </AppText>
                  {members.map((m) => (
                    <View key={m.id} style={styles.splitRow}>
                      <AppText variant="body" style={styles.splitName} numberOfLines={1}>
                        {m.display_name}
                      </AppText>
                      <View
                        style={[
                          styles.splitInputWrap,
                          styles.splitInputWrapRatio,
                          { backgroundColor: c.surface, borderColor: c.divider },
                        ]}
                      >
                        <TextInput
                          style={[styles.splitInputField, { color: c.foreground }]}
                          placeholder="1"
                          placeholderTextColor={c.muted}
                          value={ratios[m.id] || ''}
                          onChangeText={(v) =>
                            setRatios((prev) => ({ ...prev, [m.id]: v.replace(/\D/g, '') }))
                          }
                          onFocus={splitInputHandlers[m.id]?.onFocus}
                          onBlur={splitInputHandlers[m.id]?.onBlur}
                          keyboardType="number-pad"
                          maxLength={2}
                          accessibilityLabel={`Tỷ lệ ${m.display_name}`}
                        />
                        <AppText variant="caption" tone="muted" style={styles.splitInputSuffix}>
                          phần
                        </AppText>
                      </View>
                      <View style={styles.splitPreview}>
                        <Money
                          value={ratioPreview.find((s) => s.memberId === m.id)?.amount ?? 0}
                          variant="compact"
                          tone="muted"
                        />
                      </View>
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
                      <AppText variant="body" style={styles.splitName} numberOfLines={1}>
                        {m.display_name}
                      </AppText>
                      <View
                        style={[
                          styles.splitInputWrap,
                          styles.splitInputWrapCustom,
                          { backgroundColor: c.surface, borderColor: c.divider },
                        ]}
                      >
                        <TextInput
                          style={[
                            styles.splitInputField,
                            { color: c.foreground, fontFamily: fonts.bold },
                          ]}
                          placeholder="0"
                          placeholderTextColor={c.muted}
                          value={formatThousands(customAmounts[m.id] || '')}
                          onChangeText={(v) =>
                            setCustomAmounts((prev) => ({ ...prev, [m.id]: parseMoneyInput(v) }))
                          }
                          onFocus={splitInputHandlers[m.id]?.onFocus}
                          onBlur={splitInputHandlers[m.id]?.onBlur}
                          keyboardType="number-pad"
                          maxLength={12}
                          accessibilityLabel={`Số tiền ${m.display_name}`}
                        />
                        <AppText variant="caption" tone="muted" style={styles.splitInputSuffix}>
                          đ
                        </AppText>
                      </View>
                    </View>
                  ))}
                  {(() => {
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
            </>
          ) : null}

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
                  : 'Dùng nhanh khoản chi này lần sau (lưu làm preset toàn cục)'}
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
            onPress={handleSubmit}
            isDisabled={submitDisabled}
          >
            <Button.Label>{busy ? 'Đang lưu...' : 'Thêm khoản chi'}</Button.Label>
          </Button>
        </DismissKeyboardView>
        </Animated.View>
      </KeyboardAwareScrollView>
      <MoneyChipsDock
        visible={amountFocused}
        amountStr={amountStr}
        onPick={(v) => setAmountStr(String(v))}
      />
      <MoneyChipsDock
        visible={splitType === 'custom' && !!splitFocusedMemberId}
        amountStr={splitFocusedMemberId ? customAmounts[splitFocusedMemberId] || '' : ''}
        onPick={(amt) => {
          if (splitFocusedMemberId) {
            setCustomAmounts((p) => ({ ...p, [splitFocusedMemberId]: String(amt) }));
          }
        }}
      />
      <ImagePickerSheet
        isOpen={imageSheetOpen}
        onOpenChange={setImageSheetOpen}
        onPick={handlePickImage}
        onRemove={() => setPendingImage(null)}
        showRemove={!!pendingImage}
      />
      <ConfirmDialog
        isOpen={exitConfirm}
        onOpenChange={setExitConfirm}
        title="Thoát mà chưa lưu?"
        description="Dữ liệu đã nhập sẽ bị mất. Bạn có chắc muốn thoát?"
        confirmLabel="Thoát"
        cancelLabel="Ở lại"
        destructive
        onConfirm={handleConfirmExit}
      />
    </SafeAreaView>
  );
}

/**
 * Apply paid_by + splits từ preset vào state. Validate member active, fallback graceful.
 */
function applyPresetFullData(
  preset: ExpensePreset,
  members: { id: string }[],
  setters: {
    setPaidBy: (v: string) => void;
    setSplitType: (v: SplitType) => void;
    setRatios: (v: Record<string, string>) => void;
    setCustomAmounts: (v: Record<string, string>) => void;
    setPresetWarnings: (v: string[]) => void;
  },
): void {
  const activeIds = new Set(members.map((m) => m.id));
  const warnings: string[] = [];

  if (preset.paid_by_member_id && activeIds.has(preset.paid_by_member_id)) {
    setters.setPaidBy(preset.paid_by_member_id);
  } else if (preset.paid_by_member_id) {
    warnings.push('Người trả mặc định trong preset đã rời nhóm, đặt lại theo nhóm');
  }

  if (preset.split_type && preset.splits_data) {
    const allActive = preset.splits_data.every((s) => activeIds.has(s.member_id));
    if (allActive) {
      setters.setSplitType(preset.split_type);
      if (preset.split_type === 'ratio') {
        const r: Record<string, string> = {};
        preset.splits_data.forEach((s) => {
          r[s.member_id] = String(s.ratio ?? 1);
        });
        setters.setRatios(r);
      } else if (preset.split_type === 'custom') {
        const a: Record<string, string> = {};
        preset.splits_data.forEach((s) => {
          a[s.member_id] = String(s.amount ?? 0);
        });
        setters.setCustomAmounts(a);
      }
    } else {
      warnings.push('Cách chia trong preset có thành viên đã rời nhóm, đặt mặc định chia đều');
    }
  }

  setters.setPresetWarnings(warnings);
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
    position: 'relative',
  },
  presetBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  warningBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
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
  splitSection: {
    gap: 8,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  splitName: {
    flex: 1,
    minWidth: 0,
  },
  splitInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 6,
  },
  splitInputWrapRatio: { width: 96 },
  splitInputWrapCustom: { width: 148 },
  splitInputField: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    textAlign: 'right',
    padding: 0,
  },
  splitInputSuffix: { fontSize: 12 },
  splitPreview: {
    width: 80,
    alignItems: 'flex-end',
  },
  customTotal: {
    marginTop: 4,
    paddingVertical: 6,
  },
});
