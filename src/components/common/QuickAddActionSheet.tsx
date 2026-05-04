import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { Camera, ImageIcon, Pencil } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { getErrorMessage } from '../../utils/error';
import {
  type AvatarSource,
  pickAndProcessAvatar,
  type ProcessedAvatar,
} from '../../utils/imageProcessing';
import { AppText } from '../ui';
import { GroupTripPickerSheet } from './GroupTripPickerSheet';

interface QuickAddActionSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type SheetState =
  | { kind: 'choose' }
  | { kind: 'picking'; source: AvatarSource }
  | { kind: 'preview'; processed: ProcessedAvatar };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function QuickAddActionSheet({
  isOpen,
  onOpenChange,
}: QuickAddActionSheetProps) {
  const c = useAppTheme();
  const [state, setState] = useState<SheetState>({ kind: 'choose' });
  const [errorMsg, setErrorMsg] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerImage, setPickerImage] = useState<ProcessedAvatar | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setState({ kind: 'choose' });
      setErrorMsg('');
    }
  }, [isOpen]);

  const handlePick = async (source: AvatarSource) => {
    setErrorMsg('');
    setState({ kind: 'picking', source });
    try {
      const processed = await pickAndProcessAvatar(source);
      if (!processed) {
        setState({ kind: 'choose' });
        return;
      }
      setState({ kind: 'preview', processed });
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setState({ kind: 'choose' });
    }
  };

  const proceedToPicker = (image: ProcessedAvatar | null) => {
    setPickerImage(image);
    setPickerOpen(true);
    onOpenChange(false);
  };

  const handleManual = () => {
    proceedToPicker(null);
  };

  const handleContinue = () => {
    if (state.kind !== 'preview') return;
    proceedToPicker(state.processed);
  };

  const isPicking = state.kind === 'picking';
  const isPreview = state.kind === 'preview';

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (isPicking) return;
          onOpenChange(open);
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content enableDynamicSizing={false} snapPoints={['55%']}>
            <BottomSheetView style={styles.container}>
              <View style={styles.header}>
                <BottomSheet.Title>Thêm khoản chi mới</BottomSheet.Title>
              </View>

              {isPreview && state.kind === 'preview' ? (
                <View style={styles.previewBody}>
                  <View style={styles.previewImageWrap}>
                    <Image
                      source={{ uri: state.processed.uri }}
                      style={styles.previewImage}
                    />
                  </View>
                  <AppText variant="caption" tone="muted">
                    {state.processed.width}×{state.processed.width} •{' '}
                    {formatBytes(state.processed.sizeBytes)}
                  </AppText>

                  {errorMsg ? (
                    <View
                      style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}
                    >
                      <AppText variant="caption" tone="danger">
                        {errorMsg}
                      </AppText>
                    </View>
                  ) : null}

                  <View style={styles.actionsRow}>
                    <View style={styles.actionFlex}>
                      <Button
                        variant="secondary"
                        size="lg"
                        onPress={() => setState({ kind: 'choose' })}
                      >
                        <Button.Label>Đổi ảnh</Button.Label>
                      </Button>
                    </View>
                    <View style={styles.actionFlex}>
                      <Button variant="primary" size="lg" onPress={handleContinue}>
                        <Button.Label>Tiếp tục</Button.Label>
                      </Button>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.chooseBody}>
                  <AppText variant="caption" tone="muted" style={styles.hint}>
                    Chọn cách tạo khoản chi mới. Ảnh sẽ được đính kèm làm bằng
                    chứng (1:1, tối đa 2 MB).
                  </AppText>

                  {errorMsg ? (
                    <View
                      style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}
                    >
                      <AppText variant="caption" tone="danger">
                        {errorMsg}
                      </AppText>
                    </View>
                  ) : null}

                  {isPicking ? (
                    <View style={styles.busyRow}>
                      <ActivityIndicator color={c.foreground} />
                      <AppText variant="body" tone="muted">
                        Đang xử lý ảnh...
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
              )}
            </BottomSheetView>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>

      <GroupTripPickerSheet
        isOpen={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setPickerImage(null);
        }}
        image={pickerImage}
      />
    </>
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
      <View style={[styles.actionIcon, { backgroundColor: c.surface }]}>
        {icon}
      </View>
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
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionFlex: {
    flex: 1,
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
  previewBody: {
    paddingTop: 8,
    gap: 12,
    alignItems: 'center',
  },
  previewImageWrap: {
    width: 220,
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
  },
  previewImage: {
    width: 220,
    height: 220,
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
