import { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { BottomSheet, Button, useToast } from 'heroui-native';
import { Camera, ImageIcon, MapPin, Pencil, Plus, Zap } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { createExpense } from '../../services/expense.service';
import {
  applyPresetToTrip,
  type ExpensePreset,
  isFullPreset,
} from '../../services/preset.service';
import { fetchAllUserTrips, type Trip } from '../../services/trip.service';
import { getPresetsForContext, usePresetStore } from '../../stores/preset.store';
import { useTripStore } from '../../stores/trip.store';
import { getErrorMessage } from '../../utils/error';
import { formatVND } from '../../utils/format';
import { type AvatarSource, pickImage } from '../../utils/imageProcessing';
import { AppText, BouncyDialog } from '../ui';

interface QuickAddActionSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type SheetState = { kind: 'choose' } | { kind: 'picking'; source: AvatarSource };

export function QuickAddActionSheet({
  isOpen,
  onOpenChange,
}: QuickAddActionSheetProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const [state, setState] = useState<SheetState>({ kind: 'choose' });
  const [errorMsg, setErrorMsg] = useState('');

  const allPresets = usePresetStore((s) => s.presets);
  const presetsLoaded = usePresetStore((s) => s.loaded);
  const loadPresets = usePresetStore((s) => s.loadPresets);
  const reloadTripExpenses = useTripStore((s) => s.loadExpenses);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [confirmPreset, setConfirmPreset] = useState<ExpensePreset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setState({ kind: 'choose' });
      setErrorMsg('');
      return;
    }
    if (!presetsLoaded) loadPresets().catch(() => {});
    // Fetch trips để render trip name trong chip badge.
    fetchAllUserTrips().then(setTrips).catch(() => {});
  }, [isOpen, presetsLoaded, loadPresets]);

  const tripNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    trips.forEach((t) => {
      m[t.id] = t.name;
    });
    return m;
  }, [trips]);

  const contextPresets = useMemo(
    () => getPresetsForContext(allPresets, { tripId: null }),
    [allPresets],
  );

  const navigateToForm = (image?: {
    uri: string;
    width: number;
    height: number;
    sizeBytes: number;
  }) => {
    const expenseId = Crypto.randomUUID();
    const params = new URLSearchParams();
    params.set('expenseId', expenseId);
    if (image) {
      params.set('imageUri', image.uri);
      params.set('imageSizeBytes', String(image.sizeBytes));
      params.set('imageWidth', String(image.width));
      params.set('imageHeight', String(image.height));
    }
    onOpenChange(false);
    router.push(`/expenses/new?${params.toString()}` as never);
  };

  const handlePick = async (source: AvatarSource) => {
    setErrorMsg('');
    setState({ kind: 'picking', source });
    try {
      const picked = await pickImage(source);
      if (!picked) {
        setState({ kind: 'choose' });
        return;
      }
      navigateToForm({
        uri: picked.uri,
        width: picked.width,
        height: picked.height,
        sizeBytes: picked.sizeBytes,
      });
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setState({ kind: 'choose' });
    }
  };

  const handleManual = () => {
    navigateToForm();
  };

  const handleApplyPreset = (preset: ExpensePreset) => {
    const expenseId = Crypto.randomUUID();
    const baseParams = new URLSearchParams();
    baseParams.set('expenseId', expenseId);
    baseParams.set('prefillTitle', preset.title);
    baseParams.set('prefillAmount', String(preset.amount));

    // Trip-pinned full preset → confirm dialog → submit RPC luôn, không qua form.
    if (isFullPreset(preset)) {
      setConfirmPreset(preset);
      return;
    }

    // Trip-pinned partial → mở trip route với prefill (form pre-fill trip + title/amount/category).
    if (preset.trip_id) {
      baseParams.set('applyPresetId', preset.id);
      onOpenChange(false);
      router.push(
        `/trips/${preset.trip_id}/expenses/new?${baseParams.toString()}` as never,
      );
      return;
    }

    // Global preset → mở form home, trip empty.
    onOpenChange(false);
    router.push(`/expenses/new?${baseParams.toString()}` as never);
  };

  const handleConfirmSubmit = async () => {
    if (!confirmPreset || !confirmPreset.trip_id) return;
    setSubmitting(true);
    try {
      const applied = await applyPresetToTrip(confirmPreset, confirmPreset.trip_id);
      await createExpense({
        tripId: confirmPreset.trip_id,
        groupId: applied.tripGroupId,
        title: confirmPreset.title,
        amount: confirmPreset.amount,
        paidByMemberId: applied.paidByMemberId,
        splitType: applied.splitType,
        splits: applied.splits,
      });
      // Best-effort refresh trip expenses để user thấy ngay khi mở trip.
      reloadTripExpenses(confirmPreset.trip_id).catch(() => {});

      const desc =
        applied.warnings.length > 0
          ? applied.warnings.join(' · ')
          : `${confirmPreset.title} · ${formatVND(confirmPreset.amount)}`;
      toast.show({
        variant: applied.warnings.length > 0 ? 'warning' : 'success',
        label: 'Đã tạo khoản chi',
        description: desc,
      });
      setConfirmPreset(null);
      onOpenChange(false);
    } catch (err) {
      toast.show({
        variant: 'danger',
        label: 'Lỗi tạo khoản chi',
        description: getErrorMessage(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isPicking = state.kind === 'picking';
  const isLocked = isPicking || submitting;

  const confirmTripName = confirmPreset?.trip_id
    ? tripNameMap[confirmPreset.trip_id] ?? 'Chuyến đi'
    : '';

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (isLocked) return;
          onOpenChange(open);
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <BottomSheetView style={styles.container}>
              <View style={styles.header}>
                <BottomSheet.Title>Thêm khoản chi mới</BottomSheet.Title>
              </View>

              <View style={styles.chooseBody}>
                {contextPresets.length > 0 ? (
                  <View style={styles.presetSection}>
                    <AppText variant="meta" tone="muted">
                      Preset
                    </AppText>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.presetRow}
                    >
                      {contextPresets.map((p) => {
                        const full = isFullPreset(p);
                        const tripName = p.trip_id ? tripNameMap[p.trip_id] : null;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => handleApplyPreset(p)}
                            accessibilityRole="button"
                            accessibilityLabel={`Áp dụng preset ${p.title}`}
                            style={[
                              styles.presetChip,
                              {
                                backgroundColor: c.surfaceAlt,
                                borderColor: full ? c.primaryStrong : c.divider,
                              },
                            ]}
                          >
                            <View style={styles.presetChipHeader}>
                              <AppText variant="caption" weight="semibold" numberOfLines={1} style={styles.presetTitle}>
                                {p.title}
                              </AppText>
                              {full ? (
                                <Zap size={12} color={c.primaryStrong} strokeWidth={2.5} />
                              ) : null}
                            </View>
                            <AppText variant="meta" tone="muted">
                              {formatVND(p.amount)}
                            </AppText>
                            {p.trip_id ? (
                              <View style={styles.presetScopeRow}>
                                <MapPin size={10} color={c.muted} strokeWidth={2} />
                                <AppText variant="meta" tone="muted" numberOfLines={1} style={styles.presetScopeText}>
                                  {tripName ?? 'Chuyến đi'}
                                </AppText>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
                {contextPresets.length === 0 && presetsLoaded ? (
                  <View style={[styles.emptyPresetBox, { borderColor: c.divider }]}>
                    <AppText variant="caption" tone="muted" style={styles.emptyPresetText}>
                      Chưa có preset. Tạo preset để thêm khoản chi nhanh hơn.
                    </AppText>
                    <Pressable
                      onPress={() => {
                        onOpenChange(false);
                        router.push('/presets' as never);
                      }}
                      style={styles.emptyPresetLink}
                      accessibilityRole="button"
                      accessibilityLabel="Đi tới quản lý preset"
                    >
                      <Plus size={14} color={c.primaryStrong} strokeWidth={2.5} />
                      <AppText variant="caption" weight="semibold" style={{ color: c.primaryStrong }}>
                        Tạo preset
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}

                <AppText variant="caption" tone="muted" style={styles.hint}>
                  Hoặc tạo khoản chi mới bên dưới. Ảnh sẽ được đính kèm làm bằng chứng (1:1, tối đa 2 MB).
                </AppText>

                {errorMsg ? (
                  <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                    <AppText variant="caption" tone="danger">
                      {errorMsg}
                    </AppText>
                  </View>
                ) : null}

                {isPicking ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator color={c.foreground} />
                    <AppText variant="body" tone="muted">
                      Đang mở...
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.actionsCol}>
                    <ActionRow
                      icon={<Camera size={22} color={c.foreground} strokeWidth={1.9} />}
                      label="Chụp ảnh"
                      sublabel="Mở camera để chụp hoá đơn"
                      onPress={() => handlePick('camera')}
                      c={c}
                    />
                    <ActionRow
                      icon={<ImageIcon size={22} color={c.foreground} strokeWidth={1.9} />}
                      label="Chọn từ thư viện"
                      sublabel="Lấy ảnh có sẵn trên máy"
                      onPress={() => handlePick('library')}
                      c={c}
                    />
                    <ActionRow
                      icon={<Pencil size={22} color={c.foreground} strokeWidth={1.9} />}
                      label="Nhập thủ công"
                      sublabel="Tạo khoản chi không cần ảnh"
                      onPress={handleManual}
                      c={c}
                    />
                  </View>
                )}
              </View>
            </BottomSheetView>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>

      <BouncyDialog
        isOpen={!!confirmPreset}
        onClose={() => (submitting ? undefined : setConfirmPreset(null))}
        dismissOnBackdrop={!submitting}
      >
        <BouncyDialog.Title>Tạo khoản chi mới?</BouncyDialog.Title>
        <BouncyDialog.Description>
          {confirmPreset
            ? `${confirmPreset.title} · ${formatVND(confirmPreset.amount)}\nVào trip: ${confirmTripName}`
            : ''}
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setConfirmPreset(null)}
            isDisabled={submitting}
          >
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={handleConfirmSubmit}
            isDisabled={submitting}
          >
            <Button.Label>{submitting ? 'Đang tạo...' : 'Tạo'}</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>
    </>
  );
}

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onPress: () => void;
  c: ReturnType<typeof useAppTheme>;
}

function ActionRow({ icon, label, sublabel, onPress, c }: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: c.divider }}
      style={({ pressed }) => [
        styles.actionRow,
        {
          backgroundColor: c.surface,
          borderColor: c.divider,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.surfaceAlt }]}>{icon}</View>
      <View style={styles.actionTextWrap}>
        <AppText variant="body" weight="semibold">
          {label}
        </AppText>
        <AppText variant="caption" tone="muted">
          {sublabel}
        </AppText>
      </View>
    </Pressable>
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
  hint: {
    marginBottom: 4,
  },
  chooseBody: {
    paddingTop: 8,
    gap: 14,
  },
  presetSection: {
    gap: 6,
  },
  presetRow: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 4,
    paddingRight: 4,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 140,
    alignItems: 'flex-start',
    gap: 2,
  },
  presetChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetTitle: {
    flexShrink: 1,
  },
  presetScopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  presetScopeText: {
    flex: 1,
    minWidth: 0,
    maxWidth: 120,
  },
  emptyPresetBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: 10,
  },
  emptyPresetText: {
    textAlign: 'center',
  },
  emptyPresetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  actionsCol: {
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    alignSelf: 'stretch',
  },
  busyRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
});
