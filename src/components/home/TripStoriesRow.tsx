import { router } from 'expo-router';
import Plus from 'lucide-react-native/dist/esm/icons/plus';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
// ScrollView của gesture-handler (KHÔNG phải RN): tab Home nằm trong reanimated-tab-view
// có Pan ngang (kích hoạt ~10px) — ScrollView RN thường bị Pan đó cướp cử chỉ → vuốt hàng
// ghim lại nhảy sang tab Preset. Bản RNGH tham gia orchestrator nên giữ được cử chỉ cuộn.
import { ScrollView } from 'react-native-gesture-handler';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useTripStore } from '../../stores/trip.store';
import { hapticLight } from '../../utils/haptics';
import { AppText, Avatar } from '../ui';

// Hàng "story" kiểu app nhắn tin: mỗi chuyến đã ghim là 1 vòng tròn (viền xanh = đang mở,
// viền xám = đã đóng), chạm để vào thẳng luồng chuyến đi. Ghim tối đa MAX_PINNED_TRIPS nên
// hàng cuộn ngang; ô mở PinPickerSheet đứng ĐẦU hàng (như "Tin của bạn") để luôn bấm được
// dù ghim nhiều, chuyến vừa ghim nằm ngay sau nó (server xếp pin mới lên đầu).
const STORY_SIZE = 64;
const RING = 3;
const RING_GAP = 3;
const ITEM_WIDTH = 74;

interface TripStoriesRowProps {
  onPinPress: () => void;
}

export const TripStoriesRow = memo(function TripStoriesRow({
  onPinPress,
}: TripStoriesRowProps) {
  const c = useAppTheme();
  const pinnedTrips = useTripStore((s) => s.pinnedTrips);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <Pressable
        onPress={() => {
          hapticLight();
          onPinPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          pinnedTrips.length === 0 ? 'Ghim chuyến đi' : 'Sửa chuyến đi đã ghim'
        }
        style={styles.item}
      >
        <View style={[styles.addCircle, { borderColor: c.muted }]}>
          <Plus size={22} color={c.muted} strokeWidth={2.2} />
        </View>
        <AppText
          variant="meta"
          weight="medium"
          tone="muted"
          numberOfLines={1}
          style={styles.label}
        >
          {pinnedTrips.length === 0 ? 'Ghim chuyến' : 'Sửa ghim'}
        </AppText>
      </Pressable>

      {pinnedTrips.map((trip) => {
        const isClosed = trip.status === 'closed';
        return (
          <Pressable
            key={trip.id}
            onPress={() => {
              hapticLight();
              router.push(`/(main)/trips/${trip.id}` as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Chuyến ${trip.name}, nhóm ${trip.group_name}, ${isClosed ? 'đã đóng' : 'đang mở'}`}
            style={styles.item}
          >
            <View
              style={[
                styles.ring,
                { borderColor: isClosed ? c.divider : c.primary },
              ]}
            >
              <Avatar
                seed={trip.id}
                label={trip.name}
                size={STORY_SIZE - (RING + RING_GAP) * 2}
              />
            </View>
            <AppText
              variant="meta"
              weight="semibold"
              numberOfLines={1}
              style={styles.label}
            >
              {trip.name}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    gap: 6,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    gap: 6,
  },
  ring: {
    width: STORY_SIZE,
    height: STORY_SIZE,
    borderRadius: STORY_SIZE / 2,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircle: {
    width: STORY_SIZE,
    height: STORY_SIZE,
    borderRadius: STORY_SIZE / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    width: ITEM_WIDTH,
    textAlign: 'center',
  },
});
