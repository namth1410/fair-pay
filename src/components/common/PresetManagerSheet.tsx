import { useToast } from 'heroui-native';
import { Trash2, X } from 'lucide-react-native';
import { useEffect } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { EXPENSE_CATEGORIES } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpensePreset } from '../../services/preset.service';
import { usePresetStore } from '../../stores/preset.store';
import { getErrorMessage } from '../../utils/error';
import { AppCard, AppText } from '../ui';

interface PresetManagerSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);

export function PresetManagerSheet({ isOpen, onOpenChange }: PresetManagerSheetProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const { presets, loading, loadPresets, removePreset } = usePresetStore();

  useEffect(() => {
    if (!isOpen) return;
    loadPresets().catch((e) => {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    });
  }, [isOpen, loadPresets, toast]);

  const handleDelete = async (preset: ExpensePreset) => {
    try {
      await removePreset(preset.id);
      toast.show({ variant: 'success', label: 'Đã xóa preset', description: preset.title });
    } catch (e: unknown) {
      toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
    }
  };

  return (
    <Modal
      visible={isOpen}
      onRequestClose={() => onOpenChange(false)}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={() => onOpenChange(false)}
          accessibilityLabel="Đóng"
        />
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <View style={styles.header}>
            <AppText variant="subtitle" weight="semibold">
              Preset khoản chi
            </AppText>
            <Pressable
              onPress={() => onOpenChange(false)}
              style={styles.closeBtn}
              accessibilityLabel="Đóng"
            >
              <X size={20} color={c.muted} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {presets.length === 0 && !loading ? (
              <View style={styles.empty}>
                <AppText variant="body" tone="muted" center>
                  Chưa có preset. Tạo khoản chi rồi bấm &quot;Lưu preset&quot; để dùng nhanh lần sau.
                </AppText>
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
                    trailing={
                      <Pressable
                        onPress={() => handleDelete(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Xóa preset ${item.title}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={18} color={c.danger} />
                      </Pressable>
                    }
                  />
                )}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
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
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 24,
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
  body: {
    paddingHorizontal: 16,
    paddingTop: 4,
    minHeight: 120,
  },
  list: {
    paddingBottom: 12,
    gap: 8,
  },
  empty: {
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
});
