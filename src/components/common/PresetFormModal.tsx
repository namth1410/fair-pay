import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet, Button, useToast } from 'heroui-native';
import { Check } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../config/constants';
import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { fetchGroupMembers, type GroupMember } from '../../services/group.service';
import type { ExpensePreset, PresetSplitType } from '../../services/preset.service';
import { fetchTrips, type Trip } from '../../services/trip.service';
import { useGroupStore } from '../../stores/group.store';
import { usePresetStore } from '../../stores/preset.store';
import type { PresetSplitEntry } from '../../types/database.types';
import { getErrorMessage } from '../../utils/error';
import { formatThousands, parseMoneyInput } from '../../utils/format';
import { AppText, ChipPicker, MoneyChipsDock } from '../ui';

interface PresetFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nếu truyền vào là sửa; không truyền là tạo mới. */
  preset?: ExpensePreset | null;
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

export function PresetFormModal({ isOpen, onOpenChange, preset }: PresetFormModalProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const { addPreset, editPreset } = usePresetStore();
  const groups = useGroupStore((s) => s.groups);
  const loadGroups = useGroupStore((s) => s.loadGroups);

  const isEdit = !!preset;

  const titleRef = useRef('');
  const [amountStr, setAmountStr] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [hasTitle, setHasTitle] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [scope, setScope] = useState<Scope>('global');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripList, setTripList] = useState<Trip[]>([]);
  const [memberList, setMemberList] = useState<GroupMember[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [paidByMemberId, setPaidByMemberId] = useState<string | null>(null);
  const [splitOpt, setSplitOpt] = useState<SplitOpt>('none');
  const [selectedSplitMembers, setSelectedSplitMembers] = useState<Set<string>>(new Set());
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);

  useEffect(() => {
    if (!isOpen) {
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

    if (preset?.trip_id) {
      setScope('trip');
      setSelectedTripId(preset.trip_id);
      setPaidByMemberId(preset.paid_by_member_id ?? null);
      setSplitOpt(preset.split_type ?? 'none');
      const data = preset.splits_data ?? [];
      setSelectedSplitMembers(new Set(data.map((s) => s.member_id)));
      const r: Record<string, string> = {};
      const a: Record<string, string> = {};
      data.forEach((s) => {
        if (s.ratio !== undefined) r[s.member_id] = String(s.ratio);
        if (s.amount !== undefined) a[s.member_id] = String(s.amount);
      });
      setRatios(r);
      setCustomAmounts(a);
    } else {
      setScope('global');
      setSelectedGroupId(null);
      setSelectedTripId(null);
      setPaidByMemberId(null);
      setSplitOpt('none');
      setSelectedSplitMembers(new Set());
      setRatios({});
      setCustomAmounts({});
    }

    if (groups.length === 0) loadGroups().catch(() => {});
  }, [isOpen, preset, groups.length, loadGroups]);

  // Khi đang sửa preset trip-pinned, suy ra group_id từ trip để fetch trips cho ChipPicker
  useEffect(() => {
    if (!isOpen || !preset?.trip_id || selectedGroupId !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const allGroups = groups.length > 0 ? groups : [];
        for (const g of allGroups) {
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
  }, [isOpen, preset, groups, selectedGroupId]);

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
          const sum = splitsData.reduce((acc, s) => acc + (s.amount ?? 0), 0);
          if (sum !== amount) {
            setError(`Tổng chia (${sum.toLocaleString('vi-VN')}đ) khác số tiền (${amount.toLocaleString('vi-VN')}đ)`);
            return;
          }
        }
        if (splitOpt === 'ratio' && splitsData) {
          if (splitsData.some((s) => (s.ratio ?? 0) <= 0)) {
            setError('Tỷ lệ phải lớn hơn 0');
            return;
          }
        }
      }
    }

    setBusy(true);
    try {
      const params = {
        title: trimmed,
        amount,
        category,
        tripId,
        paidByMemberId: paidBy,
        splitType,
        splitsData,
      };
      if (isEdit && preset) {
        await editPreset(preset.id, params);
        toast.show({ variant: 'success', label: 'Đã cập nhật preset', description: trimmed });
      } else {
        await addPreset(params);
        toast.show({ variant: 'success', label: 'Đã thêm preset', description: trimmed });
      }
      onOpenChange(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const splitInputStyle = [
    styles.numInput,
    {
      backgroundColor: c.surfaceAlt,
      borderColor: c.divider,
      color: c.foreground,
    },
  ];

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          enableOverDrag={false}
          snapPoints={['75%', '95%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          contentContainerClassName="h-full"
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <BottomSheet.Title>{isEdit ? 'Sửa preset' : 'Thêm preset'}</BottomSheet.Title>
            </View>
            <View style={styles.body}>
              <BottomSheetTextInput
                key={`title-${resetKey}`}
                placeholder="Tên preset"
                placeholderTextColor={c.muted}
                defaultValue={titleRef.current}
                onChangeText={handleTitleChange}
                returnKeyType="next"
                accessibilityLabel="Tên preset"
                style={[
                  styles.input,
                  {
                    color: c.foreground,
                    backgroundColor: c.surfaceAlt,
                    borderColor: c.divider,
                  },
                ]}
              />

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
                accessibilityLabel="Số tiền"
                style={[
                  styles.input,
                  {
                    color: c.foreground,
                    backgroundColor: c.surfaceAlt,
                    borderColor: c.divider,
                    fontFamily: fonts.bold,
                  },
                ]}
              />

              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                Danh mục
              </AppText>
              <ChipPicker
                options={EXPENSE_CATEGORIES}
                selected={category}
                onSelect={(k) => setCategory(k as ExpenseCategory)}
              />

              <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                Phạm vi
              </AppText>
              <ChipPicker options={SCOPE_OPTIONS} selected={scope} onSelect={handleScopeChange} />

              {scope === 'trip' ? (
                <>
                  <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                    Nhóm
                  </AppText>
                  {groupOptions.length === 0 ? (
                    <AppText variant="caption" tone="muted">
                      Chưa có nhóm — tạo nhóm trước khi gắn preset vào trip.
                    </AppText>
                  ) : (
                    <ChipPicker
                      options={groupOptions}
                      selected={selectedGroupId ?? ''}
                      onSelect={handleGroupChange}
                    />
                  )}

                  {selectedGroupId ? (
                    <>
                      <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                        Chuyến đi
                      </AppText>
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
                    </>
                  ) : null}

                  {selectedTripId ? (
                    <>
                      <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                        Người trả (tùy chọn)
                      </AppText>
                      {membersLoading ? (
                        <AppText variant="caption" tone="muted">Đang tải...</AppText>
                      ) : (
                        <ChipPicker
                          options={paidByOptions}
                          selected={paidByMemberId ?? '__none__'}
                          onSelect={(k) => setPaidByMemberId(k === '__none__' ? null : k)}
                        />
                      )}

                      <AppText variant="meta" tone="muted" style={styles.fieldLabel}>
                        Cách chia (tùy chọn)
                      </AppText>
                      <ChipPicker options={SPLIT_OPTIONS} selected={splitOpt} onSelect={setSplitOpt} />

                      {splitOpt !== 'none' && memberList.length > 0 ? (
                        <View style={styles.splitSection}>
                          <AppText variant="meta" tone="muted">
                            {splitOpt === 'equal'
                              ? 'Chọn thành viên chia tiền:'
                              : splitOpt === 'ratio'
                              ? 'Nhập tỷ lệ cho thành viên (VD: 2 = gấp đôi):'
                              : 'Nhập số tiền cụ thể cho thành viên:'}
                          </AppText>
                          {memberList.map((m) => {
                            const selected = selectedSplitMembers.has(m.id);
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
                                  {selected ? <Check size={14} color={c.background} strokeWidth={3} /> : null}
                                </Pressable>
                                <AppText variant="body" style={styles.memberName} numberOfLines={1}>
                                  {m.display_name}
                                </AppText>
                                {selected && splitOpt === 'ratio' ? (
                                  <BottomSheetTextInput
                                    style={splitInputStyle}
                                    placeholder="1"
                                    placeholderTextColor={c.muted}
                                    value={ratios[m.id] || ''}
                                    onChangeText={(v) => setRatios((p) => ({ ...p, [m.id]: v }))}
                                    keyboardType="number-pad"
                                    accessibilityLabel={`Tỷ lệ ${m.display_name}`}
                                  />
                                ) : null}
                                {selected && splitOpt === 'custom' ? (
                                  <BottomSheetTextInput
                                    style={[splitInputStyle, { fontFamily: fonts.bold }]}
                                    placeholder="0"
                                    placeholderTextColor={c.muted}
                                    value={customAmounts[m.id] || ''}
                                    onChangeText={(v) => setCustomAmounts((p) => ({ ...p, [m.id]: v }))}
                                    keyboardType="number-pad"
                                    accessibilityLabel={`Số tiền ${m.display_name}`}
                                  />
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </>
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
  numInput: {
    width: 90,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    textAlign: 'right',
    fontSize: 14,
  },
});
