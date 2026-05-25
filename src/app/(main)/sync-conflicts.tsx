// Conflict Inbox — list mọi queue item status='conflict' để user resolve sau.
//
// Route: /(main)/sync-conflicts
// Mở từ Settings hoặc từ ConflictResolverModal "Xem tất cả".

import { Stack } from 'expo-router';
import { useToast } from 'heroui-native';
import { CheckCircle2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../../components/ui/AppText';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../stores/app.store';
import { fetchServerEntity } from '../../sync/pushDispatcher';
import * as resolveConflict from '../../sync/resolveConflict';
import { run as runSync } from '../../sync/syncEngine';
import * as syncQueue from '../../sync/syncQueue';
import type { SyncQueueRow } from '../../types/database.types';
import { getErrorMessage } from '../../utils/error';

const OP_LABELS: Record<string, string> = {
  update_group: 'Đổi tên nhóm',
  update_trip_name: 'Đổi tên chuyến',
  update_member_display_name: 'Đổi tên thành viên',
  update_user_display_name: 'Đổi tên hiển thị',
  update_user_settings: 'Cài đặt',
  update_preset: 'Sửa preset',
  close_trip: 'Đóng chuyến',
  reopen_trip: 'Mở lại chuyến',
};

function opLabel(opType: string): string {
  return OP_LABELS[opType] ?? opType;
}

function versionFieldFor(opType: string): 'version' | 'updated_at' {
  if (opType === 'update_user_settings') return 'updated_at';
  return 'version';
}

export default function SyncConflictsScreen() {
  const c = useAppTheme();
  const { toast } = useToast();
  const bannerVisible = useAppStore((s) => s.bannerVisible);
  const [items, setItems] = useState<SyncQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await syncQueue.listByStatus('conflict');
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleKeepMine = async (item: SyncQueueRow) => {
    setBusyId(item.id);
    try {
      const serverData = await fetchServerEntity(item.entity_type, item.entity_id);
      if (!serverData) {
        // Server xóa entity → discard local
        await syncQueue.discard(item.id);
        await refresh();
        return;
      }
      const field = versionFieldFor(item.op_type);
      await resolveConflict.keepMine(item, field, serverData);
      await refresh();
      void runSync(true).catch(() => undefined);
    } catch (e) {
      toast.show({
        variant: 'danger',
        label: 'Không lưu được lựa chọn',
        description: getErrorMessage(e),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleKeepTheirs = async (item: SyncQueueRow) => {
    setBusyId(item.id);
    try {
      const serverData = item.conflict_server_data
        ? (JSON.parse(item.conflict_server_data) as Record<string, unknown>)
        : await fetchServerEntity(item.entity_type, item.entity_id);
      await resolveConflict.keepTheirs(item, serverData);
      await refresh();
    } catch (e) {
      toast.show({
        variant: 'danger',
        label: 'Không áp dụng được',
        description: getErrorMessage(e),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView
      edges={bannerVisible ? ['bottom'] : ['top', 'bottom']}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <Stack.Screen options={{ title: 'Xung đột đồng bộ' }} />
      {loading ? null : items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Không có xung đột"
          subtitle="Mọi thay đổi offline đã đồng bộ thành công."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => {
            const isBusy = busyId === item.id;
            return (
              <View
                style={[
                  styles.card,
                  { backgroundColor: c.surface, borderColor: c.divider },
                ]}
              >
                <AppText weight="semibold">{opLabel(item.op_type)}</AppText>
                <AppText style={{ color: c.muted, marginTop: 4 }}>
                  {new Date(item.created_at).toLocaleString('vi-VN')}
                </AppText>
                {item.last_error && (
                  <AppText style={{ color: c.warning, marginTop: 4 }}>
                    {item.last_error}
                  </AppText>
                )}
                <View style={styles.actions}>
                  <Pressable
                    disabled={isBusy}
                    onPress={() => handleKeepMine(item)}
                    style={[
                      styles.btn,
                      { backgroundColor: c.primary, opacity: isBusy ? 0.5 : 1 },
                    ]}
                  >
                    <AppText
                      weight="semibold"
                      style={{ color: c.inverseForeground }}
                    >
                      Giữ của tôi
                    </AppText>
                  </Pressable>
                  <Pressable
                    disabled={isBusy}
                    onPress={() => handleKeepTheirs(item)}
                    style={[
                      styles.btn,
                      {
                        backgroundColor: c.surfaceAlt,
                        opacity: isBusy ? 0.5 : 1,
                      },
                    ]}
                  >
                    <AppText weight="semibold">Giữ của họ</AppText>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});
