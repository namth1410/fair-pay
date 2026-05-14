import { useRouter } from 'expo-router';
import { Button, useToast } from 'heroui-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MyPendingInvitation } from '../../services/group.service';
import { useGroupStore } from '../../stores/group.store';
import { getErrorMessage } from '../../utils/error';
import { AppText, Avatar, BouncyDialog } from '../ui';

interface InvitationConfirmDialogProps {
  invitation: MyPendingInvitation | null;
  onClose: () => void;
}

export function InvitationConfirmDialog({
  invitation,
  onClose,
}: InvitationConfirmDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const respondToInvitationAction = useGroupStore((s) => s.respondToInvitationAction);

  const [acceptingBusy, setAcceptingBusy] = useState(false);
  const [decliningBusy, setDecliningBusy] = useState(false);

  const busy = acceptingBusy || decliningBusy;

  const handleResponse = async (action: 'accept' | 'decline') => {
    if (!invitation || busy) return;
    if (action === 'accept') setAcceptingBusy(true);
    else setDecliningBusy(true);

    try {
      const result = await respondToInvitationAction(invitation.invitation_id, action);
      onClose();
      if (action === 'accept') {
        toast.show({
          variant: 'success',
          label: `Đã vào nhóm ${result.group_name}`,
        });
        router.push(`/(main)/groups/${result.group_id}`);
      } else {
        toast.show({
          variant: 'accent',
          label: 'Đã từ chối lời mời',
        });
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e ?? '');
      // Race: admin revoked / user already responded từ device khác
      if (raw.includes('invitation_not_pending') || raw.includes('invitation_not_found')) {
        toast.show({
          variant: 'warning',
          label: 'Lời mời đã được xử lý',
          description: 'Có thể đã bị thu hồi hoặc trả lời ở thiết bị khác.',
        });
        onClose();
      } else {
        toast.show({
          variant: 'danger',
          label: 'Lỗi',
          description: getErrorMessage(e),
        });
      }
    } finally {
      setAcceptingBusy(false);
      setDecliningBusy(false);
    }
  };

  const isOpen = invitation !== null;

  return (
    <BouncyDialog
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      dismissOnBackdrop={!busy}
    >
      <BouncyDialog.Title>Lời mời tham gia nhóm</BouncyDialog.Title>

      {invitation ? (
        <View style={styles.body}>
          <View style={styles.groupRow}>
            <Avatar
              seed={invitation.group_id}
              label={invitation.group_name}
              photoUrl={invitation.group_avatar_url}
              size={56}
            />
            <View style={styles.groupInfo}>
              <AppText variant="title" weight="semibold" numberOfLines={1}>
                {invitation.group_name}
              </AppText>
              <AppText variant="caption" tone="muted">
                do {invitation.inviter_name} mời
              </AppText>
            </View>
          </View>
          <AppText variant="body" tone="muted" style={{ marginTop: 12 }}>
            Bạn có muốn tham gia nhóm này không?
          </AppText>
        </View>
      ) : null}

      <BouncyDialog.Actions>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => handleResponse('decline')}
          isDisabled={busy}
        >
          <Button.Label>
            {decliningBusy ? 'Đang xử lý...' : 'Từ chối'}
          </Button.Label>
        </Button>
        <Button
          variant="primary"
          size="sm"
          onPress={() => handleResponse('accept')}
          isDisabled={busy}
        >
          <Button.Label>
            {acceptingBusy ? 'Đang xử lý...' : 'Chấp nhận'}
          </Button.Label>
        </Button>
      </BouncyDialog.Actions>
    </BouncyDialog>
  );
}

const styles = StyleSheet.create({
  body: {
    marginBottom: 20,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  groupInfo: {
    flex: 1,
    minWidth: 0,
  },
});
