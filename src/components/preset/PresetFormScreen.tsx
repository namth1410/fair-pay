import { router, Stack } from 'expo-router';
import { Button } from 'heroui-native';
import { Check, ChevronLeft } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { fetchGroupMembers, type GroupMember } from '../../services/group.service';
import type { PresetSplitType } from '../../services/preset.service';
import { fetchTrips, type Trip } from '../../services/trip.service';
import { useGroupStore } from '../../stores/group.store';
import { usePresetStore } from '../../stores/preset.store';
import type { PresetSplitEntry } from '../../types/database.types';
import { getErrorMessage } from '../../utils/error';
import { formatThousands, parseMoneyInput } from '../../utils/format';
import { showSuccess } from '../../utils/toast';
import { AppText, ChipPicker, DismissKeyboardView, MoneyChipsDock } from '../ui';
import { FloatingLabelInput, FloatingMoneyInput } from '../ui/floating';

interface PresetFormScreenProps {
  /** Nếu cung cấp → edit mode; preset được tra cứu trong store. */
  presetId?: string;
}

type Scope = 'global' | 'trip';
type SplitOpt = 'none' | PresetSplitType;

const SCOPE_OPTIONS: { key: Scope; label: string }[] = [
  { key: 'global', label: 'Mọi nhóm' },
  { key: 'trip', label: 'Gắn chuyến đi' },
];

const SPLIT_OPTIONS: { key: SplitOpt; label: string }[] = [
  { key: 'none', label: 'Không lưu' },
  { key: 'equal', label: 'Chia đều' },
  { key: 'ratio', label: 'Tỷ lệ' },
  { key: 'custom', label: 'Cố định' },
];

