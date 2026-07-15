// ConflictResolverModal — listen conflictBus, show modal khi sync engine detect P0410.
//
// 3 action: keep mine (resubmit với base_version mới), keep theirs (discard local +
// adopt server), defer (đóng modal, item ở Conflict Inbox).
//
// Mounted ở _layout làm sibling Slot — không cần route prop.

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import * as conflictBus from '../../sync/conflictBus';
import type { ConflictEvent } from '../../sync/conflictBus';
import * as resolveConflict from '../../sync/resolveConflict';
import { run as runSync } from '../../sync/syncEngine';
import { showError } from '../../utils/toast';
import { AppText } from '../ui/AppText';

// Mapping entity_type → version field name dùng cho keepMine resubmit.
// Settings + users LWW dùng 'updated_at'; còn lại dùng 'version'.
function versionFieldFor(opType: string): 'version' | 'updated_at' {
  if (opType === 'update_user_settings') return 'updated_at';
  return 'version';
}

function describeEvent(event: ConflictEvent): {
  title: string;
  mineDesc: string;
  theirsDesc: string;
} {
  const { queueItem, serverData } = event;
  const payload = (() => {
    try {
      return JSON.parse(queueItem.payload) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();

  switch (queueItem.op_type) {
    case 'update_group':
      return {
        title: 'Xung đột — Đổi tên nhóm',
        mineDesc: `Bạn đổi thành "${(payload.name as string) ?? '?'}"`,
        theirsDesc: `Người khác đã đổi thành "${(serverData?.name as string) ?? '?'}"`,
      };
    case 'update_trip_name':
      return {
        title: 'Xung đột — Đổi tên chuyến',
        mineDesc: `Bạn đổi thành "${(payload.name as string) ?? '?'}"`,
        theirsDesc: `Người khác đã đổi thành "${(serverData?.name as string) ?? '?'}"`,
      };
    case 'update_member_display_name':
      return {
        title: 'Xung đột — Đổi tên thành viên',
        mineDesc: `Bạn đổi thành "${(payload.display_name as string) ?? '?'}"`,
        theirsDesc: `Người khác đã đổi thành "${(serverData?.display_name as string) ?? '?'}"`,
      };
    case 'update_user_display_name':
      return {
        title: 'Xung đột — Đổi tên hiển thị',
        mineDesc: `Bạn đổi thành "${(payload.display_name as string) ?? '?'}"`,
        theirsDesc: `Tên hiện tại trên server: "${(serverData?.display_name as string) ?? '?'}"`,
      };
    case 'update_user_settings':
      return {
        title: 'Xung đột — Cài đặt',
        mineDesc: 'Bạn đã đổi cài đặt offline',
        theirsDesc: 'Server có cài đặt mới hơn từ thiết bị khác',
      };
    case 'close_trip':
      return {
        title: 'Xung đột — Đóng chuyến',
        mineDesc: 'Bạn đóng chuyến offline',
        theirsDesc: `Trạng thái server hiện tại: ${(serverData?.status as string) ?? '?'}`,
      };
    case 'reopen_trip':
      return {
        title: 'Xung đột — Mở lại chuyến',
        mineDesc: 'Bạn mở lại chuyến offline',
        theirsDesc: `Trạng thái server hiện tại: ${(serverData?.status as string) ?? '?'}`,
      };
    case 'update_preset':
      return {
        title: 'Xung đột — Sửa preset',
        mineDesc: `Bạn sửa thành "${(payload.title as string) ?? '?'}"`,
        theirsDesc: `Server có version mới: "${(serverData?.title as string) ?? '?'}"`,
      };
    case 'update_expense':
      return {
        title: 'Xung đột — Sửa khoản chi',
        mineDesc: `Bạn sửa thành "${(payload.title as string) ?? '?'}"`,
        theirsDesc: `Người khác đã sửa thành "${(serverData?.title as string) ?? '?'}"`,
      };
    default:
      return {
        title: 'Xung đột đồng bộ',
        mineDesc: `Thao tác offline: ${queueItem.op_type}`,
        theirsDesc: 'Dữ liệu trên server đã thay đổi',
      };
  }
}

export function ConflictResolverModal() {
  const c = useAppTheme();
  const router = useRouter();
  const [event, setEvent] = useState<ConflictEvent | null>(null);
  const [busy, setBusy] = useState(false);
  // eventRef mirror state để subscribe callback (deps []) đọc được giá trị
  // hiện tại — closure cố định sẽ thấy event=null vĩnh viễn nếu chỉ đọc state.
  const eventRef = useRef<ConflictEvent | null>(null);
  // FIFO queue cho các event đến trong khi modal đang hiện event khác.
  const queueRef = useRef<ConflictEvent[]>([]);

  useEffect(() => {
    return conflictBus.subscribe((e) => {
      if (eventRef.current) {
        queueRef.current.push(e);
      } else {
        eventRef.current = e;
        setEvent(e);
      }
    });
  }, []);

  const desc = useMemo(() => (event ? describeEvent(event) : null), [event]);

  if (!event || !desc) return null;

  const close = () => {
    const next = queueRef.current.shift() ?? null;
    eventRef.current = next;
    setEvent(next);
  };

  const handleKeepMine = async () => {
    if (busy || !event.serverData) {
      close();
      return;
    }
    setBusy(true);
    try {
      const field = versionFieldFor(event.queueItem.op_type);
      await resolveConflict.keepMine(event.queueItem, field, event.serverData);
      close();
      // Trigger push ngay
      void runSync(true).catch(() => undefined);
    } catch (e) {
      showError(e, 'Không lưu được lựa chọn');
    } finally {
      setBusy(false);
    }
  };

  const handleKeepTheirs = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resolveConflict.keepTheirs(event.queueItem, event.serverData);
      close();
    } catch (e) {
      showError(e, 'Không áp dụng được');
    } finally {
      setBusy(false);
    }
  };

  const handleDefer = () => {
    if (busy) return;
    close();
  };

  const handleOpenInbox = () => {
    if (busy) return;
    // User chủ động delegate sang UI Inbox — clear queue để không popup tiếp
    // các event đang xếp hàng khi họ quay lại app.
    queueRef.current = [];
    close();
    router.push('/sync-conflicts');
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleDefer}
    >
      <Pressable style={styles.backdrop} onPress={handleDefer}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.divider },
          ]}
        >
          <AppText variant="title" weight="semibold" style={{ marginBottom: 8 }}>
            {desc.title}
          </AppText>
          <AppText variant="body" style={{ color: c.muted, marginBottom: 16 }}>
            Có người khác đã sửa cùng dữ liệu trong khi bạn offline. Chọn bản nào giữ lại?
          </AppText>
          <View style={[styles.row, { borderColor: c.divider }]}>
            <AppText weight="semibold">📱 Của bạn</AppText>
            <AppText style={{ color: c.muted, marginTop: 4 }}>
              {desc.mineDesc}
            </AppText>
          </View>
          <View style={[styles.row, { borderColor: c.divider, marginTop: 12 }]}>
            <AppText weight="semibold">☁ Của họ (server)</AppText>
            <AppText style={{ color: c.muted, marginTop: 4 }}>
              {desc.theirsDesc}
            </AppText>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={handleKeepMine}
              disabled={busy}
              style={[
                styles.btn,
                { backgroundColor: c.primary, opacity: busy ? 0.5 : 1 },
              ]}
            >
              <AppText style={{ color: c.inverseForeground }} weight="semibold">
                Giữ của tôi
              </AppText>
            </Pressable>
            <Pressable
              onPress={handleKeepTheirs}
              disabled={busy}
              style={[
                styles.btn,
                {
                  backgroundColor: c.surfaceAlt,
                  opacity: busy ? 0.5 : 1,
                },
              ]}
            >
              <AppText weight="semibold">Giữ của họ</AppText>
            </Pressable>
          </View>
          <View style={styles.footer}>
            <Pressable onPress={handleDefer} disabled={busy}>
              <AppText style={{ color: c.muted }}>Xem sau</AppText>
            </Pressable>
            <Pressable onPress={handleOpenInbox} disabled={busy}>
              <AppText style={{ color: c.primary }}>Xem tất cả xung đột</AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
});
