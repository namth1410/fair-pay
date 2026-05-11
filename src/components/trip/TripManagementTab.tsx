import { Button, useToast } from 'heroui-native';
import {
  ChevronRight,
  CircleCheck,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { Trip } from '../../services/trip.service';
import { useTripStore } from '../../stores/trip.store';
import { getErrorMessage } from '../../utils/error';
import { hapticHeavy, hapticLight } from '../../utils/haptics';
import { AppCard, AppText, BouncyDialog } from '../ui';
import { RenameTripSheet } from './RenameTripSheet';

type Action = 'close' | 'reopen' | 'clear' | 'delete';

interface TripManagementTabProps {
  trip: Trip;
  isAdmin: boolean;
  onDeleted: () => void;
}

export const TripManagementTab = React.memo(function TripManagementTab({
  trip,
  isAdmin,
  onDeleted,
}: TripManagementTabProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const toggleTripStatus = useTripStore((s) => s.toggleTripStatus);
  const clearCurrentTrip = useTripStore((s) => s.clearCurrentTrip);
  const deleteCurrentTrip = useTripStore((s) => s.deleteCurrentTrip);

  const [renameOpen, setRenameOpen] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [busyAction, setBusyAction] = useState<Action | null>(null);

  const isOpen = trip.status === 'open';
  const isClosed = trip.status === 'closed';
  const isBusy = busyAction !== null;

  const closePending = () => {
    if (busyAction !== null) return;
    setPending(null);
  };

  const handleClose = async () => {
    if (isBusy) return;
    setBusyAction('close');
    try {
      await toggleTripStatus(trip);
      hapticLight();
      toast.show({ variant: 'success', label: 'Đã hoàn thành chuyến đi' });
      setPending(null);
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReopen = async () => {
    if (isBusy) return;
    setBusyAction('reopen');
    try {
      await toggleTripStatus(trip);
      hapticLight();
      toast.show({ variant: 'success', label: 'Đã mở lại chuyến đi' });
      setPending(null);
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setBusyAction(null);
    }
  };

  const handleClear = async () => {
    if (isBusy) return;
    setBusyAction('clear');
    try {
      await clearCurrentTrip(trip.id);
      hapticHeavy();
      toast.show({ variant: 'success', label: 'Đã reset chuyến đi' });
      setPending(null);
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    if (isBusy) return;
    setBusyAction('delete');
    try {
      await deleteCurrentTrip(trip.id, trip.group_id);
      hapticHeavy();
      toast.show({ variant: 'success', label: 'Đã xóa chuyến đi' });
      onDeleted();
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
      setBusyAction(null);
    }
  };

  return (
    <View style={styles.tabContent}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {!isAdmin ? (
          <View style={[styles.banner, { backgroundColor: c.surfaceAlt, borderColor: c.divider }]}>
            <AppText variant="caption" tone="muted">
              Chỉ admin mới quản lý được chuyến đi. Bạn vẫn xem được các thông tin khác.
            </AppText>
          </View>
        ) : null}

        <View style={styles.group}>
          <AppCard
            title="Đổi tên chuyến đi"
            subtitle={`Hiện tại: ${trip.name}`}
            leading={<Pencil size={20} color={c.foreground} strokeWidth={1.8} />}
            trailing={isAdmin ? <ChevronRight size={18} color={c.muted} /> : undefined}
            onPress={isAdmin ? () => setRenameOpen(true) : undefined}
          />
          {isOpen ? (
            <AppCard
              title="Hoàn thành chuyến đi"
              subtitle="Đóng chuyến đi, không cho thêm chi phí hay thanh toán"
              leading={<CircleCheck size={20} color={c.success} strokeWidth={1.8} />}
              trailing={isAdmin ? <ChevronRight size={18} color={c.muted} /> : undefined}
              onPress={isAdmin ? () => setPending('close') : undefined}
            />
          ) : null}
          {isClosed ? (
            <AppCard
              title="Mở lại chuyến đi"
              subtitle="Tiếp tục thêm chi phí và thanh toán cho chuyến đi"
              leading={<RotateCcw size={20} color={c.foreground} strokeWidth={1.8} />}
              trailing={isAdmin ? <ChevronRight size={18} color={c.muted} /> : undefined}
              onPress={isAdmin ? () => setPending('reopen') : undefined}
            />
          ) : null}
          <AppCard
            title="Reset chuyến đi"
            subtitle="Xóa toàn bộ khoản chi và thanh toán, giữ lại thành viên"
            leading={<RotateCcw size={20} color={c.warning} strokeWidth={1.8} />}
            trailing={isAdmin ? <ChevronRight size={18} color={c.muted} /> : undefined}
            onPress={isAdmin ? () => setPending('clear') : undefined}
          />
        </View>

        <View style={styles.dangerGroup}>
          <AppText variant="label" tone="danger" style={styles.sectionLabel}>
            NGUY HIỂM
          </AppText>
          <AppCard
            title="Xóa chuyến đi"
            subtitle="Ẩn chuyến đi khỏi danh sách nhóm. Không thể hoàn tác từ UI."
            leading={<Trash2 size={20} color={c.danger} strokeWidth={1.8} />}
            trailing={isAdmin ? <ChevronRight size={18} color={c.muted} /> : undefined}
            titleTone="default"
            borderLeft={{ width: 3, color: c.danger }}
            onPress={isAdmin ? () => setPending('delete') : undefined}
          />
        </View>
      </ScrollView>

      <RenameTripSheet
        isOpen={renameOpen}
        onOpenChange={setRenameOpen}
        tripId={trip.id}
        currentName={trip.name}
        onSuccess={() => toast.show({ variant: 'success', label: 'Đã đổi tên chuyến đi' })}
      />

      <BouncyDialog
        isOpen={pending === 'close'}
        onClose={closePending}
        dismissOnBackdrop={!isBusy}
      >
        <BouncyDialog.Title>Hoàn thành chuyến đi?</BouncyDialog.Title>
        <BouncyDialog.Description>
          Chuyến đi sẽ được đóng. Bạn có thể mở lại bất cứ lúc nào.
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={closePending} isDisabled={isBusy}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button variant="primary" size="sm" onPress={handleClose} isDisabled={isBusy}>
            <Button.Label>{busyAction === 'close' ? 'Đang đóng...' : 'Hoàn thành'}</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

      <BouncyDialog
        isOpen={pending === 'reopen'}
        onClose={closePending}
        dismissOnBackdrop={!isBusy}
      >
        <BouncyDialog.Title>Mở lại chuyến đi?</BouncyDialog.Title>
        <BouncyDialog.Description>
          Sau khi mở lại, bạn có thể thêm khoản chi và thanh toán mới vào chuyến đi này.
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={closePending} isDisabled={isBusy}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button variant="primary" size="sm" onPress={handleReopen} isDisabled={isBusy}>
            <Button.Label>{busyAction === 'reopen' ? 'Đang mở...' : 'Mở lại'}</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

      <BouncyDialog
        isOpen={pending === 'clear'}
        onClose={closePending}
        dismissOnBackdrop={!isBusy}
      >
        <BouncyDialog.Title>Reset chuyến đi?</BouncyDialog.Title>
        <BouncyDialog.Description>
          Toàn bộ khoản chi và thanh toán sẽ bị xóa. Thành viên trong chuyến đi vẫn được giữ nguyên.
          {isClosed ? ' Chuyến đi đang đóng sẽ được mở lại.' : ''}
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={closePending} isDisabled={isBusy}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button variant="danger" size="sm" onPress={handleClear} isDisabled={isBusy}>
            <Button.Label>{busyAction === 'clear' ? 'Đang reset...' : 'Reset'}</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

      <BouncyDialog
        isOpen={pending === 'delete'}
        onClose={closePending}
        dismissOnBackdrop={!isBusy}
      >
        <BouncyDialog.Title>Xóa chuyến đi?</BouncyDialog.Title>
        <BouncyDialog.Description>
          Chuyến đi cùng tất cả khoản chi, thanh toán sẽ bị ẩn khỏi danh sách. Bạn không thể tự khôi phục lại.
        </BouncyDialog.Description>
        <BouncyDialog.Actions>
          <Button variant="ghost" size="sm" onPress={closePending} isDisabled={isBusy}>
            <Button.Label>Hủy</Button.Label>
          </Button>
          <Button variant="danger" size="sm" onPress={handleDelete} isDisabled={isBusy}>
            <Button.Label>{busyAction === 'delete' ? 'Đang xóa...' : 'Xóa'}</Button.Label>
          </Button>
        </BouncyDialog.Actions>
      </BouncyDialog>

    </View>
  );
});

const styles = StyleSheet.create({
  tabContent: { flex: 1 },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 18,
  },
  banner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  group: {
    gap: 0,
  },
  dangerGroup: {
    gap: 8,
  },
  sectionLabel: {
    marginLeft: 4,
    marginBottom: 2,
    letterSpacing: 0.8,
  },
});
