import { Button, useToast } from 'heroui-native';
import { Pencil, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { PresetFormModal } from '../../components/common/PresetFormModal';
import {
  AppCard,
  BouncyDialog,
  EmptyState,
} from '../../components/ui';
import { EXPENSE_CATEGORIES } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpensePreset } from '../../services/preset.service';
import { usePresetStore } from '../../stores/preset.store';
import { getErrorMessage } from '../../utils/error';

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);

export default function PresetsScreen() {
  const c = useAppTheme();
  const { toast } = useToast();
  const { presets, loading, loadPresets, removePreset } = usePresetStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpensePreset | null>(null);
  const [toDelete, setToDelete] = useState<ExpensePreset | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadPresets().catch((e) => {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    });
  }, [loadPresets, toast]);

  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (preset: ExpensePreset) => {
    setEditing(preset);
    setFormOpen(true);
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
          renderItem={({ item }) => (
            <AppCard
              title={item.title}
              subtitle={`${item.amount.toLocaleString('vi-VN')}đ · ${CATEGORY_LABELS[item.category] ?? item.category}`}
              onPress={() => handleEdit(item)}
              trailing={
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
              }
            />
          )}
        />
      )}

      <View style={[styles.fabWrap, { backgroundColor: c.background, borderTopColor: c.divider }]}>
        <Button variant="primary" size="md" onPress={handleAdd}>
          <Button.Label>+ Thêm preset</Button.Label>
        </Button>
      </View>

      <PresetFormModal
        isOpen={formOpen}
        onOpenChange={setFormOpen}
        preset={editing}
      />

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
  list: { padding: 16, gap: 8, paddingBottom: 96 },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 4 },
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
