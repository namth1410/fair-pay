import { router } from 'expo-router';
import { Button } from 'heroui-native';
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin';
import Plus from 'lucide-react-native/dist/esm/icons/plus';
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2';
import Zap from 'lucide-react-native/dist/esm/icons/zap';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { HeaderIconButton, LargeTitleHeader } from '../../../components/header/LargeTitleHeader';
import {
  AppText,
  BouncyDialog,
  EmptyState,
  RowsSkeleton,
} from '../../../components/ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { type ExpensePreset, isFullPreset } from '../../../services/preset.service';
import { fetchAllUserTrips, type Trip } from '../../../services/trip.service';
import { usePresetStore } from '../../../stores/preset.store';
import { formatVND } from '../../../utils/format';
import { hapticLight } from '../../../utils/haptics';
import { pickPastel } from '../../../utils/seedGradient';
import { showError, showSuccess } from '../../../utils/toast';

// Tab Preset (giao diện "Hội thoại" 2026-10): header tiêu đề lớn + danh sách hàng phẳng.
export default function PresetsScreen() {
  const c = useAppTheme();
  const { presets, loading, loadPresets, removePreset } = usePresetStore();

  const [toDelete, setToDelete] = useState<ExpensePreset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    loadPresets().catch((e) => {
      showError(e);
    });
    fetchAllUserTrips().then(setTrips).catch(() => {});
  }, [loadPresets]);

  const tripNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    trips.forEach((t) => {
      m[t.id] = t.name;
    });
    return m;
  }, [trips]);

  const handleEdit = (preset: ExpensePreset) => {
    hapticLight();
    router.push(`/preset-form?id=${preset.id}`);
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await removePreset(toDelete.id);
      showSuccess('Đã xóa preset', toDelete.title);
      setToDelete(null);
    } catch (e: unknown) {
      showError(e);
    } finally {
      setDeleting(false);
    }
  };

  let body;
  if (loading && presets.length === 0) {
    body = <RowsSkeleton count={5} leading="tile" leadingSize={52} minHeight={74} />;
  } else if (presets.length === 0) {
    body = (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon={Zap}
          title="Chưa có preset"
          subtitle="Tạo preset để dùng nhanh khi thêm khoản chi hay lặp lại."
          action={{ label: 'Tạo preset', onPress: () => router.push('/preset-form') }}
        />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={presets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
          const full = isFullPreset(item);
          const tripName = item.trip_id ? tripNameMap[item.trip_id] : null;
          const pastel = pickPastel(item.trip_id ?? item.id, c.isDark);
          const isLast = index === presets.length - 1;
          return (
            <Pressable
              onPress={() => handleEdit(item)}
              accessibilityRole="button"
              accessibilityLabel={`Sửa preset ${item.title}, ${formatVND(item.amount)}${full ? ', 1 chạm' : ''}`}
              android_ripple={{ color: c.surfaceAlt }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceAlt }]}
            >
              <View style={[styles.icon, { backgroundColor: pastel.bg }]}>
                {item.trip_id ? (
                  <MapPin size={22} color={pastel.fg} strokeWidth={2} />
                ) : (
                  <Zap size={22} color={pastel.fg} strokeWidth={2} />
                )}
              </View>
              <View
                style={[
                  styles.content,
                  !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
                ]}
              >
                <View style={styles.texts}>
                  <View style={styles.titleRow}>
                    <AppText variant="subtitle" weight="bold" numberOfLines={1} style={styles.titleText}>
                      {item.title}
                    </AppText>
                    {full ? (
                      <View style={[styles.fullBadge, { backgroundColor: c.primarySoft }]}>
                        <Zap size={11} color={c.primary} strokeWidth={2.5} />
                        <AppText variant="meta" weight="bold" style={{ color: c.primary }}>
                          1 chạm
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText variant="caption" tone="muted" numberOfLines={1}>
                    {formatVND(item.amount)}
                    {item.trip_id ? ` · ${tripName ?? 'Chuyến đi'}` : ' · Mọi chuyến'}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => setToDelete(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa preset ${item.title}`}
                  hitSlop={8}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                >
                  <Trash2 size={18} color={c.muted} strokeWidth={2} />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <LargeTitleHeader
        title="Preset"
        right={
          <HeaderIconButton
            Icon={Plus}
            accessibilityLabel="Thêm preset mới"
            onPress={() => router.push('/preset-form')}
          />
        }
      />
      {body}

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
  list: { paddingBottom: 120 },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    minHeight: 74,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingRight: 12,
  },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { flexShrink: 1 },
  fullBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
