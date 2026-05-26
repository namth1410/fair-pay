import { BottomSheetScrollView, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { Check, FileDown, UsersRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../hooks/useAppTheme';
import {
  type ExportScope,
  exportTripPdfAndShare,
} from '../../services/export.service';
import type { GroupMember } from '../../services/group.service';
import { getErrorMessage } from '../../utils/error';
import type { TripExportData } from '../../utils/exportHtml';
import { hapticLight } from '../../utils/haptics';
import { showWarning, showValidationError } from '../../utils/toast';
import { AppText, SectionTabs } from '../ui';

type Mode = 'group' | 'person';

interface ExportScopeSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Data builder — chỉ gọi khi user nhấn xuất, tránh build sớm khi sheet đóng. */
  getExportData: () => TripExportData;
  members: GroupMember[];
}

export function ExportScopeSheet({
  isOpen,
  onOpenChange,
  getExportData,
  members,
}: ExportScopeSheetProps) {
  const c = useAppTheme();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('group');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode('group');
    setSelectedMemberId(null);
    setBusy(false);
  }, [isOpen]);

  const handleExport = async () => {
    if (busy) return;
    let scope: ExportScope;
    if (mode === 'group') {
      scope = { type: 'group' };
    } else {
      if (!selectedMemberId) return;
      scope = { type: 'person', memberId: selectedMemberId };
    }
    setBusy(true);
    try {
      const data = getExportData();
      const shared = await exportTripPdfAndShare(data, scope);
      if (!shared) {
        showWarning(
          'Không thể chia sẻ',
          'Thiết bị không hỗ trợ chia sẻ file. Đã tạo PDF tạm.'
        );
      }
      hapticLight();
      onOpenChange(false);
    } catch (e: unknown) {
      showValidationError('Không tạo được PDF', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const canExport = mode === 'group' || !!selectedMemberId;

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (busy) return;
        onOpenChange(open);
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['75%', '95%']}
        >
          <BottomSheetView
            style={[
              styles.container,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.header}>
              <BottomSheet.Title>Xuất PDF diễn giải</BottomSheet.Title>
              <AppText variant="caption" tone="muted">
                Chia sẻ bản tóm tắt qua Zalo, email, hoặc lưu vào máy.
              </AppText>
            </View>

            <SectionTabs
              items={[
                { key: 'group', label: 'Cả nhóm' },
                { key: 'person', label: 'Một thành viên' },
              ]}
              selected={mode}
              onSelect={(k) => setMode(k as Mode)}
              centered
            />

            {mode === 'group' ? (
              <View style={styles.body}>
                <View
                  style={[
                    styles.infoCard,
                    { backgroundColor: c.surfaceAlt, borderColor: c.divider },
                  ]}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: c.primarySoft },
                    ]}
                  >
                    <UsersRound size={20} color={c.primary} strokeWidth={1.8} />
                  </View>
                  <View style={styles.infoText}>
                    <AppText variant="body" weight="semibold">
                      Diễn giải cho cả nhóm
                    </AppText>
                    <AppText variant="caption" tone="muted">
                      Bao gồm danh sách khoản chi, thanh toán đã ghi, số dư từng
                      người và gợi ý quyết toán.
                    </AppText>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.bodyList}>
                <AppText variant="caption" tone="muted" style={styles.listHint}>
                  Chọn người cần xem diễn giải. PDF sẽ ghi rõ từng khoản chi mà
                  họ đã trả hộ hoặc được trả hộ.
                </AppText>
                <BottomSheetScrollView
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {members.map((m) => {
                    const selected = m.id === selectedMemberId;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => {
                          hapticLight();
                          setSelectedMemberId(m.id);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Chọn ${m.display_name}`}
                        android_ripple={{ color: c.divider }}
                        style={({ pressed }) => [
                          styles.memberRow,
                          selected
                            ? {
                                backgroundColor: c.primarySoft,
                                borderColor: c.primary,
                              }
                            : {
                                backgroundColor: c.surfaceAlt,
                                borderColor: c.divider,
                              },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <View style={styles.memberMain}>
                          <AppText
                            variant="body"
                            weight={selected ? 'bold' : 'semibold'}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {m.display_name}
                          </AppText>
                          {m.is_virtual ? (
                            <AppText variant="meta" tone="muted">
                              Thành viên ảo
                            </AppText>
                          ) : null}
                        </View>
                        {selected ? (
                          <View
                            style={[
                              styles.checkChip,
                              { backgroundColor: c.primary },
                            ]}
                          >
                            <Check
                              size={14}
                              color={c.background}
                              strokeWidth={3}
                            />
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.checkChip,
                              styles.checkChipEmpty,
                              { borderColor: c.divider },
                            ]}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </BottomSheetScrollView>
              </View>
            )}

            <View style={styles.footer}>
              <Button
                variant="primary"
                size="lg"
                onPress={handleExport}
                isDisabled={busy || !canExport}
              >
                {busy ? (
                  <View style={styles.busyInline}>
                    <ActivityIndicator color={c.background} />
                    <Button.Label>Đang tạo PDF...</Button.Label>
                  </View>
                ) : (
                  <View style={styles.busyInline}>
                    <FileDown size={18} color={c.background} strokeWidth={2} />
                    <Button.Label>Xuất PDF</Button.Label>
                  </View>
                )}
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
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    paddingVertical: 8,
    gap: 4,
    paddingBottom: 12,
  },
  body: {
    paddingTop: 16,
  },
  bodyList: {
    flex: 1,
    paddingTop: 12,
  },
  listHint: {
    marginBottom: 10,
  },
  scrollContent: {
    paddingBottom: 8,
    gap: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  checkChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkChipEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  footer: {
    paddingTop: 14,
  },
  busyInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
