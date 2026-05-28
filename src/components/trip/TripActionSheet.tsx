import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import Pin from 'lucide-react-native/dist/esm/icons/pin';
import PinOff from 'lucide-react-native/dist/esm/icons/pin-off';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MAX_PINNED_TRIPS } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { Trip } from '../../services/trip.service';
import { useTripStore } from '../../stores/trip.store';
import { hapticLight } from '../../utils/haptics';
import { showError, showSuccess } from '../../utils/toast';
import { AppText } from '../ui';

interface TripActionSheetProps {
  trip: Trip | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripActionSheet({ trip, isOpen, onOpenChange }: TripActionSheetProps) {
  const c = useAppTheme();
  const togglePin = useTripStore((s) => s.togglePin);
  const pinnedTripIds = useTripStore((s) => s.pinnedTripIds);
  const pinnedCount = useTripStore((s) => s.pinnedTrips.length);

  const [submitting, setSubmitting] = useState(false);

  const isPinned = trip ? pinnedTripIds.has(trip.id) : false;
  const atMax = pinnedCount >= MAX_PINNED_TRIPS && !isPinned;

  const handleToggle = async () => {
    if (!trip || submitting || atMax) return;
    setSubmitting(true);
    try {
      await togglePin(trip.id);
      hapticLight();
      showSuccess(isPinned ? 'Đã bỏ ghim' : 'Đã ghim chuyến đi');
      onOpenChange(false);
    } catch (err) {
      showError(err, 'Không thể thực hiện');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (submitting) return;
        onOpenChange(open);
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content>
          <BottomSheetView style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>{trip?.name ?? 'Chuyến đi'}</BottomSheet.Title>
              <AppText variant="caption" tone="muted">
                {isPinned
                  ? 'Đã ghim — bỏ ghim để xóa khỏi trang chủ'
                  : atMax
                    ? `Đã ghim ${MAX_PINNED_TRIPS} chuyến — bỏ ghim trước khi thêm`
                    : 'Ghim chuyến đi để truy cập nhanh từ trang chủ'}
              </AppText>
            </View>

            <View style={styles.actions}>
              <Button
                variant={isPinned ? 'secondary' : 'primary'}
                size="md"
                onPress={handleToggle}
                isDisabled={atMax || submitting || !trip}
              >
                {isPinned ? (
                  <PinOff size={18} color={c.foreground} strokeWidth={2} />
                ) : (
                  <Pin size={18} color={c.background} strokeWidth={2} />
                )}
                <Button.Label>
                  {submitting
                    ? 'Đang xử lý...'
                    : isPinned
                      ? 'Bỏ ghim'
                      : 'Ghim chuyến này'}
                </Button.Label>
              </Button>
            </View>
          </BottomSheetView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    paddingVertical: 8,
    gap: 6,
  },
  actions: {
    gap: 10,
  },
});