export function PresetFormScreen({ presetId }: PresetFormScreenProps) {
  const c = useAppTheme();
  const { addPreset, editPreset, presets, loaded: presetsLoaded } = usePresetStore();
  const groups = useGroupStore((s) => s.groups);
  const loadGroups = useGroupStore((s) => s.loadGroups);

  const preset = useMemo(
    () => (presetId ? presets.find((p) => p.id === presetId) ?? null : null),
    [presetId, presets],
  );
  const isEdit = !!preset;

  // Initialize state from preset (single-shot on mount; edit preset arrives in store before navigate)
  const [title, setTitle] = useState(preset?.title ?? '');
  const [amountStr, setAmountStr] = useState(preset ? String(preset.amount) : '');
  const [scope, setScope] = useState<Scope>(preset?.trip_id ? 'trip' : 'global');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(preset?.trip_id ?? null);
  const [tripList, setTripList] = useState<Trip[]>([]);
  const [memberList, setMemberList] = useState<GroupMember[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [paidByMemberId, setPaidByMemberId] = useState<string | null>(
    preset?.paid_by_member_id ?? null,
  );
  const [splitOpt, setSplitOpt] = useState<SplitOpt>(preset?.split_type ?? 'none');
  const [selectedSplitMembers, setSelectedSplitMembers] = useState<Set<string>>(
    () => new Set((preset?.splits_data ?? []).map((s) => s.member_id)),
  );
  const [ratios, setRatios] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {};
    (preset?.splits_data ?? []).forEach((s) => {
      if (s.ratio !== undefined) r[s.member_id] = String(s.ratio);
    });
    return r;
  });
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(() => {
    const a: Record<string, string> = {};
    (preset?.splits_data ?? []).forEach((s) => {
      if (s.amount !== undefined) a[s.member_id] = String(s.amount);
    });
    return a;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);
  const [splitFocusedMemberId, setSplitFocusedMemberId] = useState<string | null>(null);

  // Edit mode safety: nếu presetId được cung cấp nhưng store đã load và không
  // tìm thấy preset → preset có thể đã bị xóa hoặc id sai → quay về list.
  useEffect(() => {
    if (presetId && presetsLoaded && !preset) {
      router.back();
    }
  }, [presetId, presetsLoaded, preset]);

  useEffect(() => {
    if (groups.length === 0) loadGroups().catch(() => {});
  }, [groups.length, loadGroups]);

  // Khi đang sửa preset trip-pinned, suy ra group_id từ trip để fetch trips cho ChipPicker
  useEffect(() => {
    if (!preset?.trip_id || selectedGroupId !== null) return;
    let cancelled = false;
    (async () => {
      try {
        for (const g of groups) {
          const trips = await fetchTrips(g.id);
          if (cancelled) return;
          if (trips.some((t) => t.id === preset.trip_id)) {
            setSelectedGroupId(g.id);
            setTripList(trips);
            return;
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preset, groups, selectedGroupId]);

  // Khi chọn group → fetch trips
  useEffect(() => {
    if (scope !== 'trip' || !selectedGroupId) {
      if (scope !== 'trip') setTripList([]);
      return;
    }
    let cancelled = false;
    setTripsLoading(true);
    fetchTrips(selectedGroupId)
      .then((trips) => {
        if (cancelled) return;
        setTripList(trips);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTripsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, selectedGroupId]);

  // Khi chọn trip → fetch members (qua group_id implicit từ trip)
  useEffect(() => {
    if (scope !== 'trip' || !selectedTripId) {
      setMemberList([]);
      return;
    }
    const trip = tripList.find((t) => t.id === selectedTripId);
    const groupId = trip?.group_id ?? selectedGroupId;
    if (!groupId) return;
    let cancelled = false;
    setMembersLoading(true);
    fetchGroupMembers(groupId)
      .then((members) => {
        if (cancelled) return;
        setMemberList(members);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, selectedTripId, tripList, selectedGroupId]);

  const hasTitle = title.trim().length > 0;

  const handleScopeChange = (next: Scope) => {
    setScope(next);
    if (next === 'global') {
      setSelectedGroupId(null);
      setSelectedTripId(null);
      setPaidByMemberId(null);
      setSplitOpt('none');
      setSelectedSplitMembers(new Set());
      setRatios({});
      setCustomAmounts({});
    }
  };

  const handleGroupChange = (groupId: string) => {
    if (groupId === selectedGroupId) return;
    setSelectedGroupId(groupId);
    setSelectedTripId(null);
    setPaidByMemberId(null);
    setSplitOpt('none');
    setSelectedSplitMembers(new Set());
    setRatios({});
    setCustomAmounts({});
  };

  const toggleSplitMember = (memberId: string) => {
    setSelectedSplitMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  // Memoize per-member handlers — giữ identity ổn định để TextInput không re-render.
  // onBlur dùng prev check: nếu state đã đổi sang member khác (B.focus chạy trước
  // timer của A.blur) thì skip clear → tránh ghi đè state khi switch focus.
  const splitInputHandlers = useMemo(() => {
    const map: Record<string, { onFocus: () => void; onBlur: () => void }> = {};
    memberList.forEach((m) => {
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
  }, [memberList]);

  const groupOptions = useMemo(
    () => groups.map((g) => ({ key: g.id, label: g.name })),
    [groups],
  );
  const tripOptions = useMemo(
    () => tripList.map((t) => ({ key: t.id, label: t.name })),
    [tripList],
  );
  const paidByOptions = useMemo(
    () => [
      { key: '__none__', label: 'Không chọn' },
      ...memberList.map((m) => ({ key: m.id, label: m.display_name })),
    ],
    [memberList],
  );

  const buildSplitsData = (): PresetSplitEntry[] | null => {
    if (splitOpt === 'none' || !memberList.length) return null;
    if (splitOpt === 'equal') {
      return Array.from(selectedSplitMembers).map((id) => ({ member_id: id }));
    }
    if (splitOpt === 'ratio') {
      return Array.from(selectedSplitMembers).map((id) => ({
        member_id: id,
        ratio: parseInt(ratios[id] || '1', 10) || 1,
      }));
    }
    return Array.from(selectedSplitMembers).map((id) => ({
      member_id: id,
      amount: parseInt(customAmounts[id] || '0', 10) || 0,
    }));
  };

  const handleSubmit = async () => {
    if (busy) return;
    setError('');

    const trimmed = title.trim();
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

    let tripId: string | null = null;
    let paidBy: string | null = null;
    let splitType: PresetSplitType | null = null;
    let splitsData: PresetSplitEntry[] | null = null;

    if (scope === 'trip') {
      if (!selectedGroupId) {
        setError('Vui lòng chọn nhóm');
        return;
      }
      if (!selectedTripId) {
        setError('Vui lòng chọn chuyến đi');
        return;
      }
      tripId = selectedTripId;
      paidBy = paidByMemberId;

      if (splitOpt !== 'none') {
        if (selectedSplitMembers.size === 0) {
          setError('Chọn ít nhất 1 thành viên cho cách chia');
          return;
        }
        splitType = splitOpt;
        splitsData = buildSplitsData();
        if (splitOpt === 'custom' && splitsData) {
          if (splitsData.some((s) => (s.amount ?? 0) < 0)) {
            setError('Số tiền mỗi người không được âm');
            return;
          }
          const sum = splitsData.reduce((acc, s) => acc + (s.amount ?? 0), 0);
          if (sum !== amount) {
            setError(
              `Tổng chia (${sum.toLocaleString('vi-VN')}đ) khác số tiền (${amount.toLocaleString('vi-VN')}đ)`,
            );
            return;
          }
        }
        if (splitOpt === 'ratio' && splitsData) {
          if (splitsData.some((s) => (s.ratio ?? 0) <= 0)) {
            setError('Tỷ lệ phải lớn hơn 0');
            return;
          }
          if (splitsData.some((s) => (s.ratio ?? 0) > 99)) {
            setError('Tỷ lệ tối đa là 99');
            return;
          }
        }
      }
    }

    Keyboard.dismiss();
    setBusy(true);
    try {
      const params = {
        title: trimmed,
        amount,
        tripId,
        paidByMemberId: paidBy,
        splitType,
        splitsData,
      };
      if (isEdit && preset) {
        await editPreset(preset.id, params);
        showSuccess('Đã cập nhật preset', trimmed);
      } else {
        await addPreset(params);
        showSuccess('Đã thêm preset', trimmed);
      }
      router.back();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const anyInputFocused = amountFocused || !!splitFocusedMemberId;

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: c.background }]}>
      <Stack.Screen
        options={{
          headerTitle: isEdit ? 'Sửa preset' : 'Thêm preset',
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
        // bottomOffset lớn khi có input focus để KeyboardAwareScrollView scroll
        // input lên đủ cao trên keyboard + dock chip (~46px) + buffer.
        bottomOffset={anyInputFocused ? 70 : 20}
      >
        <DismissKeyboardView style={styles.body}>
          <FloatingLabelInput
            label="Tên preset"
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
            accessibilityLabel="Tên preset"
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

          <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
            Phạm vi
          </AppText>
          <ChipPicker options={SCOPE_OPTIONS} selected={scope} onSelect={handleScopeChange} />

          {scope === 'trip' ? (
            <>
              <View style={[styles.sectionCard, { borderColor: c.divider }]}>
                <AppText variant="body" weight="semibold">
                  Áp dụng cho chuyến đi
                </AppText>

                <View style={styles.sectionField}>
                  <AppText variant="meta" tone="muted">Nhóm</AppText>
                  {groupOptions.length === 0 ? (
                    <AppText variant="caption" tone="muted">
                      Chưa có nhóm — tạo nhóm trước khi gắn preset.
                    </AppText>
                  ) : (
                    <ChipPicker
                      options={groupOptions}
                      selected={selectedGroupId ?? ''}
                      onSelect={handleGroupChange}
                    />
                  )}
                </View>

                {selectedGroupId ? (
                  <View style={styles.sectionField}>
                    <AppText variant="meta" tone="muted">Chuyến đi</AppText>
                    {tripsLoading ? (
                      <AppText variant="caption" tone="muted">Đang tải...</AppText>
                    ) : tripOptions.length === 0 ? (
                      <AppText variant="caption" tone="muted">
                        Nhóm này chưa có chuyến đi.
                      </AppText>
                    ) : (
                      <ChipPicker
                        options={tripOptions}
                        selected={selectedTripId ?? ''}
                        onSelect={setSelectedTripId}
                      />
                    )}
                  </View>
                ) : null}
              </View>

              {selectedTripId ? (
                <View
                  style={[
                    styles.sectionCard,
                    { borderColor: c.divider, backgroundColor: c.surfaceAlt },
                  ]}
                >
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <AppText variant="body" weight="semibold">Pre-fill 1-tap</AppText>
                      <View
                        style={[
                          styles.optionalBadge,
                          { backgroundColor: c.tint, borderColor: c.divider },
                        ]}
                      >
                        <AppText variant="meta" tone="muted">Tùy chọn</AppText>
                      </View>
                    </View>
                    <AppText variant="meta" tone="muted">
                      Lưu sẵn người trả và cách chia để tạo khoản chi chỉ với 1 chạm.
                    </AppText>
                  </View>

                  <View style={styles.sectionField}>
                    <AppText variant="meta" tone="muted">Người trả</AppText>
                    {membersLoading ? (
                      <AppText variant="caption" tone="muted">Đang tải...</AppText>
                    ) : (
                      <ChipPicker
                        options={paidByOptions}
                        selected={paidByMemberId ?? '__none__'}
                        onSelect={(k) => setPaidByMemberId(k === '__none__' ? null : k)}
                      />
                    )}
                  </View>

                  <View style={styles.sectionField}>
                    <AppText variant="meta" tone="muted">Cách chia</AppText>
                    <ChipPicker
                      options={SPLIT_OPTIONS}
                      selected={splitOpt}
                      onSelect={setSplitOpt}
                    />

                    {splitOpt !== 'none' && memberList.length > 0 ? (
                      <View style={styles.splitSection}>
                        <AppText variant="meta" tone="muted">
                          {splitOpt === 'equal'
                            ? 'Chọn thành viên chia tiền:'
                            : splitOpt === 'ratio'
                              ? 'Nhập tỷ lệ — VD: 2 = gấp đôi'
                              : 'Nhập số tiền cụ thể từng người'}
                        </AppText>
                        {memberList.map((m) => {
                          const selected = selectedSplitMembers.has(m.id);
                          const isRatio = splitOpt === 'ratio';
                          const isCustom = splitOpt === 'custom';
                          const ratioVal = ratios[m.id] || '';
                          const customVal = customAmounts[m.id] || '';
                          return (
                            <View key={m.id} style={styles.splitRow}>
                              <Pressable
                                onPress={() => toggleSplitMember(m.id)}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: selected }}
                                style={[
                                  styles.checkbox,
                                  {
                                    borderColor: selected ? c.primaryStrong : c.divider,
                                    backgroundColor: selected ? c.primaryStrong : 'transparent',
                                  },
                                ]}
                              >
                                {selected ? (
                                  <Check size={14} color={c.background} strokeWidth={3} />
                                ) : null}
                              </Pressable>
                              <Pressable
                                onPress={() => toggleSplitMember(m.id)}
                                style={styles.memberNameTap}
                              >
                                <AppText
                                  variant="body"
                                  style={styles.memberName}
                                  numberOfLines={1}
                                >
                                  {m.display_name}
                                </AppText>
                              </Pressable>
                              {selected && (isRatio || isCustom) ? (
                                <View
                                  style={[
                                    styles.splitInputWrap,
                                    isRatio
                                      ? styles.splitInputWrapRatio
                                      : styles.splitInputWrapCustom,
                                    {
                                      backgroundColor: c.surface,
                                      borderColor: c.divider,
                                    },
                                  ]}
                                >
                                  <TextInput
                                    style={[
                                      styles.splitInputField,
                                      {
                                        color: c.foreground,
                                        fontFamily: isCustom ? fonts.bold : undefined,
                                      },
                                    ]}
                                    placeholder={isRatio ? '1' : '0'}
                                    placeholderTextColor={c.muted}
                                    value={isRatio ? ratioVal : formatThousands(customVal)}
                                    onChangeText={(v) => {
                                      if (isRatio) {
                                        setRatios((p) => ({
                                          ...p,
                                          [m.id]: v.replace(/\D/g, ''),
                                        }));
                                      } else {
                                        setCustomAmounts((p) => ({
                                          ...p,
                                          [m.id]: parseMoneyInput(v),
                                        }));
                                      }
                                    }}
                                    onFocus={splitInputHandlers[m.id]?.onFocus}
                                    onBlur={splitInputHandlers[m.id]?.onBlur}
                                    keyboardType="number-pad"
                                    maxLength={isRatio ? 2 : 12}
                                    accessibilityLabel={`${isRatio ? 'Tỷ lệ' : 'Số tiền'} ${m.display_name}`}
                                  />
                                  <AppText
                                    variant="caption"
                                    tone="muted"
                                    style={styles.splitInputSuffix}
                                  >
                                    {isRatio ? 'phần' : 'đ'}
                                  </AppText>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
              <AppText variant="caption" tone="danger">{error}</AppText>
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <Button
              variant="secondary"
              size="lg"
              onPress={() => router.back()}
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
        </DismissKeyboardView>
      </KeyboardAwareScrollView>

      <MoneyChipsDock
        visible={amountFocused}
        amountStr={amountStr}
        onPick={(amt) => setAmountStr(String(amt))}
      />
      <MoneyChipsDock
        visible={splitOpt === 'custom' && !!splitFocusedMemberId}
        amountStr={
          splitFocusedMemberId ? customAmounts[splitFocusedMemberId] || '' : ''
        }
        onPick={(amt) => {
          if (splitFocusedMemberId) {
            setCustomAmounts((p) => ({ ...p, [splitFocusedMemberId]: String(amt) }));
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
  sectionCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    marginTop: 4,
  },
  sectionHeader: { gap: 4 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionField: { gap: 6 },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: { flex: 1 },
  submitBtn: { flex: 2 },
  splitSection: {
    gap: 10,
    paddingVertical: 8,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: {
    flex: 1,
    minWidth: 0,
  },
  memberNameTap: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
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
});
