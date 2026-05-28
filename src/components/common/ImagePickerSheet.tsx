import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet } from 'heroui-native';
import Camera from 'lucide-react-native/dist/esm/icons/camera';
import ImageIcon from 'lucide-react-native/dist/esm/icons/image';
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { AvatarSource } from '../../utils/imageProcessing';
import { AppText } from '../ui';

interface ImagePickerSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (source: AvatarSource) => void;
  onRemove?: () => void;
  showRemove?: boolean;
}

export function ImagePickerSheet({
  isOpen,
  onOpenChange,
  onPick,
  onRemove,
  showRemove = false,
}: ImagePickerSheetProps) {
  const c = useAppTheme();

  const handlePick = (source: AvatarSource) => {
    onOpenChange(false);
    onPick(source);
  };

  const handleRemove = () => {
    onOpenChange(false);
    onRemove?.();
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content enableDynamicSizing snapPoints={undefined}>
          <BottomSheetView style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>
                {showRemove ? 'Đổi ảnh' : 'Thêm ảnh'}
              </BottomSheet.Title>
            </View>

            <View style={styles.actionsCol}>
              <ActionRow
                icon={<Camera size={22} color={c.foreground} strokeWidth={1.9} />}
                label="Chụp ảnh"
                sublabel="Mở camera để chụp hoá đơn"
                onPress={() => handlePick('camera')}
                c={c}
              />
              <ActionRow
                icon={<ImageIcon size={22} color={c.foreground} strokeWidth={1.9} />}
                label="Chọn từ thư viện"
                sublabel="Lấy ảnh có sẵn trên máy"
                onPress={() => handlePick('library')}
                c={c}
              />
              {showRemove && onRemove ? (
                <ActionRow
                  icon={<Trash2 size={22} color={c.danger} strokeWidth={1.9} />}
                  label="Bỏ ảnh"
                  sublabel="Tạo khoản chi không có ảnh đính kèm"
                  onPress={handleRemove}
                  c={c}
                  danger
                />
              ) : null}
            </View>
          </BottomSheetView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onPress: () => void;
  c: ReturnType<typeof useAppTheme>;
  danger?: boolean;
}

function ActionRow({ icon, label, sublabel, onPress, c, danger }: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: c.divider }}
      style={({ pressed }) => [
        styles.actionRow,
        {
          backgroundColor: c.surface,
          borderColor: c.divider,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.surfaceAlt }]}>
        {icon}
      </View>
      <View style={styles.actionTextWrap}>
        <AppText
          variant="body"
          weight="semibold"
          tone={danger ? 'danger' : undefined}
        >
          {label}
        </AppText>
        <AppText variant="caption" tone="muted">
          {sublabel}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    paddingVertical: 8,
  },
  actionsCol: {
    gap: 10,
    paddingTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
