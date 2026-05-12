import { router } from 'expo-router';
import { Button, useToast } from 'heroui-native';
import { MapPin, Pencil, Trash2, Zap } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { TabHeader } from '../../../components/header/TabHeader';
import {
  AppText,
  BouncyDialog,
  EmptyState,
} from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { type ExpensePreset, isFullPreset } from '../../../services/preset.service';
import { fetchAllUserTrips, type Trip } from '../../../services/trip.service';
import { usePresetStore } from '../../../stores/preset.store';
import { useUIStore } from '../../../stores/ui.store';
import { getErrorMessage } from '../../../utils/error';

export default function PresetsScreen() {
  const c = useAppTheme();
  const { toast } = useToast();
  const { presets, loading, loadPresets, removePreset } = usePresetStore();
  const presetsAddRequestSeq = useUIStore((s) => s.presetsAddRequestSeq);

  const [toDelete, setToDelete] = useState<ExpensePreset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    loadPresets().catch((e) => {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    });
    fetchAllUserTrips().then(setTrips).catch(() => {});
  }, [loadPresets, toast]);

  const tripNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    trips.forEach((t) => {
      m[t.id] = t.name;
    });
    return m;
  }, [trips]);

  // Header "+" button increments seq → navigate sang form ở add-mode.
  // Skip lần đầu mount (seq=0 chưa phải user action).
  useEffect(() => {
    if (presetsAddRequestSeq === 0) return;
    router.push('/preset-form');
  }, [presetsAddRequestSeq]);

  const handleEdit = (preset: ExpensePreset) => {
    router.push(`/preset-form?id=${preset.id}`);
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await removePreset(toDelete.id);
      toast.show({ variant: 'success', label: 'Đã xóa preset', description: toDelete.title });
      setToDelete(null);
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <TabHeader routeName="presets" title="Preset khoản chi" />
      {presets.length === 0 && !loading ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="Chưa có preset"
            subtitle="Tạo preset để dùng nhanh khi thêm khoản chi hay lặp lại."
          />
        </View>
      ) : (
        <FlatList
          data={presets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const full = isFullPreset(item);
            const tripName = item.trip_id ? tripNameMap[item.trip_id] : null;
            const subtitle = `${item.amount.toLocaleString('vi-VN')}đ`;
            return (
              <Pressable
                onPress={() => handleEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={`Sửa preset ${item.title}`}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: c.surface,
                    shadowColor: c.foreground,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <AppText variant="body" weight="semibold" numberOfLines={1} style={styles.titleText}>
                      {item.title}
                    </AppText>
                    {full ? (
                      <View style={[styles.fullBadge, { backgroundColor: c.accentSoft }]}>
                        <Zap size={11} color={c.primaryStrong} strokeWidth={2.5} />
                        <AppText variant="meta" weight="semibold" style={{ color: c.primaryStrong }}>
                          1-tap
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText variant="meta" tone="muted" numberOfLines={1}>
                    {subtitle}
                  </AppText>
                  {item.trip_id ? (
                    <View style={styles.scopeRow}>
                      <MapPin size={11} color={c.muted} strokeWidth={2} />
                      <AppText variant="meta" tone="muted" numberOfLines={1} style={styles.scopeText}>
                        {tripName ?? 'Chuyến đi'}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => handleEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Sửa preset ${item.title}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.iconBtn}
                  >
                    <Pencil size={18} color={c.muted} />
                  </Pressable>
                  <Pressable
                    onPress={() => setToDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa preset ${item.title}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.iconBtn}
                  >
                    <Trash2 size={18} color={c.danger} />
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <BouncyDialog
        isOpen={!!toDelete}
        onClose={() => (deleting ? undefined : setToDelete(null))}
        dismissOnBackdrop={!deleting}
      >
        <BouncyDialog.Title>Xóa preset?</BouncyDialog.Title>
        <BouncyDialog.Description>
          Xóa &quot;{toDelete?.title}&quot; khỏi danh sách preset. Hành động này không hoàn tác.
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setToDelete(null)}
            isDisabled={deleting}
          >
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button
            variant="danger"
            size="sm"
            onPress={handleConfirmDelete}
            isDisabled={deleting}
          >
            <Button.Label>{deleting ? 'Đang xóa...' : 'Xóa'}</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 8, paddingBottom: 120 },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardContent: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { flexShrink: 1 },
  fullBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  scopeText: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: 8, marginLeft: 10 },
  iconBtn: { padding: 4 },
});
