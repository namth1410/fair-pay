import { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { BottomSheet } from 'heroui-native';
import { Camera, ImageIcon, Pencil } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { getErrorMessage } from '../../utils/error';
import { type AvatarSource, pickImage } from '../../utils/imageProcessing';
import { AppText } from '../ui';

interface QuickAddActionSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type SheetState = { kind: 'choose' } | { kind: 'picking'; source: AvatarSource };

export function QuickAddActionSheet({
  isOpen,
  onOpenChange,
}: QuickAddActionSheetProps) {
  const c = useAppTheme();
  const [state, setState] = useState<SheetState>({ kind: 'choose' });
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setState({ kind: 'choose' });
      setErrorMsg('');
    }
  }, [isOpen]);

  const navigateToForm = (image?: {
    uri: string;
    width: number;
    height: number;
    sizeBytes: number;
  }) => {
    const expenseId = Crypto.randomUUID();
    const params = new URLSearchParams();
    params.set('expenseId', expenseId);
    if (image) {
      params.set('imageUri', image.uri);
      params.set('imageSizeBytes', String(image.sizeBytes));
      params.set('imageWidth', String(image.width));
      params.set('imageHeight', String(image.height));
    }
    onOpenChange(false);
    router.push(`/expenses/new?${params.toString()}` as never);
  };

  const handlePick = async (source: AvatarSource) => {
    setErrorMsg('');
    setState({ kind: 'picking', source });
    try {
      const picked = await pickImage(source);
      if (!picked) {
        setState({ kind: 'choose' });
        return;
      }
      navigateToForm({
        uri: picked.uri,
        width: picked.width,
        height: picked.height,
        sizeBytes: picked.sizeBytes,
      });
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setState({ kind: 'choose' });
    }
  };

  const handleManual = () => {
    navigateToForm();
  };

  const isPicking = state.kind === 'picking';

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (isPicking) return;
        onOpenChange(open);
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content>
          <BottomSheetView style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>Thêm khoản chi mới</BottomSheet.Title>
            </View>

            <View style={styles.chooseBody}>
              <AppText variant="caption" tone="muted" style={styles.hint}>
                Chọn cách tạo khoản chi mới. Ảnh sẽ được đính kèm làm bằng chứng
                (1:1, tối đa 2 MB).
              </AppText>

              {errorMsg ? (
                <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                  <AppText variant="caption" tone="danger">
                    {errorMsg}
                  </AppText>
                </View>
              ) : null}

              {isPicking ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator color={c.foreground} />
                  <AppText variant="body" tone="muted">
                    Đang mở...
                  </AppText>
                </View>
              ) : (
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
                  <ActionRow
                    icon={<Pencil size={22} color={c.foreground} strokeWidth={1.9} />}
                    label="Nhập thủ công"
                    sublabel="Tạo khoản chi không cần ảnh"
                    onPress={handleManual}
                    c={c}
                  />
                </View>
              )}
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
}

function ActionRow({ icon, label, sublabel, onPress, c }: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: c.divider }}
      style={({ pressed }) => [
        styles.actionRow,
        {
          backgroundColor: c.surfaceAlt,
          borderColor: c.divider,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.surface }]}>{icon}</View>
      <View style={styles.actionTextWrap}>
        <AppText variant="body" weight="semibold">
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
  hint: {
    marginBottom: 4,
  },
  chooseBody: {
    paddingTop: 8,
    gap: 14,
  },
  actionsCol: {
    gap: 10,
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
  errorBox: {
    padding: 12,
    borderRadius: 10,
    alignSelf: 'stretch',
  },
  busyRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
});
