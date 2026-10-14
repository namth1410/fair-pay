import Check from 'lucide-react-native/dist/esm/icons/check';
import Minus from 'lucide-react-native/dist/esm/icons/minus';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { hapticLight } from '../../utils/haptics';
import { AppText, Avatar } from '../ui';

// Chọn 1 thành viên bằng hàng avatar cuộn ngang (giao diện "Hội thoại" — thay ChipPicker chữ
// ở mục "Ai trả?"). Avatar được chọn có viền màu thương hiệu + dấu tích. Option có key bắt đầu
// bằng "__" (vd "__none__" = Không chọn) hiện vòng tròn nét đứt thay avatar.
const AVATAR = 46;
const ITEM_WIDTH = 64;

interface MemberAvatarPickerProps {
  options: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
  accessibilityLabel?: string;
}

export const MemberAvatarPicker = memo(function MemberAvatarPicker({
  options,
  selected,
  onSelect,
  accessibilityLabel = 'Người trả',
}: MemberAvatarPickerProps) {
  const c = useAppTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => {
        const isSelected = o.key === selected;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (isSelected) return;
              hapticLight();
              onSelect(o.key);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={o.label}
            style={styles.item}
          >
            <View
              style={[
                styles.ring,
                { borderColor: isSelected ? c.primary : 'transparent' },
              ]}
            >
              {o.key.startsWith('__') ? (
                <View style={[styles.placeholder, { borderColor: c.muted }]}>
                  <Minus size={20} color={c.muted} strokeWidth={2.2} />
                </View>
              ) : (
                <Avatar seed={o.key} label={o.label} size={AVATAR} />
              )}
              {isSelected ? (
                <View style={[styles.badge, { backgroundColor: c.primary, borderColor: c.surface }]}>
                  <Check size={11} color={c.inverseForeground} strokeWidth={3.5} />
                </View>
              ) : null}
            </View>
            <AppText
              variant="meta"
              weight={isSelected ? 'bold' : 'medium'}
              numberOfLines={1}
              style={[styles.label, { color: isSelected ? c.primary : c.muted }]}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    gap: 4,
    paddingVertical: 2,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    gap: 4,
  },
  ring: {
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: (AVATAR + 8) / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    width: ITEM_WIDTH,
    textAlign: 'center',
  },
});
