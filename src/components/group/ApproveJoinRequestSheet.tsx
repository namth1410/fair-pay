import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { GroupMember, JoinRequest } from '../../services/group.service';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { showSuccess } from '../../utils/toast';
import { AppText, ChipPicker } from '../ui';

const NEW_MEMBER_KEY = '__new__';

interface ApproveJoinRequestSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  request: JoinRequest | null;
  groupId: string;
  /** Thành viên ảo active có thể được nhận (claim) — đã lọc is_virtual && !left_at. */
  claimableMembers: GroupMember[];
}

/**
 * Admin duyệt yêu cầu tham gia, chọn: thêm thành viên mới HOẶC gán requester vào
 * một thành viên ảo đã có (kế thừa số dư/lịch sử). Default theo gợi ý người join.
 */
export function ApproveJoinRequestSheet({
  isOpen,
  onOpenChange,
  request,
  groupId,
  claimableMembers,
}: ApproveJoinRequestSheetProps) {
  const c = useAppTheme();
  const approveRequest = useGroupStore((s) => s.approveRequest);

  const [selected, setSelected] = useState<string>(NEW_MEMBER_KEY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // Default theo gợi ý của người join nếu slot còn khả dụng
    const claim = request?.claim_member_id;
    const valid = !!claim && claimableMembers.some((m) => m.id === claim);
    setSelected(valid ? (claim as string) : NEW_MEMBER_KEY);
    setBusy(false);
    setFormError('');
  }, [isOpen, request, claimableMembers]);

  const options = [
    { key: NEW_MEMBER_KEY, label: 'Thành viên mới' },
    ...claimableMembers.map((m) => ({ key: m.id, label: m.display_name })),
  ];

  const selectedMember = claimableMembers.find((m) => m.id === selected) ?? null;

  const handleApprove = async () => {
    if (!request || busy) return;
    setBusy(true);
    setFormError('');
    try {
      await approveRequest(
        request.id,
        groupId,
        selected === NEW_MEMBER_KEY ? null : selected
      );
      onOpenChange(false);
      showSuccess('Đã duyệt yêu cầu');
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['50%', '90%']}
        >
          <BottomSheetView style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>Duyệt yêu cầu</BottomSheet.Title>
            </View>

            <View style={styles.body}>
              <AppText variant="body" weight="semibold">
                {request?.display_name ?? ''} muốn tham gia nhóm
              </AppText>
              <AppText variant="caption" tone="muted">
                Duyệt là thành viên mới, hoặc gán họ vào một thành viên ảo đã có để
                kế thừa toàn bộ số dư & lịch sử.
              </AppText>

              <ChipPicker
                options={options}
                selected={selected}
                onSelect={setSelected}
              />

              {selectedMember ? (
                <View style={[styles.infoBox, { backgroundColor: c.accentSoft }]}>
                  <AppText variant="caption" tone="primary">
                    {request?.display_name} sẽ thay thế “{selectedMember.display_name}”
                    và kế thừa toàn bộ số dư, khoản chi, thanh toán đã ghi.
                  </AppText>
                </View>
              ) : null}

              {formError ? (
                <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                  <AppText variant="caption" tone="danger">
                    {formError}
                  </AppText>
                </View>
              ) : null}

              <Button
                variant="primary"
                size="lg"
                onPress={handleApprove}
                isDisabled={busy || !request}
              >
                <Button.Label>{busy ? 'Đang duyệt...' : 'Duyệt'}</Button.Label>
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
  },
  header: {
    paddingVertical: 8,
  },
  body: {
    paddingTop: 4,
    gap: 14,
  },
  infoBox: {
    padding: 12,
    borderRadius: 10,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
});
